import type { FacetEvent } from './types.js';

type AnyEvent = FacetEvent | { type: string; [key: string]: unknown };
type Listener = (event: AnyEvent) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener>>();

  on(type: string, cb: Listener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(cb);
    return () => {
      this.listeners.get(type)?.delete(cb);
    };
  }

  emit(event: AnyEvent): void {
    const set = this.listeners.get(event.type);
    if (!set) return;
    for (const cb of [...set]) cb(event);
  }

  clear(): void {
    this.listeners.clear();
  }
}
