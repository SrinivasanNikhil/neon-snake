import type { InputPayload } from '../../shared/protocol';

/** The controls a player may hold at one time. */
export type InputControl = 'left' | 'right' | 'boost';

/**
 * Client-only input state. It intentionally omits the network sequence number
 * added by the store before a state is sent to the authoritative server.
 */
export type InputState = Omit<InputPayload, 'sequence'>;

const emptyInput = (): InputState => ({ left: false, right: false, boost: false });

/**
 * A small imperative input source shared by keyboard and touch affordances.
 * It does not know about React, the socket, or the render loop: consumers can
 * read its current state at their own send cadence.
 */
export class GameInputController {
  private state = emptyInput();
  private readonly listeners = new Set<(input: InputState) => void>();

  getSnapshot(): InputState {
    return { ...this.state };
  }

  setControl(control: InputControl, pressed: boolean): void {
    if (this.state[control] === pressed) return;
    this.state = { ...this.state, [control]: pressed };
    this.emit();
  }

  press(control: InputControl): void {
    this.setControl(control, true);
  }

  release(control: InputControl): void {
    this.setControl(control, false);
  }

  reset(): void {
    if (!this.state.left && !this.state.right && !this.state.boost) return;
    this.state = emptyInput();
    this.emit();
  }

  subscribe(listener: (input: InputState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}

export const gameInput = new GameInputController();
