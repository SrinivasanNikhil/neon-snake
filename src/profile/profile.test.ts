import { describe, expect, it } from 'vitest';
import { applyAchievement, applyQuizResult, applyRunResult, createProfile, loadProfile, masteryToDifficulty, PROFILE_STORAGE_KEY, resetProfile, saveProfile, updateProfilePreferences } from './index';
import type { ProfileStorage } from './types';

const memoryStorage = (): ProfileStorage & { values: Map<string, string> } => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
};

describe('browser profiles', () => {
  it('creates a complete v1 profile', () => {
    const profile = createProfile({ displayName: '  Ada   Lovelace ', preferredChapter: 6 });
    expect(profile.version).toBe(1);
    expect(profile.profileId).not.toBe('');
    expect(profile.displayName).toBe('Ada Lovelace');
    expect(profile.preferredChapter).toBe(6);
    expect(profile.chapters[10]).toEqual({ gamesPlayed: 0, highScore: 0, mastery: 0, currentStreak: 0, bestStreak: 0 });
  });

  it('normalizes malformed persisted values without throwing', () => {
    const storage = memoryStorage();
    storage.values.set(PROFILE_STORAGE_KEY, JSON.stringify({ version: 0, profileId: 'p1', preferredChapter: 99, chapters: { 3: { mastery: 1000, gamesPlayed: -3, currentStreak: 4, bestStreak: 1 } } }));
    const profile = loadProfile(storage);
    expect(profile.version).toBe(1);
    expect(profile.preferredChapter).toBe(3);
    expect(profile.chapters[3]).toMatchObject({ mastery: 100, gamesPlayed: 0, currentStreak: 4, bestStreak: 4 });
    expect(profile.chapters[9].mastery).toBe(0);
  });

  it('recovers from malformed and unavailable storage', () => {
    const storage = memoryStorage();
    storage.values.set(PROFILE_STORAGE_KEY, '{invalid');
    expect(loadProfile(storage).profileId).not.toBe('');
    const broken: ProfileStorage = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); }, removeItem: () => { throw new Error('denied'); } };
    expect(loadProfile(broken).profileId).not.toBe('');
    expect(saveProfile(createProfile(), broken)).toBe(false);
  });

  it('persists, resets, and applies bounded progress updates', () => {
    const storage = memoryStorage();
    let profile = createProfile({ profileId: 'stable' });
    profile = applyRunResult(profile, { chapter: 3, score: 42 });
    profile = applyQuizResult(profile, { chapter: 3, correct: true });
    profile = applyQuizResult(profile, { chapter: 3, correct: true });
    profile = applyQuizResult(profile, { chapter: 3, correct: false });
    profile = applyAchievement(profile, 'first-run');
    expect(profile.chapters[3]).toMatchObject({ gamesPlayed: 1, highScore: 42, mastery: 12, currentStreak: 0, bestStreak: 2 });
    expect(saveProfile(profile, storage)).toBe(true);
    expect(loadProfile(storage).profileId).toBe('stable');
    expect(resetProfile(storage).profileId).not.toBe('stable');
  });

  it('normalizes editable lobby preferences without replacing local progress', () => {
    const profile = applyRunResult(createProfile({ profileId: 'stable' }), { chapter: 3, score: 42 });
    const updated = updateProfilePreferences(profile, {
      displayName: '  Grace   Hopper  ',
      chapter: 10,
    });

    expect(updated.displayName).toBe('Grace Hopper');
    expect(updated.preferredChapter).toBe(10);
    expect(updated.profileId).toBe('stable');
    expect(updated.chapters[3].highScore).toBe(42);
  });

  it('maps private mastery to a bounded coarse starting difficulty', () => {
    expect(masteryToDifficulty(Number.NaN)).toBe(1);
    expect(masteryToDifficulty(-10)).toBe(1);
    expect(masteryToDifficulty(19)).toBe(1);
    expect(masteryToDifficulty(20)).toBe(2);
    expect(masteryToDifficulty(59)).toBe(3);
    expect(masteryToDifficulty(80)).toBe(5);
    expect(masteryToDifficulty(1000)).toBe(5);
  });
});
