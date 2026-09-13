import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { QuestionSchema, type QuestionWithAnswer } from '../../../src/shared/questionSchema.ts';
import { conceptIdsForChapter, loadCorpus } from './corpus.ts';
import { writeJsonAtomic } from './json.ts';
import { loadWorkspaceQuestions, validateQuestionCollection } from './validation.ts';
import type { QuestionWorkspacePaths } from './paths.ts';

const DraftCandidateSchema = z.object({
  conceptIds: z.array(z.string()).min(1).max(12),
  kind: z.enum(['concept', 'sql-reading', 'sql-scenario']),
  difficulty: z.number().int().min(1).max(5),
  prompt: z.string().trim().min(10).max(1_500),
  options: z.array(
    z.object({
      id: z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,79}$/i),
      text: z.string().trim().min(1).max(500),
    }),
  ).length(4),
  correctOptionId: z.string(),
  explanation: z.string().trim().min(10).max(2_000),
  reviewConcept: z.string().trim().min(1).max(300),
  source: z.object({
    url: z.string().url(),
    title: z.string().trim().min(1).max(200),
    section: z.string().trim().min(1).max(200),
  }),
});

const DraftBatchResponseSchema = z.object({
  questions: z.array(DraftCandidateSchema).min(1).max(20),
});

export type CreateResponse = (
  params: ResponseCreateParamsNonStreaming,
) => Promise<{ output_text: string }>;

export type GenerateDraftsOptions = {
  paths: QuestionWorkspacePaths;
  chapter: number;
  count: number;
  model: string;
  createResponse: CreateResponse;
  conceptIds?: string[];
  now?: () => Date;
  createRunId?: () => string;
};

export async function generateDrafts(options: GenerateDraftsOptions): Promise<{
  outputPath: string;
  questions: QuestionWithAnswer[];
  request: ResponseCreateParamsNonStreaming;
}> {
  if (!Number.isInteger(options.count) || options.count < 1 || options.count > 20) {
    throw new Error('Question count must be an integer from 1 through 20.');
  }
  if (!options.model.trim()) {
    throw new Error('A non-empty OpenAI model is required.');
  }

  const corpus = await loadCorpus(options.paths);
  const chapterCard = corpus.chapters.get(options.chapter);
  if (!chapterCard) {
    throw new Error('Chapter must be an integer from 3 through 10.');
  }

  const chapterConceptIds = conceptIdsForChapter(chapterCard);
  const requestedConceptIds = options.conceptIds?.length
    ? [...new Set(options.conceptIds)]
    : [...chapterConceptIds];
  for (const conceptId of requestedConceptIds) {
    if (!chapterConceptIds.has(conceptId)) {
      throw new Error(`Concept ${conceptId} is not part of chapter ${options.chapter}.`);
    }
  }

  const requestedConceptSet = new Set(requestedConceptIds);
  const matchingSections = chapterCard.sections.filter((section) => {
    const sectionConceptIds = new Set(section.concepts.map(({ id }) => id));
    return [...requestedConceptSet].every((conceptId) => sectionConceptIds.has(conceptId));
  });
  const requiredSource = matchingSections.length === 1
    ? {
      title: chapterCard.title,
      section: matchingSections[0].title,
      url: matchingSections[0].sourceUrl,
    }
    : undefined;

  const promptTemplate = await readFile(options.paths.promptPath, 'utf8');
  const request: ResponseCreateParamsNonStreaming = {
    model: options.model,
    store: false,
    instructions: promptTemplate,
    input: JSON.stringify({
      requestedCount: options.count,
      requestedConceptIds,
      requiredSource,
      chapterCard,
    }),
    text: {
      format: {
        type: 'json_schema',
        name: 'database_question_draft_batch',
        description: 'Original multiple-choice database question review candidates.',
        strict: true,
        schema: draftBatchJsonSchema(options.count),
      },
    },
  };

  const response = await options.createResponse(request);
  if (!response.output_text.trim()) {
    throw new Error('OpenAI returned no structured question content.');
  }

  let rawResponse: unknown;
  try {
    rawResponse = JSON.parse(response.output_text) as unknown;
  } catch {
    throw new Error('OpenAI returned malformed JSON despite the structured-output request.');
  }

  const batch = DraftBatchResponseSchema.parse(rawResponse);
  if (batch.questions.length !== options.count) {
    throw new Error(`Expected ${options.count} questions but received ${batch.questions.length}.`);
  }

  const runId = (options.createRunId ?? randomUUID)();
  const generatedAt = (options.now ?? (() => new Date()))().toISOString();
  const questions = batch.questions.map((candidate, index) =>
    QuestionSchema.parse({
      schemaVersion: 1,
      id: `ch${String(options.chapter).padStart(2, '0')}-ai-${runId.slice(0, 12)}-${index + 1}`,
      chapter: options.chapter,
      ...candidate,
      provenance: 'ai-generated',
      status: 'draft',
      generation: {
        promptVersion: 'questions-v1',
        model: options.model,
        generatedAt,
        runId,
      },
    }),
  );

  const existing = await loadWorkspaceQuestions(options.paths);
  const issues = validateQuestionCollection(
    [...existing.questions, ...questions],
    corpus,
    existing.filesById,
  );
  if (issues.length) {
    throw new Error(`Generated questions failed validation:\n${issues.map(({ message }) => message).join('\n')}`);
  }

  const outputPath = path.join(options.paths.draftsDir, `draft-${runId}.json`);
  await writeJsonAtomic(outputPath, questions);
  return { outputPath, questions, request };
}

function draftBatchJsonSchema(count: number): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'conceptIds',
            'kind',
            'difficulty',
            'prompt',
            'options',
            'correctOptionId',
            'explanation',
            'reviewConcept',
            'source',
          ],
          properties: {
            conceptIds: {
              type: 'array',
              minItems: 1,
              maxItems: 12,
              items: { type: 'string' },
            },
            kind: { type: 'string', enum: ['concept', 'sql-reading', 'sql-scenario'] },
            difficulty: { type: 'integer', minimum: 1, maximum: 5 },
            prompt: { type: 'string', minLength: 10, maxLength: 1500 },
            options: {
              type: 'array',
              minItems: 4,
              maxItems: 4,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'text'],
                properties: {
                  id: { type: 'string', pattern: '^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,79}$' },
                  text: { type: 'string', minLength: 1, maxLength: 500 },
                },
              },
            },
            correctOptionId: { type: 'string' },
            explanation: { type: 'string', minLength: 10, maxLength: 2000 },
            reviewConcept: { type: 'string', minLength: 1, maxLength: 300 },
            source: {
              type: 'object',
              additionalProperties: false,
              required: ['url', 'title', 'section'],
              properties: {
                url: { type: 'string' },
                title: { type: 'string' },
                section: { type: 'string' },
              },
            },
          },
        },
      },
    },
  };
}
