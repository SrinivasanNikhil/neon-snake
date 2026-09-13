import { cp, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { QuestionWithAnswer } from '../../src/shared/questionSchema.ts';
import { createQuestionWorkspacePaths } from './lib/paths.ts';

const sourcePaths = createQuestionWorkspacePaths();

export async function createTemporaryQuestionWorkspace() {
  const rootDir = await mkdtemp(path.join(tmpdir(), 'neon-snake-questions-'));
  const paths = createQuestionWorkspacePaths(rootDir);
  await cp(sourcePaths.corpusDir, paths.corpusDir, { recursive: true });
  await mkdir(path.dirname(paths.promptPath), { recursive: true });
  await cp(sourcePaths.promptPath, paths.promptPath);
  await mkdir(paths.draftsDir, { recursive: true });
  await mkdir(paths.approvedDir, { recursive: true });
  await mkdir(paths.reviewsDir, { recursive: true });
  return paths;
}

export function validQuestion(overrides: Partial<QuestionWithAnswer> = {}): QuestionWithAnswer {
  return {
    schemaVersion: 1,
    id: 'ch03-curated-test-1',
    chapter: 3,
    conceptIds: ['ch03-select-filter'],
    kind: 'sql-reading',
    difficulty: 2,
    prompt: 'Which predicate returns only rows with a price greater than 20?',
    options: [
      { id: 'a', text: 'WHERE price > 20' },
      { id: 'b', text: 'ORDER BY price > 20' },
      { id: 'c', text: 'SELECT price > 20' },
      { id: 'd', text: 'GROUP BY price > 20' },
    ],
    correctOptionId: 'a',
    explanation: 'WHERE restricts rows before the selected columns are returned.',
    reviewConcept: 'Review row restriction with WHERE.',
    source: {
      url: 'https://www.richardtwatson.com/open/Reader/_book/203-singleentity.html#querying-a-single-table-database',
      title: 'The Single Entity',
      section: 'Querying a single-table database',
    },
    provenance: 'curated',
    status: 'draft',
    ...overrides,
  };
}

export function aiDraftQuestion(overrides: Partial<QuestionWithAnswer> = {}): QuestionWithAnswer {
  return validQuestion({
    id: 'ch03-ai-test-run-1',
    provenance: 'ai-generated',
    generation: {
      promptVersion: 'questions-v1',
      model: 'test-model',
      generatedAt: '2026-08-11T12:00:00.000Z',
      runId: 'test-run',
    },
    ...overrides,
  });
}

export async function writeDraft(
  directory: string,
  questions: QuestionWithAnswer[],
): Promise<string> {
  const file = path.join(directory, 'draft-test.json');
  await writeFile(file, `${JSON.stringify(questions, null, 2)}\n`, 'utf8');
  return file;
}
