import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { QuestionSchema, type QuestionWithAnswer } from '../../../src/shared/questionSchema.ts';
import { readJsonFile } from './json.ts';

export async function listJsonFiles(directory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

export async function readQuestionFile(filePath: string): Promise<QuestionWithAnswer[]> {
  const raw = await readJsonFile(filePath);
  const candidates = Array.isArray(raw) ? raw : [raw];
  return candidates.map((candidate) => QuestionSchema.parse(candidate));
}

export function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  );
}
