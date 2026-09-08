// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView, type ViewInstance } from '@ffacet/core/runtime';
import { mergeTwoSortedStageView } from '../src/merge-two-sorted-stage.js';
import { mergeTwoSortedProjector } from '../src/projector.js';
import { mergeTwoSortedAlgorithm, type MergeTwoSortedData } from '../src/algorithm.js';
import { mergeTwoSortedFacet } from '../src/facet.js';

type Rec = { type: string; payload?: unknown };

describe('merge-two-sorted 조각', () => {
  it('캔버스가 컨테이너에 남는다', () => {
    const container = document.createElement('div');
    const inst = mountView(mergeTwoSortedStageView, container, { config: {} });
    expect(container.querySelector('svg')).not.toBeNull();
    inst.destroy();
  });

  it('걸음 순서와 견줌 횟수가 대조와 맞는다', async () => {
    const events: Rec[] = [];
    const data = JSON.parse(JSON.stringify(mergeTwoSortedFacet.initialData)) as MergeTwoSortedData;
    const ctx = {
      data,
      cancelled: false,
      async emit(e: Rec) {
        events.push(e);
      },
      metric() {},
      async sleep() {
        return true;
      },
      pollInput() {
        return null;
      },
      async waitForInput(): Promise<never> {
        throw new Error('cancelled');
      },
    };
    await mergeTwoSortedAlgorithm(ctx as never).catch(() => undefined);

    const picks = events
      .filter((e) => e.type === 'take')
      .map((e) => (e.payload as { value: number; side: string }));
    expect(picks.map((p) => p.value)).toEqual([1, 2, 3, 4, 7, 9]);
    expect(picks.map((p) => p.side)).toEqual(['left', 'right', 'right', 'left', 'left', 'right']);
    expect(events.filter((e) => e.type === 'compare')).toHaveLength(5);
    const done = events.find((e) => e.type === 'done');
    expect((done?.payload as { comparisons: number }).comparisons).toBe(5);
  });

  it('projector 가 무대를 몰고 간다', async () => {
    const container = document.createElement('div');
    const stage: ViewInstance = mountView(mergeTwoSortedStageView, container, {
      config: {},
      initialData: mergeTwoSortedFacet.initialData,
    });
    const p = mergeTwoSortedProjector({ stage }, { getSpeed: () => 1, t: makeTranslator() });
    p.onInit?.(mergeTwoSortedFacet.initialData);
    const texts = () => Array.from(container.querySelectorAll('text')).map((n) => n.textContent);
    expect(texts()).toContain('Both rows are already in order.');
    await p.onEvent({
      type: 'compare',
      payload: { leftIndex: 0, rightIndex: 0, leftValue: 1, rightValue: 2, winner: 'left' },
    });
    expect(texts()).toContain('Only the fronts are compared: 1 vs 2');
    await p.onEvent({
      type: 'take',
      payload: { side: 'left', index: 0, value: 1, slot: 0, compared: true },
    });
    await p.onEvent({ type: 'done', payload: { comparisons: 5, picks: 6 } });
    expect(texts()).toContain('One pass, 5 comparisons, and nothing was re-sorted');
    stage.destroy();
    expect(container.querySelector('g')).toBeNull();
  });
});
