// @vitest-environment happy-dom
/**
 * positional-encoding 고유 검사 — 사양 실측표 대조 · 회차별 계기 · 사다리 · 무대 캡션.
 * IR 을 두지 않으므로 IR ↔ algorithm 대조는 없다 (irs.ts 머리 주석).
 */

import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  computePositionalEncoding,
  narrowPositionalEncoding,
  positionalEncodingAlgorithm,
  positionalEncodingFacet,
  positionalEncodingIRs,
  positionalEncodingProjector,
  positionalEncodingStageView,
  type PositionalEncodingData,
} from '../src/index.js';

const data = narrowPositionalEncoding(positionalEncodingFacet.initialData);
const f2 = (v: number): string => v.toFixed(2);

// 사양 실측표 (sim.py positional-encoding)
const TABLE: Record<number, { nearest: number; dist: string; neighbour: string; confusable: number[]; axisMax: string; bars: string }> = {
  2: {
    nearest: 25, dist: '0.13', neighbour: '0.96', confusable: [6, 7, 12, 13, 18, 19, 25, 26, 31], axisMax: '2.00',
    bars: '0.96 1.68 1.99 1.82 1.20 0.28 0.70 1.51 1.96 1.92 1.41 0.56 0.43 1.31 1.88 1.98 1.60 0.82 0.15 1.09 1.76 2.00 1.75 1.07 0.13 0.84 1.61 1.98 1.87 1.30 0.41',
  },
  4: {
    nearest: 19, dist: '0.24', neighbour: '0.96', confusable: [6, 7, 12, 13, 18, 19, 25, 26, 31], axisMax: '2.01',
    bars: '0.96 1.68 2.00 1.82 1.20 0.29 0.71 1.52 1.96 1.92 1.42 0.57 0.45 1.32 1.88 1.99 1.61 0.84 0.24 1.11 1.77 2.01 1.77 1.10 0.28 0.88 1.63 2.00 1.89 1.33 0.52',
  },
  8: {
    nearest: 6, dist: '0.66', neighbour: '0.96', confusable: [6], axisMax: '2.81',
    bars: '0.96 1.69 2.02 1.86 1.30 0.66 0.98 1.70 2.14 2.15 1.76 1.27 1.29 1.85 2.32 2.45 2.20 1.78 1.64 2.01 2.48 2.69 2.54 2.16 1.92 2.12 2.54 2.81 2.74 2.40 2.07',
  },
  16: {
    nearest: 1, dist: '1.01', neighbour: '1.01', confusable: [], axisMax: '3.51',
    bars: '1.01 1.81 2.22 2.21 1.93 1.76 2.05 2.57 2.93 2.95 2.67 2.31 2.23 2.48 2.75 2.75 2.43 1.96 1.77 2.11 2.59 2.85 2.80 2.59 2.53 2.80 3.23 3.51 3.50 3.26 3.00',
  },
};

// 짚는 둘째 줄 (사양 "짚는 두 줄")
const ROW_GAP: Record<number, string> = {
  2: '-0.13 0.99',
  4: '0.15 0.99 0.19 0.98',
  8: '-0.28 0.96 0.56 0.83 0.06 1.00 0.01 1.00',
  16: '0.84 0.54 0.31 0.95 0.10 1.00 0.03 1.00 0.01 1.00 0.00 1.00 0.00 1.00 0.00 1.00',
};

describe('positional-encoding — 사양 대조', () => {
  it('데이터와 사다리 — 자리 32 · 사다리 끝 16 · segments 와 같다', () => {
    expect(data.positions).toBe(32);
    expect(data.base).toBe(10000);
    expect(data.dModelLadder).toEqual([2, 4, 8, 16]);
    expect(data.dModelLadder[data.dModelLadder.length - 1]).toBe(16);
    const controls = (positionalEncodingFacet.blocks.controls as { controls: unknown[] }).controls;
    const knob = controls.find(
      (c): c is { action: string; segments: { value: number; default?: boolean }[] } =>
        typeof c === 'object' && c !== null && (c as { action?: unknown }).action === 'dModel',
    );
    expect(knob).toBeDefined();
    expect(knob!.segments.map((s) => s.value)).toEqual(data.dModelLadder);
    expect(knob!.segments.find((s) => s.default)?.value).toBe(data.dModel);
    expect(positionalEncodingIRs).toEqual([]);
  });

  for (const d of [2, 4, 8, 16]) {
    it(`d ${d} — 실측표와 같다`, () => {
      const b = computePositionalEncoding(data, d);
      const row = TABLE[d]!;
      expect(b.omegas).toHaveLength(d / 2);
      expect(b.rows).toHaveLength(32);
      expect(b.distances).toHaveLength(31);
      expect(b.gap).toBe(row.nearest);
      expect(f2(b.distance)).toBe(row.dist);
      expect(f2(b.neighbour)).toBe(row.neighbour);
      expect(b.confusable).toEqual(row.confusable);
      expect(f2(b.axisMax)).toBe(row.axisMax);
      expect(b.distances.map(f2).join(' ')).toBe(row.bars);
      expect(b.rows[b.gap]!.map(f2).join(' ')).toBe(ROW_GAP[d]);
    });
  }

  it('거리는 간격에만 달린다 — 모든 짝이 D(b − a) 와 1e-12 안', () => {
    for (const d of [2, 4, 8, 16]) {
      const b = computePositionalEncoding(data, d);
      for (let a = 0; a < 32; a += 1) {
        for (let c = a + 1; c < 32; c += 1) {
          let s = 0;
          for (let k = 0; k < d; k += 1) s += (b.rows[a]![k]! - b.rows[c]![k]!) ** 2;
          expect(Math.abs(Math.sqrt(s) - b.distances[c - a - 1]!)).toBeLessThan(1e-12);
        }
      }
    }
  });

  it('첫 열 쌍(ω 1)은 네 d 모두 같다', () => {
    const base = computePositionalEncoding(data, 2).rows.map((r) => r.slice(0, 2));
    for (const d of [4, 8, 16]) {
      expect(computePositionalEncoding(data, d).rows.map((r) => r.slice(0, 2))).toEqual(base);
    }
  });

  it('동사 — Δ* 는 줄곧 줄고 그 거리는 줄곧 늘며 헷갈리는 간격 수는 늘지 않는다 (2 → 4 는 같다)', () => {
    const boards = [2, 4, 8, 16].map((d) => computePositionalEncoding(data, d));
    for (let i = 1; i < boards.length; i += 1) {
      expect(boards[i]!.gap).toBeLessThan(boards[i - 1]!.gap);
      expect(boards[i]!.distance).toBeGreaterThan(boards[i - 1]!.distance);
      expect(boards[i]!.confusable.length).toBeLessThanOrEqual(boards[i - 1]!.confusable.length);
    }
    expect(boards[0]!.confusable.length).toBe(boards[1]!.confusable.length);
  });

  it('좁히개 — 사다리 밖의 dModel 은 던진다', () => {
    expect(() => narrowPositionalEncoding({ ...positionalEncodingFacet.initialData, dModel: 6 })).toThrow();
    expect(() => narrowPositionalEncoding({ ...positionalEncodingFacet.initialData, dModelLadder: [2, 3] })).toThrow();
  });
});

describe('positional-encoding — 회차별 계기', () => {
  it('dModel 2 → 16 → 2 로 돌리면 판 끝마다 {25, 9} → {1, 0} → {25, 9}', async () => {
    const inputs = [16, 2];
    const metrics: Record<string, number> = {};
    const seen = new Set<string>();
    const events: FacetRuntimeEvent[] = [];
    const rounds: { nearest: number; confusable: number }[] = [];
    let cancelled = false;
    const ctx = {
      data: positionalEncodingFacet.initialData as unknown as PositionalEncodingData,
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        events.push(e);
        if (e.type === 'nearest') {
          rounds.push({ nearest: metrics['nearest-gap']!, confusable: metrics['confusable-gaps']! });
        }
      },
      metric(name: string, delta: number | 'inc') {
        seen.add(name);
        metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
      },
      async sleep() {
        return !cancelled;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        const v = inputs.shift();
        if (v === undefined) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return { type: 'dModel', payload: { value: v, segmentIndex: 0 } };
      },
    };
    await positionalEncodingAlgorithm(ctx as unknown as FacetContext<PositionalEncodingData>);
    expect(rounds).toEqual([
      { nearest: 25, confusable: 9 },
      { nearest: 1, confusable: 0 },
      { nearest: 25, confusable: 9 },
    ]);
    expect(seen).toEqual(new Set(['nearest-gap', 'confusable-gaps']));
    expect(events.filter((e) => e.type === 'board')).toHaveLength(3);
    expect(events.every((e) => e.silent !== true)).toBe(true);
  });
});

describe('positional-encoding — 무대', () => {
  it('걸음마다 캡션이 셈한 값을 보인다 (ko)', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('ko', positionalEncodingFacet.messages);
    const stage = mountView(positionalEncodingStageView, container, {
      config: { type: 'positional-encoding-stage' },
      initialData: positionalEncodingFacet.initialData,
      locale: 'ko',
      t,
    });
    const projector = positionalEncodingProjector({ stage }, { getSpeed: () => 1, t });
    const b = computePositionalEncoding(data, 8);
    const caption = (): string => container.querySelector('text')?.textContent ?? '';
    void projector.onEvent({ type: 'board', payload: { dModel: 8, positions: 32, pairs: 4 } });
    expect(caption()).toBe('표시의 차원 d 8 · 자리 32 · 주파수 4');
    void projector.onEvent({ type: 'encoding', payload: { dModel: 8, omegas: b.omegas, rows: b.rows } });
    expect(caption()).toBe('자리마다 주파수별 sin · cos — 가장 느린 ω 0.001');
    void projector.onEvent({ type: 'distances', payload: { distances: b.distances, axisMax: b.axisMax } });
    expect(caption()).toBe('간격 Δ 마다 거리 — 가장 먼 거리 2.81');
    void projector.onEvent({ type: 'neighbour', payload: { neighbour: b.neighbour, confusable: b.confusable } });
    expect(caption()).toBe('이웃 거리 0.96 · 이웃보다 가까운 먼 간격 1');
    void projector.onEvent({
      type: 'nearest',
      payload: { gap: b.gap, distance: b.distance, rowZero: b.rows[0], rowGap: b.rows[b.gap] },
    });
    expect(caption()).toBe('가장 닮은 간격 6 · 거리 0.66');
    expect(() => projector.onEvent({ type: 'phase', payload: { phase: 'x' } })).toThrow();
    stage.destroy();
  });

  it('첫 그림을 다시 먹여도 무대가 늘지 않는다 (되짚기 · 되돌리기 — 멱등)', () => {
    const container = document.createElement('div');
    const t = makeTranslator('ko', positionalEncodingFacet.messages);
    const stage = mountView(positionalEncodingStageView, container, {
      config: { type: 'positional-encoding-stage' },
      initialData: positionalEncodingFacet.initialData,
      locale: 'ko',
      t,
      // 되짚기는 즉시 모드로 먹인다 — 접혀 사라지는 열의 운동이 끝나기를 기다리지 않게
      isInstant: () => true,
    });
    const projector = positionalEncodingProjector({ stage }, { getSpeed: () => 1, t });
    const feed = (d: number): void => {
      const b = computePositionalEncoding(data, d);
      void projector.onEvent({ type: 'board', payload: { dModel: d, positions: 32, pairs: d / 2 } });
      void projector.onEvent({ type: 'encoding', payload: { dModel: d, omegas: b.omegas, rows: b.rows } });
      void projector.onEvent({ type: 'distances', payload: { distances: b.distances, axisMax: b.axisMax } });
      void projector.onEvent({ type: 'neighbour', payload: { neighbour: b.neighbour, confusable: b.confusable } });
      void projector.onEvent({ type: 'nearest', payload: { gap: b.gap, distance: b.distance, rowZero: b.rows[0], rowGap: b.rows[b.gap] } });
    };
    const count = (): number => container.querySelectorAll('*').length;
    void projector.onEvent({ type: 'board', payload: { dModel: 2, positions: 32, pairs: 1 } });
    const afterFirst = count();
    void projector.onEvent({ type: 'board', payload: { dModel: 2, positions: 32, pairs: 1 } });
    expect(count()).toBe(afterFirst);
    feed(2);
    const afterBoard = count();
    projector.onReset?.();
    feed(2);
    expect(count()).toBe(afterBoard);
    feed(16);
    feed(2);
    expect(count()).toBe(afterBoard);
    stage.destroy();
  });
});
