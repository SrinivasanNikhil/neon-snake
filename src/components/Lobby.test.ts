import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  Lobby,
  LOBBY_CHAPTERS,
  normalizeLobbyName,
  type LobbyProps,
  validateLobbyName,
} from './Lobby';

const lobbyProps = (overrides: Partial<LobbyProps> = {}): LobbyProps => ({
  displayName: 'Ada',
  chapter: 3,
  connectionState: 'connected',
  leaderboard: [],
  leaderboardChapter: 3,
  leaderboardLoading: false,
  personalBest: 42,
  onPlay: () => undefined,
  onChapterChange: () => undefined,
  onResetProfile: () => undefined,
  ...overrides,
});

describe('Lobby form helpers', () => {
  it('normalizes a display name before submission', () => {
    expect(normalizeLobbyName('  Ada   Lovelace  ')).toBe('Ada Lovelace');
  });

  it('requires a nonempty display name with a 24-character limit', () => {
    expect(validateLobbyName('   ')).toBe('Enter a display name to play.');
    expect(validateLobbyName('x'.repeat(25))).toBe('Display names must be 24 characters or fewer.');
    expect(validateLobbyName('Ada')).toBeNull();
  });

  it('exposes precisely the supported chapter range', () => {
    expect(LOBBY_CHAPTERS).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('renders the selected chapter personal best and an empty weekly state', () => {
    const markup = renderToStaticMarkup(createElement(Lobby, lobbyProps()));

    expect(markup).toContain('Weekly top 10 · Chapter 3');
    expect(markup).toContain('Your personal best');
    expect(markup).toContain('42');
    expect(markup).toContain('No scores recorded this week. Be the first.');
  });

  it('renders at most ten weekly leaderboard entries', () => {
    const leaderboard = Array.from({ length: 11 }, (_, index) => ({
      id: `player-${index}`,
      name: `Player ${index}`,
      score: 100 - index,
      color: '#fff',
    }));
    const markup = renderToStaticMarkup(createElement(
      Lobby,
      lobbyProps({ leaderboard, leaderboardChapter: 8 }),
    ));

    expect(markup).toContain('Weekly top 10 · Chapter 8');
    expect(markup).toContain('Player 9');
    expect(markup).not.toContain('Player 10');
  });

  it('renders a loading state while switching chapters', () => {
    const markup = renderToStaticMarkup(createElement(
      Lobby,
      lobbyProps({ leaderboardLoading: true, leaderboardChapter: 6 }),
    ));

    expect(markup).toContain('Loading weekly scores…');
  });

  it('explains internal hazards and reports a hazard collision', () => {
    const markup = renderToStaticMarkup(createElement(
      Lobby,
      lobbyProps({
        lastRun: { reason: 'hazard_collision', score: 27, chapter: 7 },
      }),
    ));

    expect(markup).toContain('touching a pulsing triangular hazard node ends your run');
    expect(markup).toContain('Internal hazard collision');
    expect(markup).toContain('Score 27 · Chapter 7');
  });
});
