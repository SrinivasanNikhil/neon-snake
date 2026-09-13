import { GAME_CONFIG } from '../../shared/gameConfig';
import type { ArenaState, AuthoritativePlayer } from '../../shared/types';
import { hazardGraceTicks } from './hazards';

export function hasSelfCollision(player: AuthoritativePlayer): boolean {
  if (
    player.state !== 'alive' ||
    player.segments.length < GAME_CONFIG.selfCollisionMinimumLength
  ) {
    return false;
  }

  const head = player.segments[0];
  const radiusSquared = GAME_CONFIG.selfCollisionRadius ** 2;

  for (
    let index = GAME_CONFIG.selfCollisionIgnoredSegments;
    index < player.segments.length;
    index += 1
  ) {
    const segment = player.segments[index];
    const dx = head.x - segment.x;
    const dy = head.y - segment.y;
    if (dx * dx + dy * dy <= radiusSquared) return true;
  }

  return false;
}

export function markSelfCollisionDeath(player: AuthoritativePlayer): boolean {
  if (!hasSelfCollision(player)) return false;
  player.state = 'dead';
  player.input = { left: false, right: false, boost: false };
  return true;
}

export function hasHazardCollision(
  arena: ArenaState,
  player: AuthoritativePlayer,
): boolean {
  if (
    player.state !== 'alive' ||
    player.effects.hazardProtectionRemaining > 0 ||
    !arena.hazardsActive ||
    arena.hazardActivatedAtTick === undefined ||
    arena.tick - arena.hazardActivatedAtTick < hazardGraceTicks()
  ) {
    return false;
  }

  const head = player.segments[0];
  if (!head) return false;

  return Object.values(arena.hazards).some((hazard) => {
    const dx = head.x - hazard.x;
    const dy = head.y - hazard.y;
    return dx * dx + dy * dy <= hazard.radius ** 2;
  });
}

export function markHazardCollisionDeath(
  arena: ArenaState,
  player: AuthoritativePlayer,
): boolean {
  if (!hasHazardCollision(arena, player)) return false;
  player.state = 'dead';
  player.input = { left: false, right: false, boost: false };
  return true;
}
