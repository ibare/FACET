import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createCatalog,
  createInstance,
  registerInto,
  parseFacetExpr,
  type LensFactory,
} from '@facet/core';
import { loopContainer } from '@facet/container-loop';
import { bubbleSortBundle } from '@facet/algorithm-bubblesort';
import { mainstreamTranspilers } from '@facet/transpilers-mainstream';

afterEach(() => {
  vi.useRealTimers();
});

describe('loop + bubbleSort integration (headless probe lens)', () => {
  it('drives body ticks via container and completes on reversed input', async () => {
    vi.useFakeTimers();
    const catalog = createCatalog();
    registerInto(catalog, {
      containers: [loopContainer],
      algorithms: [bubbleSortBundle.algorithm],
      bodies: [bubbleSortBundle.body],
      irs: bubbleSortBundle.irs,
      transpilers: mainstreamTranspilers,
    });

    const expr = parseFacetExpr('{facet:loop facet:bubbleSort}');
    expect(expr).not.toBeNull();

    const phases: string[] = [];
    let containerComplete = false;

    const probe: LensFactory = ({ eventBus }) => {
      const unsubs = [
        eventBus.on('body:phase', (e) => {
          phases.push((e as { phase: string }).phase);
        }),
        eventBus.on('container:complete', () => {
          containerComplete = true;
        }),
      ];
      return { destroy: () => unsubs.forEach((u) => u()) };
    };

    const fakeMount = {} as HTMLElement;
    const instance = createInstance({
      expr: expr!,
      catalog,
      lenses: ['probe'],
      mountPoint: fakeMount,
      lensRegistry: new Map([['probe', probe]]),
    });

    instance.start();

    for (let t = 0; t < 200 && !containerComplete; t++) {
      await vi.advanceTimersByTimeAsync(1200);
    }

    expect(containerComplete).toBe(true);
    expect(phases).toContain('comparing');
    expect(phases).toContain('swapping');
    expect(phases).toContain('pass_complete');

    instance.destroy();
  });

  it('transpilers produce phase-tagged source maps', () => {
    const lines = mainstreamTranspilers[0].transpile({
      id: 'bubbleSort-imperative',
      algorithm: 'bubbleSort',
      paradigm: 'imperative',
    }).lines;
    const phases = new Set(lines.map((l) => l.phase).filter(Boolean));
    expect(phases.has('comparing')).toBe(true);
    expect(phases.has('swapping')).toBe(true);
    expect(phases.has('outer_loop')).toBe(true);
    expect(phases.has('pass_complete')).toBe(true);
  });
});
