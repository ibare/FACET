import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/event-bus.js';

describe('EventBus', () => {
  it('delivers events to subscribers of matching type only', () => {
    const bus = new EventBus();
    const tickCb = vi.fn();
    const phaseCb = vi.fn();
    bus.on('container:tick', tickCb);
    bus.on('body:phase', phaseCb);

    bus.emit({ type: 'container:tick', tickCount: 1 });
    expect(tickCb).toHaveBeenCalledTimes(1);
    expect(phaseCb).not.toHaveBeenCalled();

    bus.emit({ type: 'body:phase', phase: 'comparing' });
    expect(phaseCb).toHaveBeenCalledWith({ type: 'body:phase', phase: 'comparing' });
  });

  it('unsubscribes cleanly via returned disposer', () => {
    const bus = new EventBus();
    const cb = vi.fn();
    const unsub = bus.on('x', cb);
    bus.emit({ type: 'x' });
    expect(cb).toHaveBeenCalledTimes(1);
    unsub();
    bus.emit({ type: 'x' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('tolerates unsubscribe during emit (snapshot semantics)', () => {
    const bus = new EventBus();
    const log: string[] = [];
    const unsubA = bus.on('x', () => {
      log.push('a');
      unsubA();
    });
    bus.on('x', () => log.push('b'));
    bus.emit({ type: 'x' });
    expect(log).toEqual(['a', 'b']);
  });
});
