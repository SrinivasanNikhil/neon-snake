import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { QuestionWithAnswer } from '../../shared/questionSchema';
import { loadApprovedQuestions } from './approvedQuestionLoader';
import { QuestionService } from './questionService';

const approvedQuestion: QuestionWithAnswer = {
  schemaVersion: 1,
  id: 'ch10-select-001',
  chapter: 10,
  conceptIds: ['ch10-set-processing'],
  kind: 'sql-reading',
  difficulty: 2,
  prompt: 'Which keyword begins a basic query that returns expressions or columns?',
  options: [
    { id: 'a', text: 'CREATE' },
    { id: 'b', text: 'SELECT' },
    { id: 'c', text: 'GRANT' },
    { id: 'd', text: 'COMMIT' },
  ],
  correctOptionId: 'b',
  explanation: 'SELECT identifies the expressions and columns returned by the query.',
  reviewConcept: 'Reading a basic SELECT query',
  source: {
    url: 'https://www.richardtwatson.com/open/Reader/_book/Data-Management.pdf#page=214',
    title: 'SQL',
    section: 'Structured query language',
  },
  provenance: 'curated',
  status: 'approved',
};

const approvedAtDifficulty = (
  id: string,
  difficulty: 1 | 2 | 3 | 4 | 5,
): QuestionWithAnswer => ({
  ...approvedQuestion,
  id,
  difficulty,
  prompt: `${approvedQuestion.prompt} (${id})`,
  options: approvedQuestion.options.map((option) => ({ ...option })),
});

describe('approved question runtime', () => {
  it('uses approved chapter questions without exposing answer keys', () => {
    const service = new QuestionService([], () => 0, [approvedQuestion]);
    const payload = service.createAttempt('player', 10);

    expect(payload).toMatchObject({ questionId: approvedQuestion.id, difficulty: 2 });
    expect(payload).not.toHaveProperty('correctOptionId');
    const result = service.evaluate('player', payload!.attemptId, 'b');
    expect(result).toMatchObject({
      correct: true,
      payload: {
        success: true,
        correctOptionId: 'b',
        explanation: approvedQuestion.explanation,
      },
    });
  });

  it('shuffles each approved attempt while grading by stable option ID', () => {
    const randomValues = [
      0, 0, 0, 0,
      0, 0.999, 0.999, 0.999,
    ];
    const service = new QuestionService(
      [],
      () => randomValues.shift() ?? 0,
      [approvedQuestion],
    );

    const first = service.createAttempt('first-player', 10)!;
    const second = service.createAttempt('second-player', 10)!;

    expect(first.options.map(({ id }) => id)).toEqual(['b', 'c', 'd', 'a']);
    expect(second.options.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd']);
    expect(first.options).not.toEqual(second.options);
    expect(approvedQuestion.options.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd']);
    expect(service.evaluate('first-player', first.attemptId, 'b')?.correct).toBe(true);
    expect(service.evaluate('second-player', second.attemptId, 'a')?.correct).toBe(false);
  });

  it('also shuffles legacy fallback options without changing their answer mapping', () => {
    const legacyQuestion = {
      id: 99,
      chapter: 3,
      question: 'Which option is correct?',
      options: ['Wrong A', 'Correct B', 'Wrong C', 'Wrong D'],
      correctAnswer: 1,
    };
    const service = new QuestionService([legacyQuestion], () => 0);
    const payload = service.createAttempt('player', 3)!;

    expect(payload.options.map(({ id }) => id)).toEqual(['b', 'c', 'd', 'a']);
    expect(service.evaluate('player', payload.attemptId, 'b')?.correct).toBe(true);
  });

  it('starts near local mastery and adapts from server-validated outcomes', () => {
    const difficultyThreeA = approvedAtDifficulty('difficulty-three-a', 3);
    const difficultyFour = approvedAtDifficulty('difficulty-four', 4);
    const difficultyThreeB = approvedAtDifficulty('difficulty-three-b', 3);
    const service = new QuestionService(
      [],
      () => 0,
      [difficultyThreeA, difficultyFour, difficultyThreeB],
    );
    service.startPlayerRun('player', 10, 3);

    const first = service.createAttempt('player', 10)!;
    expect(first).toMatchObject({ questionId: difficultyThreeA.id, difficulty: 3 });
    expect(service.evaluate('player', first.attemptId, 'b')?.correct).toBe(true);

    const second = service.createAttempt('player', 10)!;
    expect(second).toMatchObject({ questionId: difficultyFour.id, difficulty: 4 });
    expect(service.evaluate('player', second.attemptId, 'a')?.correct).toBe(false);

    const third = service.createAttempt('player', 10)!;
    expect(third).toMatchObject({ questionId: difficultyThreeB.id, difficulty: 3 });
  });

  it('serves the full eligible bank before beginning a new no-repeat cycle', () => {
    const firstQuestion = approvedAtDifficulty('cycle-first', 2);
    const secondQuestion = approvedAtDifficulty('cycle-second', 2);
    const service = new QuestionService([], () => 0, [firstQuestion, secondQuestion]);
    service.startPlayerRun('player', 10, 2);

    const first = service.createAttempt('player', 10)!;
    const second = service.createAttempt('player', 10)!;
    const third = service.createAttempt('player', 10)!;

    expect(first.questionId).toBe(firstQuestion.id);
    expect(second.questionId).toBe(secondQuestion.id);
    expect(third.questionId).toBe(firstQuestion.id);
  });

  it('treats a missing index as an empty approved bank and rejects malformed indexes', () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'neon-question-index-'));
    expect(loadApprovedQuestions(path.join(directory, 'missing.json'))).toEqual([]);

    const malformedPath = path.join(directory, 'malformed.json');
    writeFileSync(malformedPath, JSON.stringify({ schemaVersion: 1, questions: [] }));
    expect(() => loadApprovedQuestions(malformedPath)).toThrow();
  });
});
