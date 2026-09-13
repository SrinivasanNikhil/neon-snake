import { describe, expect, it } from 'vitest';
import { hazardStatusLabel } from './UI';

describe('hazard HUD status', () => {
  it('teaches the player when hazards will deploy', () => {
    expect(hazardStatusLabel(false, 8, 3)).toBe(
      'Internal hazards deploy at 8 collected orbs · 5 remaining',
    );
  });

  it('switches to an unambiguous warning after activation', () => {
    expect(hazardStatusLabel(true, 8, 8)).toBe(
      'DANGER: Touching a pulsing warning node ends your run',
    );
  });
});
