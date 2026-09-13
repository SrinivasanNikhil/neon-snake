import { GAME_CONFIG } from '../../shared/gameConfig';
import type { AuthoritativePlayer } from '../../shared/types';

export function collectOrb(player: AuthoritativePlayer, value: number): boolean {
  if (player.state !== 'alive' || !Number.isFinite(value) || value <= 0) return false;

  player.score += value;
  player.targetLength = Math.min(
    GAME_CONFIG.maximumLength,
    player.targetLength + Math.max(1, Math.floor(value)),
  );
  player.orbsSinceQuiz += 1;
  player.orbsCollected += 1;

  if (player.orbsSinceQuiz >= GAME_CONFIG.quizOrbInterval) {
    player.orbsSinceQuiz = 0;
    player.state = 'quiz';
    player.input = { left: false, right: false, boost: false };
    return true;
  }

  return false;
}

export function applyQuizResult(
  player: AuthoritativePlayer,
  correct: boolean,
): { scoreDelta: number; lengthDelta: number } {
  if (player.state !== 'quiz') return { scoreDelta: 0, lengthDelta: 0 };

  if (correct) {
    player.score += GAME_CONFIG.correctAnswerScoreBonus;
    player.effects.speedBoostRemaining = GAME_CONFIG.correctAnswerBoostSeconds;
    return {
      scoreDelta: GAME_CONFIG.correctAnswerScoreBonus,
      lengthDelta: 0,
    };
  }

  const previousScore = player.score;
  const previousLength = player.targetLength;
  player.score = Math.max(
    GAME_CONFIG.minimumScore,
    player.score - GAME_CONFIG.incorrectAnswerScorePenalty,
  );
  player.targetLength = Math.max(
    GAME_CONFIG.minimumLength,
    player.targetLength - GAME_CONFIG.incorrectAnswerLengthPenalty,
  );
  player.segments = player.segments.slice(0, player.targetLength);
  player.effects.slowdownRemaining = GAME_CONFIG.incorrectAnswerSlowdownSeconds;

  return {
    scoreDelta: player.score - previousScore,
    lengthDelta: player.targetLength - previousLength,
  };
}

export function continueAfterQuiz(player: AuthoritativePlayer): boolean {
  if (player.state !== 'quiz') return false;
  player.state = 'alive';
  player.effects.hazardProtectionRemaining =
    GAME_CONFIG.hazardActivationGraceSeconds;
  return true;
}
