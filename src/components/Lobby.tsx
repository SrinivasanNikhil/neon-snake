import { Trophy } from 'lucide-react';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { ChapterId, LeaderboardEntry } from '../shared/types';

export const LOBBY_CHAPTERS = [3, 4, 5, 6, 7, 8, 9, 10] as const;

export type LobbyPreferences = {
  displayName: string;
  chapter: ChapterId;
};

export type LobbyLastRun = {
  reason: 'self_collision' | 'hazard_collision' | 'disconnected' | 'server_shutdown';
  score: number;
  chapter: number;
  leaderboardRank?: number;
};

export type LobbyProps = {
  displayName: string;
  chapter: ChapterId;
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
  connectionError?: string | null;
  lastRun?: LobbyLastRun | null;
  leaderboard: LeaderboardEntry[];
  leaderboardChapter: ChapterId;
  leaderboardLoading: boolean;
  personalBest: number;
  onPlay: (preferences: LobbyPreferences) => void;
  onChapterChange: (chapter: ChapterId) => void;
  onResetProfile: () => void;
};

export function normalizeLobbyName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function validateLobbyName(value: string): string | null {
  const normalized = normalizeLobbyName(value);
  if (!normalized) return 'Enter a display name to play.';
  if (normalized.length > 24) return 'Display names must be 24 characters or fewer.';
  return null;
}

function replayTitle(reason: LobbyLastRun['reason']): string {
  switch (reason) {
    case 'self_collision':
      return 'Self collision';
    case 'hazard_collision':
      return 'Internal hazard collision';
    case 'disconnected':
      return 'Disconnected';
    case 'server_shutdown':
      return 'Arena restarted';
  }
}

function connectionLabel(state: LobbyProps['connectionState']): string {
  switch (state) {
    case 'connected':
      return 'Arena online';
    case 'connecting':
      return 'Connecting to arena…';
    case 'error':
      return 'Connection unavailable';
    case 'disconnected':
      return 'Waiting for connection…';
  }
}

export function Lobby({
  displayName,
  chapter,
  connectionState,
  connectionError,
  lastRun = null,
  leaderboard,
  leaderboardChapter,
  leaderboardLoading,
  personalBest,
  onPlay,
  onChapterChange,
  onResetProfile,
}: LobbyProps) {
  const nameId = useId();
  const chapterId = useId();
  const errorId = useId();
  const [name, setName] = useState(displayName);
  const [selectedChapter, setSelectedChapter] = useState<ChapterId>(chapter);
  const [nameError, setNameError] = useState<string | null>(null);
  const [isConfirmingReset, setIsConfirmingReset] = useState(false);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const keepDataRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setName(displayName), [displayName]);
  useEffect(() => setSelectedChapter(LOBBY_CHAPTERS.includes(chapter as (typeof LOBBY_CHAPTERS)[number]) ? chapter : 3), [chapter]);
  useEffect(() => {
    if (isConfirmingReset) keepDataRef.current?.focus();
  }, [isConfirmingReset]);

  const canPlay = connectionState === 'connected';

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateLobbyName(name);
    setNameError(error);
    if (error) return;
    onPlay({ displayName: normalizeLobbyName(name), chapter: selectedChapter });
  }

  function resetProfile() {
    onResetProfile();
    setIsConfirmingReset(false);
  }

  function cancelReset() {
    setIsConfirmingReset(false);
    requestAnimationFrame(() => resetTriggerRef.current?.focus());
  }

  return (
    <section
      aria-labelledby="lobby-title"
      className="max-h-[calc(100dvh-6rem)] w-full max-w-3xl overflow-y-auto rounded-3xl border border-cyan-400/25 bg-zinc-950/95 p-6 shadow-[0_0_50px_rgba(6,182,212,0.14)] md:max-h-[calc(100dvh-2rem)] md:p-8"
    >
      <div className="text-center mb-6">
        <p className="font-mono text-xs tracking-[0.24em] text-cyan-300">SQL ARENA</p>
        <h2 id="lobby-title" className="mt-2 text-3xl font-black tracking-tight text-white">
          {lastRun ? 'RUN COMPLETE' : 'JOIN ARENA'}
        </h2>
        <p className="mt-2 text-sm text-white/65">
          Choose a chapter and collect orbs. Once deployed, touching a pulsing triangular hazard node ends your run.
        </p>
      </div>

      {lastRun && (
        <aside aria-label="Previous run" className="mb-6 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm">
          <p className="font-mono text-xs uppercase tracking-wider text-rose-300">{replayTitle(lastRun.reason)}</p>
          <p className="mt-1 text-white">Score {lastRun.score} · Chapter {lastRun.chapter}</p>
          {lastRun.leaderboardRank && <p className="mt-1 text-cyan-200">Weekly rank #{lastRun.leaderboardRank}</p>}
        </aside>
      )}

      <p
        role={connectionState === 'error' || connectionError ? 'alert' : 'status'}
        className={`mb-5 text-center text-sm ${connectionState === 'connected' && !connectionError ? 'text-emerald-300' : 'text-amber-200'}`}
      >
        {connectionError || connectionLabel(connectionState)}
      </p>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
            <div>
              <label htmlFor={nameId} className="mb-2 block text-sm font-semibold text-white/90">Display name</label>
              <input
                id={nameId}
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  if (nameError) setNameError(null);
                }}
                maxLength={80}
                autoComplete="nickname"
                aria-describedby={nameError ? errorId : undefined}
                aria-invalid={Boolean(nameError)}
                className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/25"
                placeholder="Your name"
              />
              {nameError && <p id={errorId} role="alert" className="mt-2 text-sm text-rose-300">{nameError}</p>}
            </div>

            <div>
              <label htmlFor={chapterId} className="mb-2 block text-sm font-semibold text-white/90">SQL chapter</label>
              <select
                id={chapterId}
                value={selectedChapter}
                onChange={(event) => {
                  const nextChapter = Number(event.target.value) as ChapterId;
                  setSelectedChapter(nextChapter);
                  onChapterChange(nextChapter);
                }}
                className="w-full rounded-xl border border-white/15 bg-zinc-900 px-4 py-3 text-white outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/25"
              >
                {LOBBY_CHAPTERS.map((value) => <option key={value} value={value}>Chapter {value}</option>)}
              </select>
            </div>

            <button
              type="submit"
              disabled={!canPlay}
              className="w-full rounded-xl bg-white py-4 font-bold text-black transition-colors hover:bg-cyan-100 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-white/40"
            >
              {canPlay ? (lastRun ? 'PLAY AGAIN' : 'PLAY') : connectionState === 'connecting' ? 'CONNECTING…' : 'WAITING FOR ARENA'}
            </button>
          </form>

          <div className="mt-5 border-t border-white/10 pt-4 text-center">
            {!isConfirmingReset ? (
              <button ref={resetTriggerRef} type="button" onClick={() => setIsConfirmingReset(true)} className="text-sm text-white/55 underline decoration-white/30 underline-offset-4 hover:text-white">
                Reset saved progress
              </button>
            ) : (
              <div role="alertdialog" aria-modal="true" aria-label="Confirm profile reset" className="flex flex-col gap-3 rounded-xl border border-rose-300/25 bg-rose-500/10 p-3 text-sm text-white/80">
                <p>This clears your name, chapter progress, and local achievements on this device.</p>
                <div className="flex justify-center gap-3">
                  <button ref={keepDataRef} type="button" onClick={cancelReset} className="rounded-lg px-3 py-2 text-white hover:bg-white/10">Keep data</button>
                  <button type="button" onClick={resetProfile} className="rounded-lg bg-rose-400 px-3 py-2 font-semibold text-black hover:bg-rose-300">Reset profile</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <aside aria-labelledby="lobby-leaderboard-title" className="rounded-2xl border border-yellow-300/20 bg-white/[0.04] p-4">
          <div className="flex items-center gap-2 text-white">
            <Trophy aria-hidden="true" size={18} className="text-yellow-300" />
            <h3 id="lobby-leaderboard-title" className="font-bold">Weekly top 10 · Chapter {leaderboardChapter}</h3>
          </div>
          <div className="mt-3 rounded-xl border border-cyan-300/15 bg-cyan-400/[0.06] px-3 py-2">
            <p className="text-xs uppercase tracking-wider text-cyan-200">Your personal best</p>
            <p className="mt-1 font-mono text-xl font-bold text-white">{personalBest}</p>
          </div>

          {leaderboardLoading ? (
            <p role="status" className="py-8 text-center text-sm text-white/60">Loading weekly scores…</p>
          ) : leaderboard.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/60">No scores recorded this week. Be the first.</p>
          ) : (
            <ol aria-label={`Chapter ${leaderboardChapter} weekly high scores`} className="mt-3 space-y-1.5">
              {leaderboard.slice(0, 10).map((entry, index) => (
                <li key={entry.id} className="flex items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate text-white/85">
                    <span className="mr-2 font-mono text-white/45">{index + 1}.</span>
                    {entry.name}
                  </span>
                  <span className="font-mono font-bold text-yellow-100">{entry.score}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </section>
  );
}
