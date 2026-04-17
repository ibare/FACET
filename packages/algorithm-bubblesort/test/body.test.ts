import { describe, it, expect, vi, afterEach } from 'vitest';
import { bubbleSortBars, type BubbleSortState } from '../src/body.js';

afterEach(() => {
  vi.useRealTimers();
});

function drive(inst: ReturnType<typeof bubbleSortBars.init>) {
  const phases: string[] = [];
  let completed = false;
  inst.onPhase((p) => phases.push(p));
  inst.onComplete(() => {
    completed = true;
  });
  return {
    phases,
    isComplete: () => completed,
    state: () => inst.getState() as unknown as BubbleSortState,
  };
}

describe('bubbleSortBars body', () => {
  it('generates reversed array by default control setup', () => {
    const inst = bubbleSortBars.init();
    inst.setControl('size', 5);
    inst.setControl('distribution', 'reversed');
    const state = inst.getState() as unknown as BubbleSortState;
    expect(state.arr).toEqual([5, 4, 3, 2, 1]);
  });

  it('emits comparing on tick and swapping after micro delay when swap needed', async () => {
    vi.useFakeTimers();
    const inst = bubbleSortBars.init();
    inst.setControl('size', 4);
    inst.setControl('distribution', 'reversed');
    const { phases } = drive(inst);

    inst.tick();
    expect(phases).toContain('comparing');

    await vi.runAllTimersAsync();
    expect(phases).toContain('swapping');
  });

  it('sorts a reversed array to completion across multiple ticks', async () => {
    vi.useFakeTimers();
    const inst = bubbleSortBars.init();
    inst.setControl('size', 4);
    inst.setControl('distribution', 'reversed');
    const d = drive(inst);

    for (let i = 0; i < 50 && !d.isComplete(); i++) {
      inst.tick();
      await vi.runAllTimersAsync();
    }

    const state = d.state();
    expect(d.isComplete()).toBe(true);
    expect(state.arr).toEqual([1, 2, 3, 4]);
    expect(state.bodyState).toBe('complete');
    expect(d.phases).toContain('pass_complete');
    expect(d.phases).toContain('swapping');
  });

  it('reset restores ready state and regenerates array', async () => {
    vi.useFakeTimers();
    const inst = bubbleSortBars.init();
    inst.setControl('size', 5);
    inst.setControl('distribution', 'reversed');
    inst.tick();
    await vi.runAllTimersAsync();
    inst.reset();
    const state = inst.getState() as unknown as BubbleSortState;
    expect(state.bodyState).toBe('ready');
    expect(state.comparisons).toBe(0);
    expect(state.swaps).toBe(0);
    expect(state.arr).toEqual([5, 4, 3, 2, 1]);
  });
});
