import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import { generateDrafts } from './lib/generation.ts';
import { createTemporaryQuestionWorkspace } from './test-helpers.ts';

describe('offline question generation', () => {
  it('requests non-stored structured output and writes drafts only', async () => {
    const paths = await createTemporaryQuestionWorkspace();
    const createResponse = vi.fn(async (_request: ResponseCreateParamsNonStreaming) => ({
      output_text: JSON.stringify({
        questions: [
          {
            conceptIds: ['ch03-select-filter'],
            kind: 'sql-reading',
            difficulty: 2,
            prompt: 'Which clause filters inventory rows before they are returned?',
            options: [
              { id: 'a', text: 'WHERE' },
              { id: 'b', text: 'ORDER BY' },
              { id: 'c', text: 'SELECT' },
              { id: 'd', text: 'GROUP BY' },
            ],
            correctOptionId: 'a',
            explanation: 'WHERE applies a predicate that restricts the rows in the result.',
            reviewConcept: 'Review restriction with WHERE.',
            source: {
              url: 'https://www.richardtwatson.com/open/Reader/_book/203-singleentity.html#querying-a-single-table-database',
              title: 'The Single Entity',
              section: 'Querying a single-table database',
            },
          },
        ],
      }),
    }));

    const result = await generateDrafts({
      paths,
      chapter: 3,
      count: 1,
      model: 'mock-question-model',
      createResponse,
      createRunId: () => 'test-run-1234',
      now: () => new Date('2026-08-11T12:00:00.000Z'),
    });

    expect(createResponse).toHaveBeenCalledOnce();
    const request = createResponse.mock.calls[0][0];
    expect(request.store).toBe(false);
    expect(request.model).toBe('mock-question-model');
    expect(request.text?.format).toMatchObject({
      type: 'json_schema',
      strict: true,
    });
    expect(result.questions[0]).toMatchObject({
      status: 'draft',
      provenance: 'ai-generated',
      chapter: 3,
    });
    expect(JSON.parse(await readFile(result.outputPath, 'utf8'))).toHaveLength(1);
    expect(await readdir(paths.approvedDir)).toEqual([]);
    expect(await readdir(paths.reviewsDir)).toEqual([]);
  });

  it('does not write a draft when the mocked response fails validation', async () => {
    const paths = await createTemporaryQuestionWorkspace();
    await expect(
      generateDrafts({
        paths,
        chapter: 3,
        count: 1,
        model: 'mock-question-model',
        createResponse: async () => ({ output_text: '{"questions":[]}' }),
      }),
    ).rejects.toThrow();
    expect(await readdir(paths.draftsDir)).toEqual([]);
  });
});
