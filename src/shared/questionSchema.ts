import { z } from 'zod';

const identifier = z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,79}$/i);

export const QuestionOptionSchema = z.object({
  id: identifier,
  text: z.string().trim().min(1).max(500),
});

export const QuestionSourceSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => new URL(value).hostname === 'www.richardtwatson.com', {
      message: 'source URL must use www.richardtwatson.com',
    }),
  title: z.string().trim().min(1).max(200),
  section: z.string().trim().min(1).max(200),
});

export const QuestionGenerationMetadataSchema = z.object({
  promptVersion: identifier,
  model: z.string().trim().min(1).max(100),
  generatedAt: z.string().datetime(),
  runId: identifier,
});

export const QuestionSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: identifier,
    chapter: z.number().int().min(3).max(10),
    conceptIds: z.array(identifier).min(1).max(12),
    kind: z.enum(['concept', 'sql-reading', 'sql-scenario']),
    difficulty: z.number().int().min(1).max(5),
    prompt: z.string().trim().min(10).max(1_500),
    options: z.array(QuestionOptionSchema).length(4),
    correctOptionId: identifier,
    explanation: z.string().trim().min(10).max(2_000),
    reviewConcept: z.string().trim().min(1).max(300),
    source: QuestionSourceSchema,
    provenance: z.enum(['curated', 'ai-generated']),
    status: z.enum(['draft', 'approved', 'rejected']),
    generation: QuestionGenerationMetadataSchema.optional(),
  })
  .superRefine((question, context) => {
    const optionIds = question.options.map(({ id }) => id);
    if (new Set(optionIds).size !== optionIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'option IDs must be unique',
      });
    }

    const normalizedOptionText = question.options.map(({ text }) =>
      text.trim().toLocaleLowerCase(),
    );
    if (new Set(normalizedOptionText).size !== normalizedOptionText.length) {
      context.addIssue({
        code: 'custom',
        path: ['options'],
        message: 'option text must be unique',
      });
    }

    if (!optionIds.includes(question.correctOptionId)) {
      context.addIssue({
        code: 'custom',
        path: ['correctOptionId'],
        message: 'correctOptionId must match exactly one option',
      });
    }

    if (question.provenance === 'ai-generated' && !question.generation) {
      context.addIssue({
        code: 'custom',
        path: ['generation'],
        message: 'AI-generated questions require generation metadata',
      });
    }
  });

export const QuestionBankSchema = z.array(QuestionSchema).superRefine((questions, context) => {
  const ids = new Set<string>();
  const prompts = new Set<string>();

  questions.forEach((question, index) => {
    if (ids.has(question.id)) {
      context.addIssue({
        code: 'custom',
        path: [index, 'id'],
        message: 'question IDs must be unique across a bank',
      });
    }
    ids.add(question.id);

    const normalizedPrompt = question.prompt.trim().toLocaleLowerCase();
    if (prompts.has(normalizedPrompt)) {
      context.addIssue({
        code: 'custom',
        path: [index, 'prompt'],
        message: 'question prompts must be unique across a bank',
      });
    }
    prompts.add(normalizedPrompt);
  });
});

export type QuestionWithAnswer = z.infer<typeof QuestionSchema>;
export type QuestionBank = z.infer<typeof QuestionBankSchema>;

export type ClientQuestion = Pick<
  QuestionWithAnswer,
  'id' | 'chapter' | 'conceptIds' | 'kind' | 'difficulty' | 'prompt' | 'options'
>;

export type QuestionFeedback = Pick<
  QuestionWithAnswer,
  'correctOptionId' | 'explanation' | 'reviewConcept' | 'source'
>;

export function sanitizeQuestion(question: QuestionWithAnswer): ClientQuestion {
  return {
    id: question.id,
    chapter: question.chapter,
    conceptIds: [...question.conceptIds],
    kind: question.kind,
    difficulty: question.difficulty,
    prompt: question.prompt,
    options: question.options.map((option) => ({ ...option })),
  };
}

export function questionFeedback(question: QuestionWithAnswer): QuestionFeedback {
  return {
    correctOptionId: question.correctOptionId,
    explanation: question.explanation,
    reviewConcept: question.reviewConcept,
    source: { ...question.source },
  };
}
