import type { ChapterId } from '../shared/types';

export const PROFILE_STORAGE_KEY = 'neon-snake.profile.v1';
export const PROFILE_VERSION = 1 as const;

export type ControlMode = 'auto' | 'keyboard' | 'touch';

export type ProfileSettings = {
  controlMode: ControlMode;
  reducedMotion: boolean;
};

export type ChapterProgress = {
  gamesPlayed: number;
  highScore: number;
  mastery: number;
  currentStreak: number;
  bestStreak: number;
};

export type ChapterProgressById = Record<ChapterId, ChapterProgress>;

export type BrowserProfile = {
  version: typeof PROFILE_VERSION;
  profileId: string;
  displayName: string;
  preferredChapter: ChapterId;
  settings: ProfileSettings;
  chapters: ChapterProgressById;
  achievements: string[];
  updatedAt: string;
};

export type ProfileStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type RunResult = {
  chapter: ChapterId;
  score: number;
};

export type QuizResult = {
  chapter: ChapterId;
  correct: boolean;
};
