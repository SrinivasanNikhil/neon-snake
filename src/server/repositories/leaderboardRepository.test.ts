import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, type SqliteDatabase } from '../db/database';
import { LeaderboardRepository, hashBrowserProfileId } from './leaderboardRepository';

const databases: SqliteDatabase[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.close();
});

function createRepository(now: string) {
  const database = openDatabase(':memory:');
  databases.push(database);
  return new LeaderboardRepository(database, () => new Date(now));
}

describe('LeaderboardRepository', () => {
  it('keeps scores separated by chapter and stores only the profile hash', () => {
    const repository = createRepository('2026-08-10T12:00:00.000Z');
    repository.recordWeeklyBest({ browserProfileId: 'profile-a', displayName: 'Ada', chapter: 3, score: 40 });
    repository.recordWeeklyBest({ browserProfileId: 'profile-a', displayName: 'Ada', chapter: 4, score: 50 });

    expect(repository.topTen(3)).toMatchObject([{ chapter: 3, displayName: 'Ada', score: 40 }]);
    expect(repository.topTen(4)).toMatchObject([{ chapter: 4, displayName: 'Ada', score: 50 }]);
    expect(repository.topTen(3)[0]?.profileHash).toBe(hashBrowserProfileId('profile-a'));
  });

  it('rejects a lower score for the same profile, chapter, and week', () => {
    const repository = createRepository('2026-08-10T12:00:00.000Z');
    expect(repository.recordWeeklyBest({ browserProfileId: 'profile-a', displayName: 'Ada', chapter: 3, score: 40 })).toBe(true);
    expect(repository.recordWeeklyBest({ browserProfileId: 'profile-a', displayName: 'Changed', chapter: 3, score: 39 })).toBe(false);
    expect(repository.topTen(3)).toMatchObject([{ displayName: 'Ada', score: 40 }]);
  });

  it('orders tied scores by earliest achieved_at, then profile hash', () => {
    const database = openDatabase(':memory:');
    databases.push(database);
    const first = new LeaderboardRepository(database, () => new Date('2026-08-10T12:00:00.000Z'));
    const second = new LeaderboardRepository(database, () => new Date('2026-08-10T12:01:00.000Z'));
    second.recordWeeklyBest({ browserProfileId: 'profile-b', displayName: 'B', chapter: 3, score: 40 });
    first.recordWeeklyBest({ browserProfileId: 'profile-a', displayName: 'A', chapter: 3, score: 40 });

    expect(first.topTen(3).map(({ displayName }) => displayName)).toEqual(['A', 'B']);
  });

  it('rolls scores over on Monday at 00:00 UTC and can purge older weeks', () => {
    const database = openDatabase(':memory:');
    databases.push(database);
    const sunday = new LeaderboardRepository(database, () => new Date('2026-08-09T23:59:59.000Z'));
    const monday = new LeaderboardRepository(database, () => new Date('2026-08-10T00:00:00.000Z'));
    sunday.recordWeeklyBest({ browserProfileId: 'profile-a', displayName: 'Ada', chapter: 3, score: 40 });
    monday.recordWeeklyBest({ browserProfileId: 'profile-b', displayName: 'Bea', chapter: 3, score: 50 });

    expect(sunday.topTen(3).map(({ displayName }) => displayName)).toEqual(['Ada']);
    expect(monday.topTen(3).map(({ displayName }) => displayName)).toEqual(['Bea']);
    expect(monday.purgeWeeksBefore(new Date('2026-08-10T00:00:00.000Z'))).toBe(1);
  });
});
