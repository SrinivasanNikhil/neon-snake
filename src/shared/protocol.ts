import type {
  ArenaSnapshot,
  ChapterId,
  DifficultyLevel,
  InputState,
  LeaderboardEntry,
  RunSummary,
} from './types';

export type JoinPayload = {
  profileId: string;
  name: string;
  chapter: ChapterId;
  difficulty: DifficultyLevel;
};

export type InputPayload = InputState & {
  sequence: number;
};

export type SubmitAnswerPayload = {
  attemptId: string;
  optionId: string;
};

export type LeaderboardRequestPayload = {
  chapter: ChapterId;
};

export type QuizQuestionPayload = {
  attemptId: string;
  questionId: string;
  chapter: ChapterId;
  difficulty: DifficultyLevel;
  prompt: string;
  options: Array<{ id: string; text: string }>;
};

export type QuizResultPayload = {
  success: boolean;
  correctOptionId: string;
  explanation: string;
  reviewConcept: string;
  sourceUrl: string;
  sourceTitle: string;
  scoreDelta: number;
  lengthDelta: number;
};

export type ProtocolError = {
  code: string;
  message: string;
};

export interface ClientToServerEvents {
  join: (payload: JoinPayload) => void;
  request_leaderboard: (payload: LeaderboardRequestPayload) => void;
  input: (payload: InputPayload) => void;
  submit_answer: (payload: SubmitAnswerPayload) => void;
  continue_after_quiz: () => void;
}

export interface ServerToClientEvents {
  init: (payload: { playerId: string; chapter: ChapterId; tick: number }) => void;
  snapshot: (payload: ArenaSnapshot) => void;
  trigger_quiz: (payload: QuizQuestionPayload) => void;
  quiz_result: (payload: QuizResultPayload) => void;
  run_ended: (payload: RunSummary) => void;
  leaderboard: (payload: { chapter: ChapterId; entries: LeaderboardEntry[] }) => void;
  error_message: (payload: ProtocolError) => void;
}

export interface InterServerEvents {}

export type SocketData = {
  playerId?: string;
  chapter?: ChapterId;
  profileId?: string;
};
