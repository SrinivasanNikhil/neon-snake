import { QuestionBankSchema, type QuestionWithAnswer } from '../../../src/shared/questionSchema.ts';
import { loadCorpus } from './corpus.ts';
import { listJsonFiles, readQuestionFile } from './files.ts';
import { checksumJson, writeJsonAtomic } from './json.ts';
import type { QuestionWorkspacePaths } from './paths.ts';
import { loadVerifiedReview } from './approval.ts';
import { formatValidationIssues, validateQuestionCollection } from './validation.ts';

export type QuestionIndex = {
  schemaVersion: 1;
  questionCount: number;
  checksum: string;
  questions: QuestionWithAnswer[];
};

export async function buildApprovedIndex(
  paths: QuestionWorkspacePaths,
): Promise<QuestionIndex> {
  const questions: QuestionWithAnswer[] = [];
  const filesById = new Map<string, string>();

  for (const file of await listJsonFiles(paths.approvedDir)) {
    for (const question of await readQuestionFile(file)) {
      if (question.status !== 'approved') {
        throw new Error(`Approved directory contains non-approved question ${question.id}.`);
      }
      questions.push(question);
      filesById.set(question.id, file);
    }
  }

  questions.sort(
    (left, right) =>
      left.chapter - right.chapter ||
      left.difficulty - right.difficulty ||
      left.id.localeCompare(right.id),
  );
  QuestionBankSchema.parse(questions);

  const corpus = await loadCorpus(paths);
  const issues = validateQuestionCollection(questions, corpus, filesById);
  if (issues.length) {
    throw new Error(`Approved question bank failed validation:\n${formatValidationIssues(issues)}`);
  }

  for (const question of questions) {
    await loadVerifiedReview(paths, question);
  }

  const index: QuestionIndex = {
    schemaVersion: 1,
    questionCount: questions.length,
    checksum: checksumJson(questions),
    questions,
  };
  await writeJsonAtomic(paths.indexPath, index);
  return index;
}
