import { CHAPTER_IDS, GAME_CONFIG } from '../shared/gameConfig';
import type { ChapterId, DifficultyLevel } from '../shared/types';
import type { BrowserProfile, QuizResult, RunResult } from './types';

const touched = (profile: BrowserProfile): BrowserProfile => ({ ...profile, updatedAt: new Date().toISOString() });

/** Converts private local mastery into the coarse starting band sent on join. */
export const masteryToDifficulty = (mastery: number): DifficultyLevel => {
  const boundedMastery = Number.isFinite(mastery)
    ? Math.max(0, Math.min(100, mastery))
    : 0;
  return Math.min(5, Math.floor(boundedMastery / 20) + 1) as DifficultyLevel;
};

export const updateProfilePreferences = (
  profile: BrowserProfile,
  preferences: { displayName: string; chapter: ChapterId },
): BrowserProfile => {
  const normalizedName = preferences.displayName.trim().replace(/\s+/g, ' ').slice(0, 24);
  const preferredChapter = CHAPTER_IDS.includes(preferences.chapter)
    ? preferences.chapter
    : profile.preferredChapter;

  return touched({
    ...profile,
    displayName: normalizedName || profile.displayName,
    preferredChapter,
  });
};

/** Records a server-validated completed run. Scores are never accepted as negative values. */
export const applyRunResult = (profile: BrowserProfile, result: RunResult): BrowserProfile => {
  const score = Number.isFinite(result.score) ? Math.max(0, Math.round(result.score)) : 0;
  const current = profile.chapters[result.chapter];
  if (!current) return profile;
  return touched({
    ...profile,
    chapters: {
      ...profile.chapters,
      [result.chapter]: {
        ...current,
        gamesPlayed: current.gamesPlayed + 1,
        highScore: Math.max(current.highScore, score),
      },
    },
  });
};

/** Updates learning mastery and streaks from a server-validated quiz response. */
export const applyQuizResult = (profile: BrowserProfile, result: QuizResult): BrowserProfile => {
  const current = profile.chapters[result.chapter];
  if (!current) return profile;
  const currentStreak = result.correct ? current.currentStreak + 1 : 0;
  const masteryDelta = result.correct ? 8 : -4;
  return touched({
    ...profile,
    chapters: {
      ...profile.chapters,
      [result.chapter]: {
        ...current,
        mastery: Math.max(0, Math.min(100, current.mastery + masteryDelta)),
        currentStreak,
        bestStreak: Math.max(current.bestStreak, currentStreak),
      },
    },
  });
};

/** Adds an achievement once, preserving a compact bounded browser profile. */
export const applyAchievement = (profile: BrowserProfile, achievementId: string): BrowserProfile => {
  if (!/^[a-z0-9:_-]{1,64}$/i.test(achievementId) || profile.achievements.includes(achievementId)) return profile;
  return touched({ ...profile, achievements: [...profile.achievements, achievementId].slice(-100) });
};

export const maxRecordedLength = GAME_CONFIG.maximumLength;
