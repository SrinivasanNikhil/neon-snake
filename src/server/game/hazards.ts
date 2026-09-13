import { GAME_CONFIG } from '../../shared/gameConfig';
import type { ChapterId, Hazard, Point } from '../../shared/types';

const BASE_HAZARDS = [
  { distance: 27, angle: Math.PI / 4 },
  { distance: 31, angle: 2.15 },
  { distance: 25, angle: 4.3 },
] as const;

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

export function createChapterHazards(chapter: ChapterId): Record<string, Hazard> {
  const rotation = (chapter - 3) * 0.41;
  return Object.fromEntries(
    BASE_HAZARDS.map(({ distance, angle }, index) => {
      const id = `chapter-${chapter}-hazard-${index + 1}`;
      return [
        id,
        {
          id,
          x: rounded(Math.cos(angle + rotation) * distance),
          y: rounded(Math.sin(angle + rotation) * distance),
          radius: GAME_CONFIG.hazardRadius,
        },
      ];
    }),
  );
}

export function isPointClearOfHazards(
  point: Point,
  hazards: Record<string, Hazard>,
  clearance: number,
): boolean {
  return Object.values(hazards).every((hazard) => {
    const minimumDistance = hazard.radius + clearance;
    return (point.x - hazard.x) ** 2 + (point.y - hazard.y) ** 2 > minimumDistance ** 2;
  });
}

export function hazardGraceTicks(): number {
  return Math.ceil(
    GAME_CONFIG.hazardActivationGraceSeconds * GAME_CONFIG.simulationRate,
  );
}
