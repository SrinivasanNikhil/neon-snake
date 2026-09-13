import { createHash } from 'node:crypto';
import type { Clock } from '../db/clock';
import { systemClock, weekStartUtcIso } from '../db/clock';
import type { SqliteDatabase } from '../db/database';

export type WeeklyScore = {
  chapter: number;
  displayName: string;
  score: number;
  achievedAt: string;
  profileHash: string;
};

export type RecordScoreInput = {
  browserProfileId: string;
  displayName: string;
  chapter: number;
  score: number;
};

type WeeklyScoreRow = {
  chapter: number;
  display_name: string;
  score: number;
  achieved_at: string;
  profile_hash: string;
};

export function hashBrowserProfileId(browserProfileId: string): string {
  return createHash('sha256').update(browserProfileId).digest('hex');
}

/** Stores only a server-validated weekly best score for each anonymous profile. */
export class LeaderboardRepository {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly clock: Clock = systemClock,
  ) {}

  recordWeeklyBest(input: RecordScoreInput): boolean {
    validateScoreInput(input);
    const now = this.clock();
    const result = this.database
      .prepare(`
        INSERT INTO weekly_scores (
          week_start, chapter, profile_hash, display_name, score, achieved_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (week_start, chapter, profile_hash) DO UPDATE SET
          display_name = excluded.display_name,
          score = excluded.score,
          achieved_at = excluded.achieved_at
        WHERE excluded.score > weekly_scores.score
      `)
      .run(
        weekStartUtcIso(now),
        input.chapter,
        hashBrowserProfileId(input.browserProfileId),
        input.displayName,
        input.score,
        now.toISOString(),
      ) as { changes: number };

    return result.changes === 1;
  }

  topTen(chapter: number, date: Date = this.clock()): WeeklyScore[] {
    validateChapter(chapter);
    const rows = this.database
      .prepare(`
        SELECT chapter, display_name, score, achieved_at, profile_hash
        FROM weekly_scores
        WHERE week_start = ? AND chapter = ?
        ORDER BY score DESC, achieved_at ASC, profile_hash ASC
        LIMIT 10
      `)
      .all(weekStartUtcIso(date), chapter) as WeeklyScoreRow[];

    return rows.map(toWeeklyScore);
  }

  /** Deletes completed leaderboard weeks before the supplied Monday boundary. */
  purgeWeeksBefore(cutoff: Date): number {
    const result = this.database
      .prepare('DELETE FROM weekly_scores WHERE week_start < ?')
      .run(weekStartUtcIso(cutoff)) as { changes: number };
    return result.changes;
  }
}

function toWeeklyScore(row: WeeklyScoreRow): WeeklyScore {
  return {
    chapter: row.chapter,
    displayName: row.display_name,
    score: row.score,
    achievedAt: row.achieved_at,
    profileHash: row.profile_hash,
  };
}

function validateScoreInput(input: RecordScoreInput): void {
  validateChapter(input.chapter);
  if (!Number.isSafeInteger(input.score) || input.score < 0) {
    throw new Error('score must be a non-negative safe integer');
  }
  if (!input.browserProfileId) throw new Error('browserProfileId is required');
  if (!input.displayName.trim()) throw new Error('displayName is required');
}

function validateChapter(chapter: number): void {
  if (!Number.isInteger(chapter) || chapter < 3 || chapter > 10) {
    throw new Error('chapter must be an integer from 3 through 10');
  }
}
