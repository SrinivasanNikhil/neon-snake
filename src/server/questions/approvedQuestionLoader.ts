import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { QuestionBankSchema, type QuestionWithAnswer } from '../../shared/questionSchema';

const ApprovedQuestionIndexSchema = z.object({
  schemaVersion: z.literal(1),
  questionCount: z.number().int().min(0),
  checksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  questions: QuestionBankSchema,
}).superRefine((index, context) => {
  if (index.questionCount !== index.questions.length) {
    context.addIssue({ code: 'custom', path: ['questionCount'], message: 'question count does not match index content' });
  }
  if (index.questions.some(({ status }) => status !== 'approved')) {
    context.addIssue({ code: 'custom', path: ['questions'], message: 'runtime index may contain approved questions only' });
  }
});

export function loadApprovedQuestions(
  indexPath = path.resolve('content/questions/index.json'),
): QuestionWithAnswer[] {
  let source: string;
  try {
    source = readFileSync(indexPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const index = ApprovedQuestionIndexSchema.parse(JSON.parse(source) as unknown);
  const checksum = `sha256:${createHash('sha256').update(stableStringify(index.questions)).digest('hex')}`;
  if (checksum !== index.checksum) throw new Error('approved question index checksum does not match its content');
  return index.questions;
}

function stableStringify(value: unknown): string {
  const sortJson = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(sortJson);
    if (entry && typeof entry === 'object') {
      return Object.fromEntries(
        Object.entries(entry as Record<string, unknown>)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, nested]) => [key, sortJson(nested)]),
      );
    }
    return entry;
  };
  return JSON.stringify(sortJson(value), null, 2);
}
