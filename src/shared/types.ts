/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

export type ChapterId = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type DifficultyLevel = 1 | 2 | 3 | 4 | 5;

export type Point = {
  x: number;
  y: number;
};

export type InputState = {
  left: boolean;
  right: boolean;
  boost: boolean;
};

export type PlayerEffect = {
  speedBoostRemaining: number;
  slowdownRemaining: number;
  hazardProtectionRemaining: number;
};

export type AuthoritativePlayer = {
  id: string;
  profileId: string;
  runId: string;
  name: string;
  color: string;
  chapter: ChapterId;
  segments: Point[];
  targetLength: number;
  score: number;
  orbsSinceQuiz: number;
  orbsCollected: number;
  state: PlayerState;
  currentAngle: number;
  input: InputState;
  lastProcessedInput: number;
  effects: PlayerEffect;
  activeAttemptId?: string;
};

export type ArenaState = {
  chapter: ChapterId;
  tick: number;
  players: Record<string, AuthoritativePlayer>;
  orbs: Record<string, Orb>;
  hazards: Record<string, Hazard>;
  hazardsActive: boolean;
  hazardActivationThreshold: number;
  hazardActivatedAtTick?: number;
};

export type ArenaPlayerSnapshot = Omit<
  AuthoritativePlayer,
  'profileId' | 'input' | 'activeAttemptId'
>;

export type ArenaSnapshot = {
  chapter: ChapterId;
  tick: number;
  players: Record<string, ArenaPlayerSnapshot>;
  orbs: Record<string, Orb>;
  hazards: Record<string, Hazard>;
  hazardsActive: boolean;
  hazardActivationThreshold: number;
  hazardActivatedAtTick?: number;
};

export type RunSummary = {
  runId: string;
  chapter: ChapterId;
  score: number;
  length: number;
  endedBy: 'self_collision' | 'hazard_collision';
  endedAt: string;
};

export type PlayerState = 'alive' | 'dead' | 'quiz';

export type Orb = {
  id: string;
  x: number;
  y: number;
  value: number;
  color: string;
};

export type Hazard = {
  id: string;
  x: number;
  y: number;
  radius: number;
};

export type LeaderboardEntry = {
  id: string;
  name: string;
  score: number;
  color: string;
};

export const WORLD_SIZE = 150;
export const MAX_ORBS = 300;
