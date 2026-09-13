import path from 'node:path';
import { QuestionSchema, type QuestionWithAnswer } from '../../../src/shared/questionSchema.ts';
import { conceptIdsForChapter, type LoadedCorpus, assertCanonicalWatsonUrl } from './corpus.ts';
import { listJsonFiles, readQuestionFile } from './files.ts';
import type { QuestionWorkspacePaths } from './paths.ts';

export type ValidationIssue = {
  file?: string;
  questionId?: string;
  message: string;
};

const ambiguousOptionPatterns = [
  /^(?:all|none) of (?:the )?(?:above|these|those)$/i,
  /^(?:both|neither) [a-d](?: and | nor )[a-d]$/i,
  /^all answers are correct$/i,
  /^no answers are correct$/i,
];

export function normalizeComparableText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateQuestion(
  rawQuestion: unknown,
  corpus: LoadedCorpus,
  file?: string,
): ValidationIssue[] {
  const parsed = QuestionSchema.safeParse(rawQuestion);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      file,
      message: `${issue.path.join('.') || 'question'}: ${issue.message}`,
    }));
  }

  const question = parsed.data;
  const issues: ValidationIssue[] = [];
  const base = { file, questionId: question.id };
  const chapter = corpus.chapters.get(question.chapter);

  if (!chapter) {
    return [{ ...base, message: `Chapter ${question.chapter} is absent from the corpus.` }];
  }

  const validConceptIds = conceptIdsForChapter(chapter);
  for (const conceptId of question.conceptIds) {
    if (!validConceptIds.has(conceptId)) {
      issues.push({ ...base, message: `Concept ${conceptId} does not belong to chapter ${question.chapter}.` });
    }
  }

  try {
    assertCanonicalWatsonUrl(question.source.url);
  } catch (error) {
    issues.push({ ...base, message: errorMessage(error) });
  }

  const matchingSection = chapter.sections.find(
    (section) =>
      section.title === question.source.section &&
      section.sourceUrl === question.source.url,
  );

  if (question.source.title !== chapter.title) {
    issues.push({ ...base, message: `Source title must be exactly "${chapter.title}".` });
  }

  if (!matchingSection) {
    issues.push({
      ...base,
      message: 'Source URL and section must exactly match a section in the selected chapter card.',
    });
  }

  if (matchingSection) {
    const sectionConcepts = new Set(matchingSection.concepts.map(({ id }) => id));
    for (const conceptId of question.conceptIds) {
      if (!sectionConcepts.has(conceptId)) {
        issues.push({
          ...base,
          message: `Concept ${conceptId} is not supported by the cited source section.`,
        });
      }
    }
  }

  const correctOptions = question.options.filter(
    ({ id }) => id === question.correctOptionId,
  );
  if (correctOptions.length !== 1) {
    issues.push({ ...base, message: 'Question must identify exactly one correct option.' });
  }

  const normalizedOptions = question.options.map(({ text }) => normalizeComparableText(text));
  if (new Set(normalizedOptions).size !== normalizedOptions.length) {
    issues.push({ ...base, message: 'Options must remain distinct after punctuation and case normalization.' });
  }

  question.options.forEach(({ text }, index) => {
    const normalized = normalizeComparableText(text);
    if (ambiguousOptionPatterns.some((pattern) => pattern.test(normalized))) {
      issues.push({ ...base, message: `Option ${index + 1} uses a forbidden all/none/combined-answer pattern.` });
    }
  });

  return issues;
}

export function validateQuestionCollection(
  questions: QuestionWithAnswer[],
  corpus: LoadedCorpus,
  filesById = new Map<string, string>(),
): ValidationIssue[] {
  const issues = questions.flatMap((question) =>
    validateQuestion(question, corpus, filesById.get(question.id)),
  );
  const ids = new Map<string, QuestionWithAnswer>();
  const stems = new Map<string, QuestionWithAnswer>();

  for (const question of questions) {
    const existingId = ids.get(question.id);
    if (existingId) {
      issues.push({
        file: filesById.get(question.id),
        questionId: question.id,
        message: `Duplicate question ID ${question.id}.`,
      });
    } else {
      ids.set(question.id, question);
    }

    const normalizedStem = normalizeComparableText(question.prompt);
    const existingStem = stems.get(normalizedStem);
    if (existingStem) {
      issues.push({
        file: filesById.get(question.id),
        questionId: question.id,
        message: `Question stem duplicates ${existingStem.id} after normalization.`,
      });
    } else {
      stems.set(normalizedStem, question);
    }
  }

  return issues;
}

export async function loadWorkspaceQuestions(paths: QuestionWorkspacePaths): Promise<{
  questions: QuestionWithAnswer[];
  filesById: Map<string, string>;
}> {
  const approvedFiles = await listJsonFiles(paths.approvedDir);
  const draftFiles = await listJsonFiles(paths.draftsDir);
  const approved: QuestionWithAnswer[] = [];
  const drafts: QuestionWithAnswer[] = [];
  const filesById = new Map<string, string>();

  for (const file of approvedFiles) {
    for (const question of await readQuestionFile(file)) {
      if (question.status !== 'approved') {
        throw new Error(`${relativeFile(paths, file)} contains a non-approved question.`);
      }
      approved.push(question);
      filesById.set(question.id, relativeFile(paths, file));
    }
  }

  const approvedIds = new Set(approved.map(({ id }) => id));
  for (const file of draftFiles) {
    for (const question of await readQuestionFile(file)) {
      if (question.status !== 'draft') {
        throw new Error(`${relativeFile(paths, file)} contains a non-draft question.`);
      }
      if (!approvedIds.has(question.id)) {
        drafts.push(question);
        filesById.set(question.id, relativeFile(paths, file));
      }
    }
  }

  return { questions: [...approved, ...drafts], filesById };
}

export async function validateWorkspace(
  paths: QuestionWorkspacePaths,
  corpus: LoadedCorpus,
): Promise<ValidationIssue[]> {
  const { questions, filesById } = await loadWorkspaceQuestions(paths);
  return validateQuestionCollection(questions, corpus, filesById);
}

export function formatValidationIssues(issues: ValidationIssue[]): string {
  return issues
    .map((issue) => {
      const location = [issue.file, issue.questionId].filter(Boolean).join(' :: ');
      return `${location ? `${location}: ` : ''}${issue.message}`;
    })
    .join('\n');
}

function relativeFile(paths: QuestionWorkspacePaths, file: string): string {
  return path.relative(paths.rootDir, file);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
