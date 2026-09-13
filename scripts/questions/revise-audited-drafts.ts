import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { z } from 'zod';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { QuestionSchema, type QuestionWithAnswer } from '../../src/shared/questionSchema.ts';
import { loadCorpus } from './lib/corpus.ts';
import { readQuestionFile } from './lib/files.ts';
import { writeJsonAtomic } from './lib/json.ts';
import { createQuestionWorkspacePaths } from './lib/paths.ts';
import { formatValidationIssues, loadWorkspaceQuestions, validateQuestionCollection } from './lib/validation.ts';
import { reportCliError } from './lib/cli.ts';

config({ path: '.env.local', override: false, quiet: true });

const RevisionSchema = z.object({
  questionId: z.string(),
  conceptIds: z.array(z.string()).min(1).max(12),
  kind: z.enum(['concept', 'sql-reading', 'sql-scenario']),
  difficulty: z.number().int().min(1).max(5),
  prompt: z.string().trim().min(10).max(1_500),
  options: z.array(z.object({
    id: z.string(),
    text: z.string().trim().min(1).max(500),
  })).length(4),
  correctOptionId: z.string(),
  explanation: z.string().trim().min(10).max(2_000),
  reviewConcept: z.string().trim().min(1).max(300),
  source: z.object({
    url: z.string().url(),
    title: z.string().trim().min(1).max(200),
    section: z.string().trim().min(1).max(200),
  }),
});

const RevisionResponseSchema = z.object({ revisions: z.array(RevisionSchema) });

type AuditReview = {
  questionId: string;
  verdict: 'pass' | 'needs-edit' | 'reject';
  issues: string[];
  rationale: string;
  suggestedFix: string;
};

function revisionJsonSchema(count: number): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['revisions'],
    properties: {
      revisions: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'questionId', 'conceptIds', 'kind', 'difficulty', 'prompt', 'options',
            'correctOptionId', 'explanation', 'reviewConcept', 'source',
          ],
          properties: {
            questionId: { type: 'string' },
            conceptIds: { type: 'array', minItems: 1, maxItems: 12, items: { type: 'string' } },
            kind: { type: 'string', enum: ['concept', 'sql-reading', 'sql-scenario'] },
            difficulty: { type: 'integer', minimum: 1, maximum: 5 },
            prompt: { type: 'string', minLength: 10, maxLength: 1500 },
            options: {
              type: 'array', minItems: 4, maxItems: 4,
              items: {
                type: 'object', additionalProperties: false, required: ['id', 'text'],
                properties: { id: { type: 'string' }, text: { type: 'string', minLength: 1, maxLength: 500 } },
              },
            },
            correctOptionId: { type: 'string' },
            explanation: { type: 'string', minLength: 10, maxLength: 2000 },
            reviewConcept: { type: 'string', minLength: 1, maxLength: 300 },
            source: {
              type: 'object', additionalProperties: false, required: ['url', 'title', 'section'],
              properties: { url: { type: 'string' }, title: { type: 'string' }, section: { type: 'string' } },
            },
          },
        },
      },
    },
  };
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_REVIEW_MODEL ?? process.env.OPENAI_QUESTION_MODEL;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required in the process environment.');
  if (!model) throw new Error('OPENAI_REVIEW_MODEL or OPENAI_QUESTION_MODEL is required.');

  const paths = createQuestionWorkspacePaths();
  const corpus = await loadCorpus(paths);
  const workspace = await loadWorkspaceQuestions(paths);
  const byId = new Map(workspace.questions.map((question) => [question.id, question]));
  const replacements = new Map<string, QuestionWithAnswer>();
  const client = new OpenAI({ apiKey });

  for (const chapter of [...corpus.chapters.keys()].sort((left, right) => left - right)) {
    const auditPath = path.join(paths.contentDir, 'questions', 'audits', `ch${String(chapter).padStart(2, '0')}.json`);
    const audit = JSON.parse(await readFile(auditPath, 'utf8')) as { reviews: AuditReview[] };
    const flagged = audit.reviews.filter(({ verdict }) => verdict !== 'pass');
    if (flagged.length === 0) continue;
    const items = flagged.map((review) => ({ question: byId.get(review.questionId), review }));

    const request: ResponseCreateParamsNonStreaming = {
      model,
      store: false,
      instructions: [
        'Revise every flagged database-learning draft so it fully resolves the supplied audit.',
        'Preserve each questionId. Return a complete replacement candidate, not commentary.',
        'Use only concepts and an exact title/section/URL triple from one supplied chapter-card section.',
        'Ensure the stem and options have the same response type, exactly one answer is defensible, every SQL statement is valid under stated assumptions, and the explanation addresses why the correct choice wins.',
        'For rejected items, replace the flawed scenario completely while staying within a valid chapter concept.',
        'Do not approve or change provenance. These remain review drafts.',
      ].join('\n'),
      input: JSON.stringify({ chapter, chapterCard: corpus.chapters.get(chapter), items }),
      text: {
        format: {
          type: 'json_schema',
          name: `chapter_${chapter}_draft_revisions`,
          strict: true,
          schema: revisionJsonSchema(flagged.length),
        },
      },
    };
    const response = await client.responses.create(request);
    const parsed = RevisionResponseSchema.parse(JSON.parse(response.output_text) as unknown);
    const expectedIds = flagged.map(({ questionId }) => questionId);
    const actualIds = parsed.revisions.map(({ questionId }) => questionId);
    if (new Set(actualIds).size !== actualIds.length || expectedIds.some((id, index) => actualIds[index] !== id)) {
      throw new Error(`Chapter ${chapter} revision did not return each flagged ID exactly once in order.`);
    }

    for (const revision of parsed.revisions) {
      const original = byId.get(revision.questionId);
      if (!original) throw new Error(`Missing original draft ${revision.questionId}.`);
      const { questionId: _questionId, ...fields } = revision;
      replacements.set(original.id, QuestionSchema.parse({
        ...original,
        ...fields,
        id: original.id,
        chapter: original.chapter,
        provenance: original.provenance,
        status: 'draft',
        generation: original.generation,
      }));
    }
    process.stdout.write(`Chapter ${chapter}: prepared ${flagged.length} revisions.\n`);
  }

  const updatedQuestions = workspace.questions.map((question) => replacements.get(question.id) ?? question);
  const issues = validateQuestionCollection(updatedQuestions, corpus, workspace.filesById);
  if (issues.length) throw new Error(`Revised collection failed validation:\n${formatValidationIssues(issues)}`);

  const replacementsByFile = new Map<string, Map<string, QuestionWithAnswer>>();
  for (const [id, replacement] of replacements) {
    const relativeFile = workspace.filesById.get(id);
    if (!relativeFile) throw new Error(`Missing source file for ${id}.`);
    const file = path.resolve(paths.rootDir, relativeFile);
    const fileReplacements = replacementsByFile.get(file) ?? new Map<string, QuestionWithAnswer>();
    fileReplacements.set(id, replacement);
    replacementsByFile.set(file, fileReplacements);
  }

  for (const [file, fileReplacements] of replacementsByFile) {
    const questions = await readQuestionFile(file);
    await writeJsonAtomic(file, questions.map((question) => fileReplacements.get(question.id) ?? question));
  }
  process.stdout.write(`Wrote ${replacements.size} validated draft revisions.\n`);
}

main().catch(reportCliError);
