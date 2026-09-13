import { useCallback, useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import type { GameInputController, InputControl } from '../client/input';

type TouchControlsProps = {
  controller: GameInputController;
  enabled: boolean;
  className?: string;
};

const controls: Array<{ control: InputControl; label: string; glyph: string; hint: string }> = [
  { control: 'left', label: 'Turn left', glyph: '‹', hint: 'Left' },
  { control: 'boost', label: 'Boost', glyph: '▲', hint: 'Boost' },
  { control: 'right', label: 'Turn right', glyph: '›', hint: 'Right' },
];

/**
 * Pointer-safe, hold-to-steer mobile controls. Each button tracks every active
 * pointer, so two fingers can hold turn and boost together without one release
 * cancelling the other.
 */
export function TouchControls({ controller, enabled, className = '' }: TouchControlsProps) {
  const activePointers = useRef<Record<InputControl, Set<number>>>({
    left: new Set(),
    right: new Set(),
    boost: new Set(),
  });

  const setPointer = useCallback(
    (control: InputControl, pointerId: number, pressed: boolean) => {
      const pointers = activePointers.current[control];
      if (pressed) pointers.add(pointerId);
      else pointers.delete(pointerId);
      controller.setControl(control, pointers.size > 0);
    },
    [controller],
  );

  const onPointerDown = useCallback(
    (control: InputControl, event: PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      setPointer(control, event.pointerId, true);
    },
    [setPointer],
  );

  const onPointerRelease = useCallback(
    (control: InputControl, event: PointerEvent<HTMLButtonElement>) => {
      setPointer(control, event.pointerId, false);
    },
    [setPointer],
  );

  useEffect(() => {
    if (enabled) return undefined;
    for (const pointers of Object.values(activePointers.current)) pointers.clear();
    controller.reset();
    return undefined;
  }, [controller, enabled]);

  useEffect(() => () => {
    for (const pointers of Object.values(activePointers.current)) pointers.clear();
    controller.reset();
  }, [controller]);

  if (!enabled) return null;

  return (
    <div
      aria-label="Touch game controls"
      className={`pointer-events-auto fixed inset-x-0 bottom-3 z-40 flex justify-center px-4 sm:hidden ${className}`}
    >
      <div className="flex items-end gap-3 rounded-2xl border border-white/15 bg-black/50 p-2 backdrop-blur-md">
        {controls.map(({ control, label, glyph, hint }) => (
          <button
            key={control}
            type="button"
            aria-label={label}
            onPointerDown={(event) => onPointerDown(control, event)}
            onPointerUp={(event) => onPointerRelease(control, event)}
            onPointerCancel={(event) => onPointerRelease(control, event)}
            onLostPointerCapture={(event) => onPointerRelease(control, event)}
            onKeyDown={(event) => {
              if (event.repeat) return;
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                controller.press(control);
              }
            }}
            onKeyUp={(event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                controller.release(control);
              }
            }}
            onBlur={() => controller.release(control)}
            className={`flex min-h-16 min-w-16 select-none touch-none flex-col items-center justify-center rounded-xl border border-white/15 bg-white/10 px-3 text-white shadow-lg transition-colors active:bg-cyan-400/40 ${
              control === 'boost' ? 'min-h-20 min-w-20 text-cyan-200' : ''
            }`}
          >
            <span aria-hidden="true" className="text-3xl leading-none font-black">{glyph}</span>
            <span className="mt-1 text-[10px] font-bold uppercase tracking-wider text-white/75">{hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
