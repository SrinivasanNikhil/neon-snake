/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';
import {
  applyQuizResult as applyProfileQuizResult,
  applyRunResult,
  loadProfile,
  masteryToDifficulty,
  resetProfile,
  saveProfile,
  type BrowserProfile,
  updateProfilePreferences,
} from '../profile';
import type {
  ClientToServerEvents,
  QuizQuestionPayload,
  QuizResultPayload,
  ServerToClientEvents,
} from '../shared/protocol';
import type {
  ArenaSnapshot,
  ChapterId,
  InputState,
  LeaderboardEntry,
  RunSummary,
} from '../shared/types';

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';
type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface GameStore {
  socket: GameSocket | null;
  gameState: ArenaSnapshot | null;
  playerId: string | null;
  chapter: ChapterId | null;
  profile: BrowserProfile;
  connectionState: ConnectionState;
  connectionError: string | null;
  leaderboard: LeaderboardEntry[];
  leaderboardChapter: ChapterId;
  leaderboardLoading: boolean;
  isQuizOpen: boolean;
  currentQuestion: QuizQuestionPayload | null;
  quizResult: QuizResultPayload | null;
  lastRun: RunSummary | null;
  connect: () => void;
  disconnect: () => void;
  joinGame: (preferences?: { displayName: string; chapter: ChapterId }) => void;
  requestLeaderboard: (chapter: ChapterId) => void;
  resetLocalProfile: () => void;
  sendInput: (input: InputState) => void;
  submitAnswer: (optionId: string) => void;
  continueAfterQuiz: () => void;
}

const initialProfile = loadProfile();
saveProfile(initialProfile);

export const globalGameState: { current: ArenaSnapshot | null } = { current: null };
let lastUiUpdate = 0;
let inputSequence = 0;

export const useGameStore = create<GameStore>((set, get) => ({
  socket: null,
  gameState: null,
  playerId: null,
  chapter: null,
  profile: initialProfile,
  connectionState: 'disconnected',
  connectionError: null,
  leaderboard: [],
  leaderboardChapter: initialProfile.preferredChapter,
  leaderboardLoading: false,
  isQuizOpen: false,
  currentQuestion: null,
  quizResult: null,
  lastRun: null,

  connect: () => {
    if (get().socket) return;

    set({ connectionState: 'connecting', connectionError: null });
    const socket: GameSocket = io();

    socket.on('connect', () => {
      const leaderboardChapter = get().leaderboardChapter;
      set({
        connectionState: 'connected',
        connectionError: null,
        leaderboardLoading: true,
      });
      socket.emit('request_leaderboard', { chapter: leaderboardChapter });
    });

    socket.on('connect_error', () => {
      set({
        connectionState: 'error',
        connectionError: 'Unable to connect to the game server. Retrying…',
      });
    });

    socket.on('disconnect', () => {
      globalGameState.current = null;
      set({
        connectionState: 'disconnected',
        gameState: null,
        playerId: null,
        leaderboardLoading: false,
      });
    });

    socket.on('init', ({ playerId, chapter }) => {
      inputSequence = 0;
      set({ playerId, chapter, lastRun: null });
    });

    socket.on('snapshot', (snapshot) => {
      globalGameState.current = snapshot;
      const now = Date.now();
      if (now - lastUiUpdate >= 100) {
        set({ gameState: snapshot });
        lastUiUpdate = now;
      }
    });

    socket.on('trigger_quiz', (question) => {
      set({ isQuizOpen: true, currentQuestion: question, quizResult: null });
    });

    socket.on('quiz_result', (result) => {
      const { profile, chapter } = get();
      let updatedProfile = profile;
      if (chapter !== null) {
        updatedProfile = applyProfileQuizResult(profile, {
          chapter,
          correct: result.success,
        });
        saveProfile(updatedProfile);
      }
      set({ quizResult: result, profile: updatedProfile });
    });

    socket.on('run_ended', (run) => {
      const updatedProfile = applyRunResult(get().profile, {
        chapter: run.chapter,
        score: run.score,
      });
      saveProfile(updatedProfile);
      set({ profile: updatedProfile, lastRun: run });
    });

    socket.on('leaderboard', ({ chapter, entries }) => {
      if (chapter === get().leaderboardChapter) {
        set({ leaderboard: entries, leaderboardLoading: false });
      }
    });

    socket.on('error_message', ({ message }) => {
      set({ connectionError: message });
    });

    set({ socket });
  },

  disconnect: () => {
    get().socket?.disconnect();
    globalGameState.current = null;
    set({ socket: null, gameState: null, playerId: null, chapter: null });
  },

  joinGame: (preferences) => {
    const { socket } = get();
    if (!socket?.connected) {
      set({ connectionError: 'Connect to the game server before joining.' });
      return;
    }

    const profile = preferences
      ? updateProfilePreferences(get().profile, preferences)
      : get().profile;
    saveProfile(profile);

    globalGameState.current = null;
    set({
      gameState: null,
      playerId: null,
      chapter: profile.preferredChapter,
      leaderboardChapter: profile.preferredChapter,
      leaderboardLoading: true,
      isQuizOpen: false,
      currentQuestion: null,
      quizResult: null,
      lastRun: null,
      connectionError: null,
      profile,
    });
    socket.emit('join', {
      profileId: profile.profileId,
      name: profile.displayName,
      chapter: profile.preferredChapter,
      difficulty: masteryToDifficulty(
        profile.chapters[profile.preferredChapter].mastery,
      ),
    });
  },

  resetLocalProfile: () => {
    const profile = resetProfile();
    set({
      profile,
      chapter: null,
      leaderboard: [],
      leaderboardChapter: profile.preferredChapter,
      leaderboardLoading: Boolean(get().socket?.connected),
      lastRun: null,
      connectionError: null,
    });
    if (get().socket?.connected) {
      get().socket?.emit('request_leaderboard', {
        chapter: profile.preferredChapter,
      });
    }
  },

  requestLeaderboard: (chapter) => {
    const { socket, leaderboardChapter } = get();
    set({
      leaderboardChapter: chapter,
      leaderboard: chapter === leaderboardChapter ? get().leaderboard : [],
      leaderboardLoading: Boolean(socket?.connected),
    });
    if (socket?.connected) socket.emit('request_leaderboard', { chapter });
  },

  sendInput: (input) => {
    const { socket, playerId } = get();
    if (!socket?.connected || !playerId) return;
    inputSequence += 1;
    socket.emit('input', { sequence: inputSequence, ...input });
  },

  submitAnswer: (optionId) => {
    const { socket, currentQuestion, quizResult } = get();
    if (!socket?.connected || !currentQuestion || quizResult) return;
    socket.emit('submit_answer', {
      attemptId: currentQuestion.attemptId,
      optionId,
    });
  },

  continueAfterQuiz: () => {
    const { socket, quizResult } = get();
    if (!socket?.connected || !quizResult) return;
    socket.emit('continue_after_quiz');
    set({ isQuizOpen: false, currentQuestion: null, quizResult: null });
  },
}));
