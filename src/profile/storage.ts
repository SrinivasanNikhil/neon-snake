import type { ChapterId } from '../shared/types';
import { CHAPTER_IDS } from '../shared/gameConfig';
import {
  PROFILE_STORAGE_KEY,
  PROFILE_VERSION,
  type BrowserProfile,
  type ChapterProgress,
  type ChapterProgressById,
  type ProfileStorage,
} from './types';

const DEFAULT_NAME = 'Snake Scholar';
const MAX_NAME_LENGTH = 24;
const MAX_ACHIEVEMENTS = 100;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isChapterId = (value: unknown): value is ChapterId =>
  typeof value === 'number' && (CHAPTER_IDS as readonly number[]).includes(value);

const clampInteger = (value: unknown, minimum: number, maximum: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
};

const normalizeName = (value: unknown): string => {
  if (typeof value !== 'string') return DEFAULT_NAME;
  const name = value.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
  return name || DEFAULT_NAME;
};

const createId = (): string => {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
};

const now = (): string => new Date().toISOString();

export const createChapterProgress = (): ChapterProgress => ({
  gamesPlayed: 0,
  highScore: 0,
  mastery: 0,
  currentStreak: 0,
  bestStreak: 0,
});

export const createChapterProgressById = (): ChapterProgressById =>
  Object.fromEntries(CHAPTER_IDS.map((chapter) => [chapter, createChapterProgress()])) as ChapterProgressById;

export const createProfile = (overrides: Partial<Pick<BrowserProfile, 'profileId' | 'displayName' | 'preferredChapter'>> = {}): BrowserProfile => ({
  version: PROFILE_VERSION,
  profileId: typeof overrides.profileId === 'string' && overrides.profileId.trim() ? overrides.profileId : createId(),
  displayName: normalizeName(overrides.displayName),
  preferredChapter: isChapterId(overrides.preferredChapter) ? overrides.preferredChapter : 3,
  settings: { controlMode: 'auto', reducedMotion: false },
  chapters: createChapterProgressById(),
  achievements: [],
  updatedAt: now(),
});

const normalizeProgress = (value: unknown): ChapterProgress => {
  const source = isRecord(value) ? value : {};
  const gamesPlayed = clampInteger(source.gamesPlayed, 0, Number.MAX_SAFE_INTEGER);
  const highScore = clampInteger(source.highScore, 0, Number.MAX_SAFE_INTEGER);
  const mastery = clampInteger(source.mastery, 0, 100);
  const currentStreak = clampInteger(source.currentStreak, 0, Number.MAX_SAFE_INTEGER);
  const bestStreak = Math.max(currentStreak, clampInteger(source.bestStreak, 0, Number.MAX_SAFE_INTEGER));
  return { gamesPlayed, highScore, mastery, currentStreak, bestStreak };
};

/** Returns a safe v1 profile or null when the value cannot be recognized. */
export const parseProfile = (value: unknown): BrowserProfile | null => {
  if (!isRecord(value)) return null;
  // v0 intentionally shares the v1 fields except for its absent version marker.
  const version = value.version;
  if (version !== undefined && version !== PROFILE_VERSION && version !== 0) return null;
  if (typeof value.profileId !== 'string' || !value.profileId.trim()) return null;

  const sourceChapters = isRecord(value.chapters) ? value.chapters : {};
  const chapters = Object.fromEntries(
    CHAPTER_IDS.map((chapter) => [chapter, normalizeProgress(sourceChapters[String(chapter)])]),
  ) as ChapterProgressById;
  const sourceSettings = isRecord(value.settings) ? value.settings : {};
  const controlMode = sourceSettings.controlMode;
  const achievements = Array.isArray(value.achievements)
    ? value.achievements.filter((item): item is string => typeof item === 'string' && /^[a-z0-9:_-]{1,64}$/i.test(item)).slice(0, MAX_ACHIEVEMENTS)
    : [];

  return {
    version: PROFILE_VERSION,
    profileId: value.profileId.trim(),
    displayName: normalizeName(value.displayName),
    preferredChapter: isChapterId(value.preferredChapter) ? value.preferredChapter : 3,
    settings: {
      controlMode: controlMode === 'keyboard' || controlMode === 'touch' || controlMode === 'auto' ? controlMode : 'auto',
      reducedMotion: sourceSettings.reducedMotion === true,
    },
    chapters,
    achievements,
    updatedAt: typeof value.updatedAt === 'string' && !Number.isNaN(Date.parse(value.updatedAt)) ? value.updatedAt : now(),
  };
};

const getStorage = (storage?: ProfileStorage): ProfileStorage | undefined => {
  if (storage) return storage;
  try {
    return typeof window === 'undefined' ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
};

/** Loads a validated profile. Storage failures are treated as a fresh in-memory profile. */
export const loadProfile = (storage?: ProfileStorage): BrowserProfile => {
  const target = getStorage(storage);
  if (!target) return createProfile();
  try {
    const raw = target.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return createProfile();
    return parseProfile(JSON.parse(raw)) ?? createProfile();
  } catch {
    return createProfile();
  }
};

/** Saves only a validated profile and reports whether persistence succeeded. */
export const saveProfile = (profile: BrowserProfile, storage?: ProfileStorage): boolean => {
  const target = getStorage(storage);
  const normalized = parseProfile(profile);
  if (!target || !normalized) return false;
  try {
    target.setItem(PROFILE_STORAGE_KEY, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
};

/** Creates and persists a replacement profile when storage is available. */
export const resetProfile = (storage?: ProfileStorage): BrowserProfile => {
  const target = getStorage(storage);
  if (target) {
    try { target.removeItem(PROFILE_STORAGE_KEY); } catch { /* storage is optional */ }
  }
  const profile = createProfile();
  saveProfile(profile, target);
  return profile;
};
