// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR, type Value } from '@ffacet/ir-interpreter';
import { mountView } from '@ffacet/core/runtime';
import { layoutThrashImperativeIR } from '../src/irs.js';
import { layoutThrashFacet } from '../src/facet.js';
import { layoutThrashStageView } from '../src/layout-thrash-stage.js';

/** 사양의 실측표 — (상자 수, order) → [layouts, forced, measured]. */
const TABLE: Record<number, Record<number, [number, number, number]>> = {
  1: { 0: [1, 0, 1], 1: [1, 1, 1], 2: [1, 0, 1] },
  2: { 0: [2, 1, 4], 1: [2, 2, 4], 2: [1, 0, 2] },
  4: { 0: [4, 3, 16], 1: [4, 4, 16], 2: [1, 0, 4] },
  8: { 0: [8, 7, 64], 1: [8, 8, 64], 2: [1, 0, 8] },
  16: { 0: [16, 15, 256], 1: [16, 16, 256], 2: [1, 0, 16] },
};

const BOX_COUNTS = [1, 2, 4, 8, 16];
const ORDERS = [0, 1, 2];

const boxWidths = layoutThrashFacet.initialData.boxWidths as number[];

describe('layout-thrash — IR ↔ 사양 표', () => {
  it('열다섯 조합(상자 수 5 × 차례 3) 전부에서 runIR 이 실측표와 같다', () => {
    for (const n of BOX_COUNTS) {
      for (const order of ORDERS) {
        const widths: Value[] = boxWidths.slice(0, n);
        const counts: Value[] = [0, 0, 0];
        runIR(layoutThrashImperativeIR, 'run', [widths, n, order, counts]);
        expect(counts).toEqual(TABLE[n]![order]);
      }
    }
  });
});

describe('layout-thrash — 사다리', () => {
  it('boxCount 사다리 값이 segments[].value 와 같다', () => {
    const controls = layoutThrashFacet.blocks.controls as {
      controls: Array<{ action?: string; segments?: Array<{ value: number }> }>;
    };
    const boxCountCtl = controls.controls.find((c) => c.action === 'boxCount');
    const orderCtl = controls.controls.find((c) => c.action === 'order');
    expect(boxCountCtl?.segments?.map((s) => s.value)).toEqual(BOX_COUNTS);
    expect(orderCtl?.segments?.map((s) => s.value)).toEqual(ORDERS);
    expect(boxWidths.length).toBe(16);
    expect(boxWidths[15]).toBe(400);
  });
});

describe('layout-thrash — stage 마운트', () => {
  it('mountView 를 거쳐 마운트되고 캔버스가 붙는다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(layoutThrashStageView, container, {
      config: {},
      initialData: layoutThrashFacet.initialData,
      locale: 'en',
      theme: 'light',
    }) as unknown as { destroy(): void; resetRound(order: number, widths: number[]): void };
    expect(container.querySelectorAll('svg').length).toBe(1);
    instance.resetRound(0, boxWidths.slice(0, 4));
    expect(container.querySelectorAll('rect').length).toBeGreaterThan(4);
    instance.destroy();
  });
});
