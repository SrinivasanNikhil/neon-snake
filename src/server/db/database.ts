import Database from 'better-sqlite3';

export const DATABASE_BUSY_TIMEOUT_MS = 5_000;

type Migration = {
  id: number;
  sql: string;
};

const migrations: readonly Migration[] = [
  {
    id: 1,
    sql: `
      CREATE TABLE weekly_scores (
        week_start TEXT NOT NULL,
        chapter INTEGER NOT NULL CHECK (chapter BETWEEN 3 AND 10),
        profile_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        score INTEGER NOT NULL CHECK (score >= 0),
        achieved_at TEXT NOT NULL,
        PRIMARY KEY (week_start, chapter, profile_hash)
      );

      CREATE INDEX weekly_scores_leaderboard_idx
        ON weekly_scores (week_start, chapter, score DESC, achieved_at ASC, profile_hash ASC);
    `,
  },
];

export type SqliteDatabase = InstanceType<typeof Database>;

/**
 * Opens a leaderboard database and applies all outstanding migrations before it
 * is returned. The migration record and its schema changes share one transaction.
 */
export function openDatabase(filename: string): SqliteDatabase {
  const database = new Database(filename);
  configureDatabase(database);
  migrateDatabase(database);
  return database;
}

export function configureDatabase(database: SqliteDatabase): void {
  database.pragma('journal_mode = WAL');
  database.pragma(`busy_timeout = ${DATABASE_BUSY_TIMEOUT_MS}`);
  database.pragma('foreign_keys = ON');
}

export function migrateDatabase(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = new Set(
    (database.prepare('SELECT id FROM schema_migrations').all() as Array<{ id: number }>)
      .map(({ id }) => id),
  );
  const recordMigration = database.prepare(
    'INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)',
  );

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;

    database.transaction(() => {
      database.exec(migration.sql);
      recordMigration.run(migration.id, new Date().toISOString());
    })();
  }
}

export const LEADERBOARD_MIGRATIONS = migrations;
