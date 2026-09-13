import { describe, expect, it } from 'vitest';
import {
  InputPayloadSchema,
  JoinPayloadSchema,
  LeaderboardRequestPayloadSchema,
  SubmitAnswerPayloadSchema,
} from './validation';

describe('socket payload validation', () => {
  it('normalizes a valid anonymous join', () => {
    const result = JoinPayloadSchema.parse({
      profileId: '4f5fa847-e21b-42b4-9b54-f67ca92462c7',
      name: '  Ada\u0000   Lovelace  ',
      chapter: 8,
      difficulty: 3,
    });
    expect(result.name).toBe('Ada Lovelace');
    expect(result.chapter).toBe(8);
    expect(result.difficulty).toBe(3);
  });

  it('rejects invalid chapters and profile IDs', () => {
    expect(() =>
      JoinPayloadSchema.parse({
        profileId: 'copied-name',
        name: 'Ada',
        chapter: 2,
        difficulty: 0,
      }),
    ).toThrow();
  });

  it('requires a coarse difficulty from 1 through 5', () => {
    const base = {
      profileId: '4f5fa847-e21b-42b4-9b54-f67ca92462c7',
      name: 'Ada',
      chapter: 8,
    };
    expect(() => JoinPayloadSchema.parse({ ...base, difficulty: 0 })).toThrow();
    expect(() => JoinPayloadSchema.parse({ ...base, difficulty: 6 })).toThrow();
    expect(() => JoinPayloadSchema.parse({ ...base, difficulty: 2.5 })).toThrow();
  });

  it('accepts leaderboard requests only for supported chapters', () => {
    expect(LeaderboardRequestPayloadSchema.parse({ chapter: 3 })).toEqual({ chapter: 3 });
    expect(() => LeaderboardRequestPayloadSchema.parse({ chapter: 2 })).toThrow();
    expect(() => LeaderboardRequestPayloadSchema.parse({ chapter: 11 })).toThrow();
  });

  it('requires bounded input sequences and boolean controls', () => {
    expect(
      InputPayloadSchema.parse({ sequence: 1, left: true, right: false, boost: false }),
    ).toEqual({ sequence: 1, left: true, right: false, boost: false });
    expect(() =>
      InputPayloadSchema.parse({ sequence: -1, left: 1, right: false, boost: false }),
    ).toThrow();
  });

  it('requires a server-issued attempt shape', () => {
    expect(() =>
      SubmitAnswerPayloadSchema.parse({ attemptId: 'not-an-attempt', optionId: 'a' }),
    ).toThrow();
  });
});
