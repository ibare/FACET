import { describe, it, expect } from 'vitest';
import type { IR } from '@facet/core';
import { runIR } from '../src/index.js';
import { bubblesortImperativeIR } from '@facet/algorithm-bubblesort';
import { quicksortImperativeIR } from '@facet/algorithm-quicksort';
import { javascriptTranspiler } from '@facet/transpiler-javascript';

const SEEDS: number[][] = [
  [5, 2, 8, 1, 9, 3, 7, 4],
  [1],
  [],
  [3, 3, 3],
  [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  [1, 2, 3, 4, 5],
];

function sorted(arr: number[]): number[] {
  return [...arr].sort((a, b) => a - b);
}

function emitJS(ir: IR): string {
  const r = javascriptTranspiler.transpile(ir);
  return r.lines.map((l) => l.code).join('\n');
}

function jsRunner(ir: IR, entry: string): (...args: unknown[]) => unknown {
  const code = emitJS(ir);
  return new Function(`${code}\nreturn ${entry};`)() as (...a: unknown[]) => unknown;
}

describe('IR ↔ JS emit 라운드트립', () => {
  describe('bubblesort', () => {
    const fn = jsRunner(bubblesortImperativeIR, 'bubblesort');
    for (const seed of SEEDS) {
      it(`[${seed.join(',')}]`, () => {
        const expected = sorted(seed);

        const a1 = [...seed];
        runIR(bubblesortImperativeIR, 'bubblesort', [a1]);
        expect(a1).toEqual(expected);

        const a2 = [...seed];
        fn(a2);
        expect(a2).toEqual(expected);
      });
    }
  });

  describe('quicksort', () => {
    const fn = jsRunner(quicksortImperativeIR, 'quicksort');
    for (const seed of SEEDS) {
      it(`[${seed.join(',')}]`, () => {
        const expected = sorted(seed);

        const a1 = [...seed];
        runIR(quicksortImperativeIR, 'quicksort', [a1, 0, a1.length - 1]);
        expect(a1).toEqual(expected);

        const a2 = [...seed];
        fn(a2, 0, a2.length - 1);
        expect(a2).toEqual(expected);
      });
    }
  });
});
