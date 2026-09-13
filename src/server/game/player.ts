import { v4 as uuidv4 } from 'uuid';
import { GAME_CONFIG } from '../../shared/gameConfig';
import type { AuthoritativePlayer, ChapterId, Point } from '../../shared/types';

export type CreatePlayerOptions = {
  id: string;
  profileId: string;
  name: string;
  color: string;
  chapter: ChapterId;
  start: Point;
  angle: number;
  runId?: string;
};

export function createAuthoritativePlayer(
  options: CreatePlayerOptions,
): AuthoritativePlayer {
  const segments = Array.from({ length: GAME_CONFIG.initialLength }, (_, index) => ({
    x: options.start.x - Math.cos(options.angle) * index * GAME_CONFIG.segmentSpacing,
    y: options.start.y - Math.sin(options.angle) * index * GAME_CONFIG.segmentSpacing,
  }));

  return {
    id: options.id,
    profileId: options.profileId,
    runId: options.runId ?? uuidv4(),
    name: options.name,
    color: options.color,
    chapter: options.chapter,
    segments,
    targetLength: GAME_CONFIG.initialLength,
    score: 0,
    orbsSinceQuiz: 0,
    orbsCollected: 0,
    state: 'alive',
    currentAngle: options.angle,
    input: { left: false, right: false, boost: false },
    lastProcessedInput: 0,
    effects: {
      speedBoostRemaining: 0,
      slowdownRemaining: 0,
      hazardProtectionRemaining: GAME_CONFIG.hazardActivationGraceSeconds,
    },
  };
}

export function applyInput(
  player: AuthoritativePlayer,
  input: AuthoritativePlayer['input'],
  sequence: number,
): boolean {
  if (player.state !== 'alive' || !Number.isSafeInteger(sequence)) return false;
  if (sequence <= player.lastProcessedInput) return false;

  player.input = { ...input };
  player.lastProcessedInput = sequence;
  return true;
}

export function clearInput(player: AuthoritativePlayer): void {
  player.input = { left: false, right: false, boost: false };
}
