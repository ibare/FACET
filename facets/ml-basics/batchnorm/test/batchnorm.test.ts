// @vitest-environment happy-dom
/**
 * batchnorm facet 고유의 검수 — IR ↔ algorithm 전 조합, 사양 대조표, 저장 차례 섞기, 표지, 회차별 계기,
 * 걸음 앞 phase, 첫 그림 멱등.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  batchnormAlgorithm,
  batchnormFacet,
  batchnormImperativeIR,
  batchnormProjector,
  batchnormStageView,
  bnParts,
  fmt2,
  meanDiffOf,
  wholeParts,
  type BatchnormData,
} from '../src/index.js';

const data = batchnormFacet.initialData as BatchnormData;

const irValue = (xs: number[], order: number[], b: number, track: number): number => {
  const v = runIR(batchnormImperativeIR, 'bnValue', [xs, order, b, track]);
  if (typeof v !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return v;
};

/** 사양 대조표 (sim: batchnorm) */
const SPEC: Record<number, { spots: string[]; meanDiff: string }> = {
  2: { spots: ['-1.00', '1.00', '-1.00', '-1.00', '1.00', '1.00', '1.00', '1.00'], meanDiff: '0.99' },
  4: { spots: ['-0.22', '0.62', '-1.30', '-1.36', '0.23', '0.84', '1.42', '0.14'], meanDiff: '0.75' },
  8: { spots: ['-0.45', '1.01', '-0.34', '-0.11', '0.43', '-0.27', '0.45', '-0.12'], meanDiff: '0.41' },
  16: { spots: ['0.05', '0.05', '0.05', '0.05', '0.05', '0.05', '0.05', '0.05'], meanDiff: '0.00' },
};

describe('batchnorm — 데이터와 사다리', () => {
  it('사다리가 segments 와 같고, 값 열여섯 · 섞음 여덟이 각각 0‥15 의 섞음이다', () => {
    expect(data.batchLadder).toEqual([2, 4, 8, 16]);
    const controls = (batchnormFacet.blocks.controls as { controls: { widget?: string; segments?: { value: number }[] }[] })
      .controls;
    const slider = controls.find((c) => c.widget === 'segmented-slider');
    expect(slider?.segments?.map((s) => s.value)).toEqual(data.batchLadder);
    expect(data.xs.length).toBe(16);
    expect(data.batchLadder[data.batchLadder.length - 1]).toBe(data.xs.length);
    expect(data.shuffles.length).toBe(8);
    for (const order of data.shuffles) expect([...order].sort((a, b) => a - b)).toEqual([...Array(16).keys()]);
    expect(data.xs[data.track]).toBe(4.6);
  });
});

describe('batchnorm — 셈', () => {
  it('전체로 맞춘 자리 0.05 · 전체 평균 4.50', () => {
    const w = wholeParts(data.xs, data.track, data.eps);
    expect(fmt2(w.normed)).toBe('0.05');
    expect(w.mu.toFixed(2)).toBe('4.50');
    expect(irValue(data.xs, [...Array(16).keys()], 16, data.track)).toBe(w.normed);
  });

  it('네 B × 섞음 여덟 = 서른둘 모두 IR 과 algorithm 이 같고, 사양 표와 같다', () => {
    const whole = wholeParts(data.xs, data.track, data.eps).normed;
    let maxAbs = 0;
    for (const b of data.batchLadder) {
      const spots = data.shuffles.map((order) => {
        const a = bnParts(data.xs, order, b, data.track, data.eps).normed;
        expect(irValue(data.xs, order, b, data.track)).toBe(a);
        maxAbs = Math.max(maxAbs, Math.abs(a));
        return a;
      });
      expect(spots.map(fmt2)).toEqual(SPEC[b]?.spots);
      expect(fmt2(meanDiffOf(spots, whole))).toBe(SPEC[b]?.meanDiff);
    }
    expect(maxAbs).toBeLessThan(4);
  });

  it('B 4 · B 2 의 묶음 동료가 사양과 같다', () => {
    const peers4 = data.shuffles.map((o) => bnParts(data.xs, o, 4, data.track, data.eps).peers);
    expect(peers4).toEqual([
      [7, 15, 5, 6],
      [4, 10, 5, 9],
      [10, 15, 5, 1],
      [3, 5, 8, 15],
      [0, 5, 2, 12],
      [5, 4, 9, 13],
      [5, 9, 13, 14],
      [10, 15, 5, 0],
    ]);
    const peers2 = data.shuffles.map((o) => bnParts(data.xs, o, 2, data.track, data.eps).peers);
    expect(peers2).toEqual([[5, 6], [5, 9], [5, 1], [3, 5], [0, 5], [5, 4], [5, 9], [5, 0]]);
  });

  it('값의 저장 차례를 섞고 order · track 을 따라 바꿔도 IR 과 algorithm 이 같다', () => {
    const perms = [
      [15, 3, 9, 0, 12, 6, 1, 14, 8, 5, 11, 2, 13, 7, 4, 10],
      [4, 11, 0, 7, 2, 13, 9, 15, 6, 1, 10, 3, 14, 8, 12, 5],
      [8, 0, 13, 5, 10, 2, 15, 7, 3, 12, 1, 9, 6, 14, 11, 4],
    ];
    for (const perm of perms) {
      // 새 자리 j 에 옛 번호 perm[j] 의 값을 둔다
      const xs2 = perm.map((old) => data.xs[old] as number);
      const newOf = new Map(perm.map((old, j) => [old, j] as const));
      const track2 = newOf.get(data.track) as number;
      for (const b of data.batchLadder) {
        for (const order of data.shuffles) {
          const order2 = order.map((old) => newOf.get(old) as number);
          const a = bnParts(xs2, order2, b, track2, data.eps).normed;
          expect(irValue(xs2, order2, b, track2)).toBe(a);
          expect(a).toBe(bnParts(data.xs, order, b, data.track, data.eps).normed);
        }
      }
    }
  });

  it('track 이 없는 order 에서 TS 는 던지고 IR 은 −1000', () => {
    const order = [...Array(16).keys()].filter((k) => k !== data.track);
    expect(() => bnParts(data.xs, order, 4, data.track, data.eps)).toThrow();
    expect(irValue(data.xs, order, 4, data.track)).toBe(-1000);
  });
});

type Rec = { events: FacetRuntimeEvent[]; metrics: Record<string, number>; boards: Record<string, number>[] };

async function drive(inputs: number[]): Promise<Rec> {
  const rec: Rec = { events: [], metrics: {}, boards: [] };
  const queue = inputs.map((value) => ({ type: 'batch', payload: { value } }));
  let cancelled = false;
  const ctx = {
    data: data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      rec.events.push(e);
      if (e.type === 'scale' && (e.payload as { last: boolean }).last) rec.boards.push({ ...rec.metrics });
    },
    metric(name: string, delta: number | 'inc') {
      rec.metrics[name] = (rec.metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await batchnormAlgorithm(ctx as unknown as FacetContext<BatchnormData>);
  return rec;
}

describe('batchnorm — 재생', () => {
  it('회차별 계기 4 → 2 → 4: batches-formed 32 · 64 · 32, drops 8 · 8 · 8', async () => {
    const r = await drive([2, 4]);
    expect(r.boards).toEqual([
      { drops: 8, 'batches-formed': 32 },
      { drops: 8, 'batches-formed': 64 },
      { drops: 8, 'batches-formed': 32 },
    ]);
  });

  it('걸음 17 개, 걸음마다 바로 앞이 그 걸음의 phase (걸음 0 은 phase 없음)', async () => {
    const r = await drive([16]);
    const steps = r.events.filter((e) => !e.silent);
    expect(steps.length).toBe(34);
    r.events.forEach((e, i) => {
      const prev = r.events[i - 1];
      const prevPhase = prev?.type === 'phase' ? (prev.payload as { phase: string }).phase : null;
      if (e.type === 'gather') expect(prevPhase).toBe('bn-gather');
      if (e.type === 'scale') expect(prevPhase).toBe('bn-scale');
      if (e.type === 'board') expect(prevPhase).toBeNull();
    });
    const lastScale = r.events.filter((e) => e.type === 'scale').pop();
    expect(fmt2((lastScale?.payload as { meanDiff: number }).meanDiff)).toBe('0.00');
  });

  it('사다리에 없는 값은 던진다', async () => {
    await expect(drive([3])).rejects.toThrow();
  });
});

describe('batchnorm — 무대', () => {
  it('첫 그림을 두 번 먹여도 요소 수가 같고, onReset 이 떨어진 점을 걷는다', async () => {
    const container = document.createElement('div');
    const stage = mountView(batchnormStageView, container, { config: {}, locale: 'ko' });
    const proj = batchnormProjector({ stage }, { getSpeed: () => 1, t: (_k, f) => f });
    const r = await drive([]);
    const init = r.events.find((e) => e.type === 'init') as FacetRuntimeEvent;
    proj.onEvent(init);
    const n1 = container.querySelectorAll('*').length;
    proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(n1);
    for (const e of r.events) if (e !== init) proj.onEvent(e);
    expect(container.querySelectorAll('*').length).toBeGreaterThan(n1);
    proj.onReset?.();
    expect(container.querySelectorAll('*').length).toBe(n1);
    stage.destroy();
  });
});
