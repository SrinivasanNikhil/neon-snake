import { GAME_CONFIG } from '../../shared/gameConfig';
import { WORLD_SIZE } from '../../shared/types';
import type { AuthoritativePlayer, Point } from '../../shared/types';

function moveBody(segments: Point[], head: Point, targetLength: number): Point[] {
  const next: Point[] = [head];
  const cappedLength = Math.min(targetLength, GAME_CONFIG.maximumLength);

  for (let index = 1; index < cappedLength; index += 1) {
    const previous = next[index - 1];
    const current = segments[index] ?? segments[segments.length - 1] ?? previous;
    const dx = previous.x - current.x;
    const dy = previous.y - current.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= GAME_CONFIG.segmentSpacing || distance === 0) {
      next.push({ ...current });
      continue;
    }

    const move = distance - GAME_CONFIG.segmentSpacing;
    next.push({
      x: current.x + (dx / distance) * move,
      y: current.y + (dy / distance) * move,
    });
  }

  return next;
}

function tickEffects(player: AuthoritativePlayer, deltaSeconds: number): void {
  player.effects.speedBoostRemaining = Math.max(
    0,
    player.effects.speedBoostRemaining - deltaSeconds,
  );
  player.effects.slowdownRemaining = Math.max(
    0,
    player.effects.slowdownRemaining - deltaSeconds,
  );
  player.effects.hazardProtectionRemaining = Math.max(
    0,
    player.effects.hazardProtectionRemaining - deltaSeconds,
  );
}

export function advancePlayer(
  player: AuthoritativePlayer,
  deltaSeconds: number,
): void {
  if (player.state !== 'alive' || player.segments.length === 0) return;

  tickEffects(player, deltaSeconds);

  const turnDirection = Number(player.input.left) - Number(player.input.right);
  player.currentAngle += turnDirection * GAME_CONFIG.turnSpeed * deltaSeconds;

  let speed = player.input.boost
    ? GAME_CONFIG.manualBoostSpeed
    : GAME_CONFIG.baseSpeed;
  if (player.effects.speedBoostRemaining > 0) {
    speed = GAME_CONFIG.manualBoostSpeed * GAME_CONFIG.quizBoostMultiplier;
  }
  if (player.effects.slowdownRemaining > 0) {
    speed *= GAME_CONFIG.slowdownMultiplier;
  }

  const currentHead = player.segments[0];
  const boundary = WORLD_SIZE / 2;
  const head = {
    x: Math.max(
      -boundary,
      Math.min(boundary, currentHead.x + Math.cos(player.currentAngle) * speed * deltaSeconds),
    ),
    y: Math.max(
      -boundary,
      Math.min(boundary, currentHead.y + Math.sin(player.currentAngle) * speed * deltaSeconds),
    ),
  };

  player.targetLength = Math.max(
    GAME_CONFIG.minimumLength,
    Math.min(GAME_CONFIG.maximumLength, Math.floor(player.targetLength)),
  );
  player.segments = moveBody(player.segments, head, player.targetLength);
}
