import { access, unlink } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { QuestionSchema, type QuestionWithAnswer } from '../../../src/shared/questionSchema.ts';
import { loadCorpus } from './corpus.ts';
import { isMissingFileError, listJsonFiles, readQuestionFile } from './files.ts';
import { checksumJson, readJsonFile, writeJsonAtomic } from './json.ts';
import type { QuestionWorkspacePaths } from './paths.ts';
import { formatValidationIssues, validateQuestion } from './validation.ts';

export const ReviewRecordSchema = z.object({
  schemaVersion: z.literal(1),
  questionId: z.string(),
  decision: z.literal('approved'),
  reviewer: z.string().trim().min(2).max(120),
  reviewedAt: z.string().datetime(),
  notes: z.string().trim().min(10).max(2_000),
  sourceDraft: z.string().trim().min(1),
  sourceDraftChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  approvedQuestionChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
});

export type ReviewRecord = z.infer<typeof ReviewRecordSchema>;

export type ApproveQuestionOptions = {
  paths: QuestionWorkspacePaths;
  questionId: string;
  reviewer: string;
  notes: string;
  confirmHumanReview: boolean;
  now?: () => Date;
};

export async function approveQuestion(options: ApproveQuestionOptions): Promise<{
  questionPath: string;
  reviewPath: string;
  question: QuestionWithAnswer;
  review: ReviewRecord;
}> {
  if (!options.confirmHumanReview) {
    throw new Error('Approval requires --confirm-human-review after a person reviews the draft.');
  }
  const reviewer = options.reviewer.trim();
  if (reviewer.length < 2) {
    throw new Error('Approval requires an explicit reviewer name.');
  }
  if (/^(?:ai|openai|chatgpt|model|automated)$/i.test(reviewer)) {
    throw new Error('Reviewer metadata must identify a human reviewer, not a model or automation.');
  }
  const notes = options.notes.trim();
  if (notes.length < 10) {
    throw new Error('Approval requires review notes of at least 10 characters.');
  }

  const draftMatches: Array<{ file: string; question: QuestionWithAnswer }> = [];
  for (const file of await listJsonFiles(options.paths.draftsDir)) {
    for (const question of await readQuestionFile(file)) {
      if (question.id === options.questionId) draftMatches.push({ file, question });
    }
  }

  if (draftMatches.length !== 1) {
    throw new Error(
      draftMatches.length === 0
        ? `No draft question found with ID ${options.questionId}.`
        : `Multiple draft questions found with ID ${options.questionId}.`,
    );
  }

  const [{ file: draftFile, question: draftQuestion }] = draftMatches;
  if (draftQuestion.status !== 'draft') {
    throw new Error('Only draft questions can be approved.');
  }

  const approvedQuestion = QuestionSchema.parse({
    ...draftQuestion,
    status: 'approved',
  });
  const corpus = await loadCorpus(options.paths);
  const issues = validateQuestion(approvedQuestion, corpus, draftFile);
  if (issues.length) {
    throw new Error(`Question failed validation:\n${formatValidationIssues(issues)}`);
  }

  const questionPath = path.join(options.paths.approvedDir, `${approvedQuestion.id}.json`);
  const reviewPath = path.join(options.paths.reviewsDir, `${approvedQuestion.id}.json`);
  await assertAbsent(questionPath);
  await assertAbsent(reviewPath);

  const review = ReviewRecordSchema.parse({
    schemaVersion: 1,
    questionId: approvedQuestion.id,
    decision: 'approved',
    reviewer,
    reviewedAt: (options.now ?? (() => new Date()))().toISOString(),
    notes,
    sourceDraft: path.relative(options.paths.rootDir, draftFile),
    sourceDraftChecksum: checksumJson(draftQuestion),
    approvedQuestionChecksum: checksumJson(approvedQuestion),
  });

  await writeJsonAtomic(reviewPath, review);
  try {
    await writeJsonAtomic(questionPath, approvedQuestion);
  } catch (error) {
    await unlink(reviewPath).catch(() => undefined);
    throw new Error(
      `Approval files could not be committed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return { questionPath, reviewPath, question: approvedQuestion, review };
}

export async function loadVerifiedReview(
  paths: QuestionWorkspacePaths,
  question: QuestionWithAnswer,
): Promise<ReviewRecord> {
  const reviewPath = path.join(paths.reviewsDir, `${question.id}.json`);
  const review = ReviewRecordSchema.parse(await readJsonFile(reviewPath));
  if (
    review.questionId !== question.id ||
    review.approvedQuestionChecksum !== checksumJson(question)
  ) {
    throw new Error(`Review metadata does not match approved question ${question.id}.`);
  }

  const sourceDraftPath = path.resolve(paths.rootDir, review.sourceDraft);
  if (!sourceDraftPath.startsWith(`${path.resolve(paths.rootDir)}${path.sep}`)) {
    throw new Error(`Review metadata for ${question.id} points outside the workspace.`);
  }
  const sourceQuestion = (await readQuestionFile(sourceDraftPath)).find(
    ({ id }) => id === question.id,
  );
  if (!sourceQuestion || checksumJson(sourceQuestion) !== review.sourceDraftChecksum) {
    throw new Error(`Review metadata does not match the source draft for ${question.id}.`);
  }
  return review;
}

async function assertAbsent(filePath: string): Promise<void> {
  try {
    await access(filePath);
  } catch (error) {
    if (isMissingFileError(error)) return;
    throw error;
  }
  throw new Error(`Refusing to overwrite existing file ${filePath}.`);
}
