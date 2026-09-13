/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, TriangleAlert, Trophy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { gameInput } from '../client/input';
import { useGameStore } from '../store/gameStore';
import { Lobby } from './Lobby';
import { TouchControls } from './TouchControls';

export function hazardStatusLabel(
  hazardsActive: boolean,
  activationThreshold: number,
  collectedOrbs: number,
): string {
  if (hazardsActive) return 'DANGER: Touching a pulsing warning node ends your run';
  const remaining = Math.max(0, activationThreshold - collectedOrbs);
  return `Internal hazards deploy at ${activationThreshold} collected orbs · ${remaining} remaining`;
}

export function UI() {
  const gameState = useGameStore((state) => state.gameState);
  const playerId = useGameStore((state) => state.playerId);
  const joinGame = useGameStore((state) => state.joinGame);
  const resetLocalProfile = useGameStore((state) => state.resetLocalProfile);
  const profile = useGameStore((state) => state.profile);
  const connectionState = useGameStore((state) => state.connectionState);
  const connectionError = useGameStore((state) => state.connectionError);
  const leaderboard = useGameStore((state) => state.leaderboard);
  const leaderboardChapter = useGameStore((state) => state.leaderboardChapter);
  const leaderboardLoading = useGameStore((state) => state.leaderboardLoading);
  const requestLeaderboard = useGameStore((state) => state.requestLeaderboard);
  const isQuizOpen = useGameStore((state) => state.isQuizOpen);
  const currentQuestion = useGameStore((state) => state.currentQuestion);
  const quizResult = useGameStore((state) => state.quizResult);
  const submitAnswer = useGameStore((state) => state.submitAnswer);
  const continueAfterQuiz = useGameStore((state) => state.continueAfterQuiz);
  const lastRun = useGameStore((state) => state.lastRun);
  const player = playerId && gameState ? gameState.players[playerId] : null;
  const isAlive = player?.state === 'alive' || player?.state === 'quiz';
  const isDead = player?.state === 'dead' || lastRun !== null;
  const hazardStatus = gameState && player
    ? hazardStatusLabel(
        gameState.hazardsActive,
        gameState.hazardActivationThreshold,
        player.orbsCollected,
      )
    : null;
  const [selectedOption, setSelectedOption] = useState<string | null>(null);

  useEffect(() => setSelectedOption(null), [currentQuestion]);

  const correctOption = currentQuestion?.options.find(
    ({ id }) => id === quizResult?.correctOptionId,
  );

  return (
    <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-4">
      <div className="flex justify-between items-start pointer-events-auto relative">
        <div className="flex flex-col gap-1 z-10">
          <h1
            className="text-3xl font-black text-white tracking-tighter"
            style={{ textShadow: '0 0 10px rgba(255,255,255,0.5)' }}
          >
            NEON.SNAKE
          </h1>
          {isAlive && player && (
            <div className="font-mono text-white/80 font-bold">
              <div>Score: {Math.floor(player.score)}</div>
              <div>Length: {player.segments.length}/100</div>
              <div className="text-xs text-cyan-300">Chapter {player.chapter}</div>
            </div>
          )}
        </div>

        <div className="absolute left-1/2 -translate-x-1/2 top-0 gap-2 opacity-80 pointer-events-none hidden sm:flex">
          <div className="text-xs font-mono text-white bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
            A / D · TURN
          </div>
          <div className="text-xs font-mono text-white bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
            SPACE · BOOST
          </div>
        </div>

        <button
          onClick={() => window.open(window.location.href, '_blank')}
          className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full text-white text-sm font-bold"
        >
          <ExternalLink size={16} />
          <span>New Tab</span>
        </button>
      </div>

      {isAlive && hazardStatus && (
        <div
          role={gameState?.hazardsActive ? 'alert' : undefined}
          aria-live={gameState?.hazardsActive ? 'assertive' : undefined}
          className={`absolute left-1/2 top-24 z-10 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-xl border px-3 py-2 text-center font-mono text-xs font-bold uppercase tracking-wide shadow-lg backdrop-blur-md sm:top-16 ${
            gameState?.hazardsActive
              ? 'border-orange-300/70 bg-red-950/90 text-orange-100 shadow-orange-500/20'
              : 'border-amber-300/30 bg-black/65 text-amber-100'
          }`}
        >
          <TriangleAlert aria-hidden="true" size={18} className={gameState?.hazardsActive ? 'animate-pulse text-orange-300 motion-reduce:animate-none' : 'text-amber-300'} />
          <span>{hazardStatus}</span>
        </div>
      )}

      {isAlive && leaderboard.length > 0 && (
        <div className="absolute top-24 right-4 hidden w-64 bg-black/40 backdrop-blur-md rounded-2xl p-4 border border-white/10 pointer-events-auto sm:block">
          <div className="flex items-center gap-2 mb-4 text-white/80 font-semibold">
            <Trophy size={18} className="text-yellow-400" />
            <h2>WEEKLY · CH {leaderboardChapter}</h2>
          </div>
          <div className="flex flex-col gap-2">
            {leaderboard.map((entry, index) => (
              <div key={entry.id} className="flex justify-between items-center text-sm">
                <span style={{ color: entry.color }} className="font-medium truncate">
                  {index + 1}. {entry.name}
                </span>
                <span className="font-mono text-white/80">{entry.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {(!player || isDead) && !isQuizOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute inset-0 flex items-start justify-center overflow-y-auto bg-black/60 px-4 pt-20 pb-4 pointer-events-auto backdrop-blur-sm md:items-center md:p-4"
          >
            <Lobby
              displayName={profile.displayName}
              chapter={profile.preferredChapter}
              connectionState={connectionState}
              connectionError={connectionError}
              leaderboard={leaderboard}
              leaderboardChapter={leaderboardChapter}
              leaderboardLoading={leaderboardLoading}
              personalBest={profile.chapters[leaderboardChapter].highScore}
              lastRun={lastRun ? {
                reason: lastRun.endedBy,
                score: lastRun.score,
                chapter: lastRun.chapter,
              } : null}
              onPlay={joinGame}
              onChapterChange={requestLeaderboard}
              onResetProfile={resetLocalProfile}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <TouchControls
        controller={gameInput}
        enabled={Boolean(isAlive && !isQuizOpen)}
      />

      <AnimatePresence>
        {isQuizOpen && currentQuestion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center pointer-events-auto bg-black/80 backdrop-blur-md z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="quiz-title"
              className="bg-zinc-950 border border-cyan-500/30 rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-[0_0_50px_rgba(6,182,212,0.15)] flex flex-col gap-6"
            >
              {!quizResult ? (
                <>
                  <div className="flex justify-between border-b border-white/10 pb-4">
                    <span className="text-xs font-mono font-bold tracking-widest text-cyan-400 uppercase">
                      Chapter {currentQuestion.chapter} · Difficulty {currentQuestion.difficulty}
                    </span>
                    <span className="text-xs font-mono font-bold text-white/50">PROTECTED</span>
                  </div>
                  <h3 id="quiz-title" className="text-xl md:text-2xl font-black text-white leading-tight">
                    {currentQuestion.prompt}
                  </h3>
                  <div className="flex flex-col gap-3">
                    {currentQuestion.options.map((option, index) => {
                      const selected = selectedOption === option.id;
                      return (
                        <button
                          key={option.id}
                          onClick={() => setSelectedOption(option.id)}
                          className={`w-full text-left p-4 rounded-xl border font-medium transition-all ${
                            selected
                              ? 'bg-cyan-500/10 border-cyan-400 text-cyan-300'
                              : 'bg-zinc-900/50 border-white/5 hover:border-white/20 text-white/80'
                          }`}
                        >
                          <span className="mr-3 font-mono">{String.fromCharCode(65 + index)}.</span>
                          {option.text}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => selectedOption && submitAnswer(selectedOption)}
                    disabled={!selectedOption}
                    className="w-full py-4 rounded-xl font-bold bg-gradient-to-r from-cyan-500 to-blue-500 text-white disabled:opacity-30"
                  >
                    SUBMIT ANSWER
                  </button>
                </>
              ) : (
                <div className="flex flex-col gap-5 text-center">
                  <h3 className={`text-3xl font-black ${quizResult.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {quizResult.success ? 'CORRECT!' : 'INCORRECT'}
                  </h3>
                  <p className="text-white/80">
                    Score {quizResult.scoreDelta >= 0 ? '+' : ''}{quizResult.scoreDelta}
                    {quizResult.lengthDelta !== 0 && ` · Length ${quizResult.lengthDelta}`}
                  </p>
                  <div className="bg-zinc-900 border border-white/10 rounded-xl p-4 text-left">
                    <p className="text-xs uppercase tracking-wider text-emerald-400 mb-1">Correct answer</p>
                    <p className="text-emerald-200">{correctOption?.text}</p>
                    <p className="text-white/70 mt-4">{quizResult.explanation}</p>
                    <p className="text-cyan-200 mt-3 text-sm">Review: {quizResult.reviewConcept}</p>
                    <a
                      href={quizResult.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block text-blue-300 underline mt-3 text-sm"
                    >
                      {quizResult.sourceTitle}
                    </a>
                  </div>
                  <button
                    onClick={continueAfterQuiz}
                    className="w-full py-4 rounded-xl font-bold bg-white text-black"
                  >
                    CONTINUE
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
