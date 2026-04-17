import { describe, it, expect, vi, afterEach } from 'vitest';
import { loopContainer } from '../src/index.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('loopContainer', () => {
  it('emits one tick immediately on start and then periodically', () => {
    vi.useFakeTimers();
    const inst = loopContainer.init();
    const cb = vi.fn();
    inst.onTick(cb);

    inst.start();
    expect(cb).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1200);
    expect(cb).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(1200);
    expect(cb).toHaveBeenCalledTimes(3);

    inst.stop();
    vi.advanceTimersByTime(5000);
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('signalComplete stops future ticks and notifies', () => {
    vi.useFakeTimers();
    const inst = loopContainer.init();
    const tickCb = vi.fn();
    const completeCb = vi.fn();
    inst.onTick(tickCb);
    inst.onComplete(completeCb);

    inst.start();
    expect(tickCb).toHaveBeenCalledTimes(1);

    inst.signalComplete();
    expect(completeCb).toHaveBeenCalledTimes(1);
    expect(inst.getState().complete).toBe(true);

    vi.advanceTimersByTime(5000);
    expect(tickCb).toHaveBeenCalledTimes(1);
  });

  it('setSpeed updates interval while running', () => {
    vi.useFakeTimers();
    const inst = loopContainer.init();
    const cb = vi.fn();
    inst.onTick(cb);

    inst.start();
    expect(cb).toHaveBeenCalledTimes(1);

    inst.setSpeed(2);
    vi.advanceTimersByTime(600);
    expect(cb).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(600);
    expect(cb).toHaveBeenCalledTimes(3);
  });

  it('reset returns to pristine state', () => {
    vi.useFakeTimers();
    const inst = loopContainer.init();
    inst.start();
    inst.signalComplete();
    inst.reset();
    expect(inst.getState()).toEqual({ tickCount: 0, running: false, complete: false });
  });
});
