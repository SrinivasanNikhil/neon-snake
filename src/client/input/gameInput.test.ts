import { describe, expect, it, vi } from 'vitest';
import { GameInputController } from './gameInput';
import { isEditableTarget, keyboardControlForKey } from './keyboard';

describe('GameInputController', () => {
  it('tracks simultaneous holds and resets without leaking its state', () => {
    const controller = new GameInputController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.press('left');
    controller.press('boost');
    expect(controller.getSnapshot()).toEqual({ left: true, right: false, boost: true });

    const snapshot = controller.getSnapshot();
    snapshot.left = false;
    expect(controller.getSnapshot().left).toBe(true);

    controller.release('left');
    controller.reset();
    expect(controller.getSnapshot()).toEqual({ left: false, right: false, boost: false });
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('does not notify when a control is already in its requested state', () => {
    const controller = new GameInputController();
    const listener = vi.fn();
    controller.subscribe(listener);

    controller.release('right');
    controller.press('right');
    controller.press('right');

    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('keyboard controls', () => {
  it.each([
    ['a', 'left'],
    ['ArrowLeft', 'left'],
    ['d', 'right'],
    ['ArrowRight', 'right'],
    ['w', 'boost'],
    [' ', 'boost'],
    ['Shift', 'boost'],
  ])('maps %s to %s', (key, expected) => {
    expect(keyboardControlForKey(key)).toBe(expected);
  });

  it('does not claim regular typing keys or editable targets', () => {
    expect(keyboardControlForKey('x')).toBeNull();
    expect(isEditableTarget(null)).toBe(false);
  });
});
