import { GAME_CONFIG } from '../../shared/gameConfig';
import type { ArenaState, AuthoritativePlayer, Orb, RunSummary } from '../../shared/types';
import { markHazardCollisionDeath, markSelfCollisionDeath } from './collisions';
import { advancePlayer } from './movement';
import { collectOrb } from './scoring';

export type SimulationResult = {
  endedRuns: RunSummary[];
  quizTriggeredPlayerIds: string[];
  collectedOrbIds: string[];
};

function collidesWithOrb(player: AuthoritativePlayer, orb: Orb): boolean {
  const head = player.segments[0];
  if (!head) return false;
  const dx = head.x - orb.x;
  const dy = head.y - orb.y;
  return dx * dx + dy * dy <= GAME_CONFIG.orbCollectionRadius ** 2;
}

function resolveOrbPickups(
  arena: ArenaState,
  result: SimulationResult,
): void {
  const players = Object.values(arena.players)
    .filter((player) => player.state === 'alive')
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const orbId of Object.keys(arena.orbs).sort()) {
    const orb = arena.orbs[orbId];
    const candidates = players
      .filter((player) => player.state === 'alive' && collidesWithOrb(player, orb))
      .sort((left, right) => {
        const leftHead = left.segments[0];
        const rightHead = right.segments[0];
        const leftDistance = (leftHead.x - orb.x) ** 2 + (leftHead.y - orb.y) ** 2;
        const rightDistance = (rightHead.x - orb.x) ** 2 + (rightHead.y - orb.y) ** 2;
        return leftDistance - rightDistance || left.id.localeCompare(right.id);
      });

    const winner = candidates[0];
    if (!winner) continue;

    delete arena.orbs[orbId];
    result.collectedOrbIds.push(orbId);
    if (collectOrb(winner, orb.value)) {
      result.quizTriggeredPlayerIds.push(winner.id);
    }
  }
}

function activateHazardsIfThresholdReached(arena: ArenaState): void {
  if (
    arena.hazardsActive ||
    !Object.values(arena.players).some(
      (player) => player.orbsCollected >= arena.hazardActivationThreshold,
    )
  ) {
    return;
  }

  arena.hazardsActive = true;
  arena.hazardActivatedAtTick = arena.tick;
}

function runSummary(
  player: AuthoritativePlayer,
  endedBy: RunSummary['endedBy'],
  now: Date,
): RunSummary {
  return {
    runId: player.runId,
    chapter: player.chapter,
    score: player.score,
    length: player.segments.length,
    endedBy,
    endedAt: now.toISOString(),
  };
}

export function advanceArena(
  arena: ArenaState,
  deltaSeconds = 1 / GAME_CONFIG.simulationRate,
  now = new Date(),
): SimulationResult {
  const result: SimulationResult = {
    endedRuns: [],
    quizTriggeredPlayerIds: [],
    collectedOrbIds: [],
  };

  arena.tick += 1;

  for (const player of Object.values(arena.players)) {
    advancePlayer(player, deltaSeconds);
    if (markSelfCollisionDeath(player)) {
      result.endedRuns.push(runSummary(player, 'self_collision', now));
      continue;
    }
    if (markHazardCollisionDeath(arena, player)) {
      result.endedRuns.push(runSummary(player, 'hazard_collision', now));
    }
  }

  resolveOrbPickups(arena, result);
  activateHazardsIfThresholdReached(arena);
  return result;
}
