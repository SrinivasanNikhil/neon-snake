import { useEffect } from 'react';
import type { GameInputController, InputControl } from './gameInput';

export function keyboardControlForKey(key: string): InputControl | null {
  switch (key) {
    case 'a':
    case 'A':
    case 'ArrowLeft':
      return 'left';
    case 'd':
    case 'D':
    case 'ArrowRight':
      return 'right';
    case ' ':
    case 'Spacebar':
    case 'w':
    case 'W':
    case 'ArrowUp':
    case 'Shift':
      return 'boost';
    default:
      return null;
  }
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  );
}

export type KeyboardControlsOptions = {
  enabled: boolean;
  controller: GameInputController;
};

/** Binds keyboard play controls to any controller and returns a cleanup function. */
export function bindKeyboardControls({ enabled, controller }: KeyboardControlsOptions): () => void {
  if (!enabled || typeof window === 'undefined') {
    controller.reset();
    return () => undefined;
  }

  const setKey = (event: KeyboardEvent, pressed: boolean) => {
    if (isEditableTarget(event.target)) return;
    const control = keyboardControlForKey(event.key);
    if (!control) return;
    event.preventDefault();
    controller.setControl(control, pressed);
  };
  const onKeyDown = (event: KeyboardEvent) => setKey(event, true);
  const onKeyUp = (event: KeyboardEvent) => setKey(event, false);
  const clear = () => controller.reset();
  const clearWhenHidden = () => {
    if (document.visibilityState === 'hidden') clear();
  };

  window.addEventListener('keydown', onKeyDown, { passive: false });
  window.addEventListener('keyup', onKeyUp, { passive: false });
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clearWhenHidden);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', clear);
    document.removeEventListener('visibilitychange', clearWhenHidden);
    controller.reset();
  };
}

/** React convenience wrapper around {@link bindKeyboardControls}. */
export function useKeyboardControls({ enabled, controller }: KeyboardControlsOptions): void {
  useEffect(() => bindKeyboardControls({ enabled, controller }), [controller, enabled]);
}
