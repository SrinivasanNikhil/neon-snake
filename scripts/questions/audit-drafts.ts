import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from 'dotenv';
import OpenAI from 'openai';
import { z } from 'zod';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { loadCorpus } from './lib/corpus.ts';
import { createQuestionWorkspacePaths } from './lib/paths.ts';
import { loadWorkspaceQuestions } from './lib/validation.ts';
import { reportCliError } from './lib/cli.ts';

config({ path: '.env.local', override: false, quiet: true });

const AuditReviewSchema = z.object({
  questionId: z.string(),
  verdict: z.enum(['pass', 'needs-edit', 'reject']),
  issues: z.array(z.enum([
    'factual-error',
    'sql-error',
    'ambiguous-answer',
    'stem-option-mismatch',
    'weak-distractor',
    'missing-assumption',
    'misrated-difficulty',
    'poor-explanation',
    'chapter-fit',
    'source-fit',
    'accessibility',
    'near-duplicate',
  ])),
  rationale: z.string().min(10),
  suggestedFix: z.string(),
});

const AuditResponseSchema = z.object({ reviews: z.array(AuditReviewSchema) });

type AuditReview = z.infer<typeof AuditReviewSchema>;

function auditJsonSchema(count: number): Record<string, unknown> {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['reviews'],
    properties: {
      reviews: {
        type: 'array',
        minItems: count,
        maxItems: count,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['questionId', 'verdict', 'issues', 'rationale', 'suggestedFix'],
          properties: {
            questionId: { type: 'string' },
            verdict: { type: 'string', enum: ['pass', 'needs-edit', 'reject'] },
            issues: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'factual-error', 'sql-error', 'ambiguous-answer', 'stem-option-mismatch',
                  'weak-distractor', 'missing-assumption', 'misrated-difficulty',
                  'poor-explanation', 'chapter-fit', 'source-fit', 'accessibility',
                  'near-duplicate',
                ],
              },
            },
            rationale: { type: 'string', minLength: 10 },
            suggestedFix: { type: 'string' },
          },
        },
      },
    },
  };
}

async function auditChapter(
  client: OpenAI,
  model: string,
  chapter: number,
  chapterCard: unknown,
  questions: unknown[],
): Promise<{ request: ResponseCreateParamsNonStreaming; reviews: AuditReview[] }> {
  const request: ResponseCreateParamsNonStreaming = {
    model,
    store: false,
    instructions: [
      'Act as a strict database-education editor. Audit every supplied draft independently.',
      'Pass only when the stem and options align, exactly one answer is defensible, SQL and factual claims are correct, distractors are plausible, all assumptions are stated, the explanation teaches the concept, and the difficulty is credible.',
      'Mark needs-edit for repairable wording, difficulty, explanation, or distractor problems. Mark reject for a fundamental factual, chapter-fit, source-fit, or duplicated-concept failure.',
      'A stem that asks which query is correct but already supplies one query and offers descriptions is a stem-option mismatch.',
      'Do not approve or publish anything. Return one review for every question ID exactly once, in input order.',
    ].join('\n'),
    input: JSON.stringify({ chapter, chapterCard, questions }),
    text: {
      format: {
        type: 'json_schema',
        name: `chapter_${chapter}_draft_audit`,
        strict: true,
        schema: auditJsonSchema(questions.length),
      },
    },
  };

  const response = await client.responses.create(request);
  const parsed = AuditResponseSchema.parse(JSON.parse(response.output_text) as unknown);
  const expectedIds = questions.map((question) => (question as { id: string }).id);
  const actualIds = parsed.reviews.map(({ questionId }) => questionId);
  if (new Set(actualIds).size !== actualIds.length || expectedIds.some((id, index) => actualIds[index] !== id)) {
    throw new Error(`Chapter ${chapter} audit did not return each question ID exactly once in order.`);
  }
  return { request, reviews: parsed.reviews };
}

async function main(): Promise<void> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_REVIEW_MODEL ?? process.env.OPENAI_QUESTION_MODEL;
  if (!apiKey) throw new Error('OPENAI_API_KEY is required in the process environment.');
  if (!model) throw new Error('OPENAI_REVIEW_MODEL or OPENAI_QUESTION_MODEL is required.');

  const paths = createQuestionWorkspacePaths();
  const corpus = await loadCorpus(paths);
  const workspace = await loadWorkspaceQuestions(paths);
  const auditDir = path.join(paths.contentDir, 'questions', 'audits');
  await mkdir(auditDir, { recursive: true });
  const client = new OpenAI({ apiKey });

  for (const chapter of [...corpus.chapters.keys()].sort((left, right) => left - right)) {
    const questions = workspace.questions
      .filter((question) => question.chapter === chapter && question.status === 'draft')
      .sort((left, right) => left.id.localeCompare(right.id));
    const result = await auditChapter(client, model, chapter, corpus.chapters.get(chapter), questions);
    const report = {
      schemaVersion: 1,
      chapter,
      model,
      auditedAt: new Date().toISOString(),
      questionCount: questions.length,
      summary: {
        pass: result.reviews.filter(({ verdict }) => verdict === 'pass').length,
        needsEdit: result.reviews.filter(({ verdict }) => verdict === 'needs-edit').length,
        reject: result.reviews.filter(({ verdict }) => verdict === 'reject').length,
      },
      reviews: result.reviews,
    };
    const outputPath = path.join(auditDir, `ch${String(chapter).padStart(2, '0')}.json`);
    await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(`Chapter ${chapter}: ${report.summary.pass} pass, ${report.summary.needsEdit} need edits, ${report.summary.reject} reject.\n`);
  }
}

main().catch(reportCliError);
