import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { configureDatabase, LEADERBOARD_MIGRATIONS, migrateDatabase } from './database';

describe('database migrations', () => {
  it('applies every migration once and is safe to run repeatedly', () => {
    const database = new Database(':memory:');
    try {
      configureDatabase(database);
      migrateDatabase(database);
      migrateDatabase(database);

      expect(database.prepare('SELECT id FROM schema_migrations ORDER BY id').all())
        .toHaveLength(LEADERBOARD_MIGRATIONS.length);
      expect(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'weekly_scores'").get())
        .toBeTruthy();
      expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(database.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      database.close();
    }
  });
});
