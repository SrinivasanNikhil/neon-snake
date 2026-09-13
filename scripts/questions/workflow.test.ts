import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { approveQuestion } from './lib/approval.ts';
import { buildApprovedIndex } from './lib/index.ts';
import {
  aiDraftQuestion,
  createTemporaryQuestionWorkspace,
  writeDraft,
} from './test-helpers.ts';

describe('approval and index workflow', () => {
  it('requires explicit human review and records matching review metadata', async () => {
    const paths = await createTemporaryQuestionWorkspace();
    const draft = aiDraftQuestion();
    await writeDraft(paths.draftsDir, [draft]);

    await expect(
      approveQuestion({
        paths,
        questionId: draft.id,
        reviewer: 'Database Instructor',
        notes: 'Checked correctness and chapter fit.',
        confirmHumanReview: false,
      }),
    ).rejects.toThrow('confirm-human-review');

    const approval = await approveQuestion({
      paths,
      questionId: draft.id,
      reviewer: 'Database Instructor',
      notes: 'Checked correctness, ambiguity, source fit, and paraphrasing.',
      confirmHumanReview: true,
      now: () => new Date('2026-08-11T13:00:00.000Z'),
    });

    expect(approval.question.status).toBe('approved');
    expect(approval.review).toMatchObject({
      questionId: draft.id,
      reviewer: 'Database Instructor',
      decision: 'approved',
    });
    expect(JSON.parse(await readFile(approval.reviewPath, 'utf8'))).toMatchObject({
      approvedQuestionChecksum: approval.review.approvedQuestionChecksum,
    });
  });

  it('builds a checksummed index from approved questions only', async () => {
    const paths = await createTemporaryQuestionWorkspace();
    const approvedDraft = aiDraftQuestion();
    const unapprovedDraft = aiDraftQuestion({
      id: 'ch03-ai-test-run-2',
      prompt: 'Which SQL clause chooses the columns that appear in a query result?',
    });
    await writeDraft(paths.draftsDir, [approvedDraft, unapprovedDraft]);
    await approveQuestion({
      paths,
      questionId: approvedDraft.id,
      reviewer: 'Database Instructor',
      notes: 'Reviewed correctness, clarity, and source alignment.',
      confirmHumanReview: true,
    });

    const index = await buildApprovedIndex(paths);
    expect(index.questionCount).toBe(1);
    expect(index.questions.map(({ id }) => id)).toEqual([approvedDraft.id]);
    expect(index.checksum).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(await readdir(paths.draftsDir)).toHaveLength(1);
  });
});
