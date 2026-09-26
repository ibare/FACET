/**
 * history-bisect 고유 검수 — 사양 표 대조 · IR ↔ algorithm 전 조합 · 회차별 계기 · 사다리.
 */
import { describe, expect, it } from 'vitest';
import type { FacetContext, FacetRuntimeEvent, ReactiveInputEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  historyBisectAlgorithm,
  historyBisectFacet,
  historyBisectImperativeIR,
  planBisect,
  skipFlags,
  type HistoryBisectData,
} from '../src/index.js';

const data = historyBisectFacet.initialData as HistoryBisectData;

/** 사양 실측표 — 자리 · k · tests · answer(from..to) · 비켜 선 수 · 멈춤 · 걸음 수 */
const TABLE: [number, number, number, number, number, number, boolean, number][] = [
  [0, 0, 4, 11, 11, 0, false, 10],
  [0, 1, 4, 10, 11, 2, true, 11],
  [0, 2, 3, 9, 11, 1, true, 9],
  [0, 3, 2, 8, 11, 1, true, 7],
  [1, 0, 4, 11, 11, 0, false, 10],
  [1, 1, 4, 11, 11, 0, false, 10],
  [1, 2, 4, 11, 11, 0, false, 10],
  [1, 3, 4, 11, 11, 0, false, 10],
  [2, 0, 4, 11, 11, 0, false, 10],
  [2, 1, 4, 11, 11, 1, false, 10],
  [2, 2, 4, 11, 11, 1, false, 10],
  [2, 3, 4, 11, 11, 1, false, 10],
];

function irRun(culprit: number, skip: number[]): { tests: number; ends: number[] } {
  const ends = [0, 0];
  const tests = runIR(historyBisectImperativeIR, 'bisect', [1, 16, culprit, skip, ends]);
  if (typeof tests !== 'number') throw new Error('runIR 이 수를 돌려주지 않았다');
  return { tests, ends };
}

describe('history-bisect', () => {
  it('열두 칸 — runIR = algorithm = 사양 표', () => {
    for (const [place, k, tests, from, to, aside, stuck, steps] of TABLE) {
      const plan = planBisect(data, k, place);
      expect([plan.tests, plan.answerFrom, plan.answerTo, plan.skippedAside, plan.stuck]).toEqual([tests, from, to, aside, stuck]);
      // 걸음 수 = 걸음 0 + 계획의 걸음
      expect(1 + plan.steps.length).toBe(steps);
      const ir = irRun(plan.culprit, skipFlags(data, k, place));
      expect(ir.tests).toBe(plan.tests);
      expect(ir.ends).toEqual([plan.answerFrom - 1, plan.answerTo]);
      // minutes = 시험 × 4, answer-candidates = b − g
      expect(plan.tests * data.testMinutes).toBe(tests * 4);
    }
  });

  it('같은 길로 센다 — 범인 c2..c16 × 깨진 빌드 무리 여러 벌에서 IR = algorithm, 답은 범인을 품는다', () => {
    let count = 0;
    for (let culprit = 2; culprit <= 16; culprit++) {
      // 두 끝 사이 c2..c15 에서 이어진 무리 [lo, hi] 전부와 빈 무리
      const clusters: number[][] = [[]];
      for (let lo = 2; lo <= 15; lo++) for (let hi = lo; hi <= Math.min(15, lo + 4); hi++) clusters.push(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
      for (const broken of clusters) {
        const ladder: HistoryBisectData = {
          ...data,
          firstBad: `c${culprit}`,
          brokenLadder: [broken.length],
          placements: [{ id: 'probe', from: `c${broken[0] ?? 2}`, dir: 1 }],
        };
        const p2 = planBisect(ladder, broken.length, 0);
        const skip = skipFlags(ladder, broken.length, 0);
        const ir = irRun(culprit, skip);
        expect(ir.tests).toBe(p2.tests);
        expect(ir.ends).toEqual([p2.answerFrom - 1, p2.answerTo]);
        expect(p2.answerFrom <= culprit && culprit <= p2.answerTo).toBe(true);
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(600);
  });

  it('동률(거리 같은 아래 · 위가 둘 다 시험 가능)이 걸리는 칸을 센다', () => {
    const ties: string[] = [];
    for (const [place, k] of TABLE) {
      const broken = new Set(skipFlags(data, k, place).flatMap((f, i) => (f === 1 ? [i] : [])));
      for (const s of planBisect(data, k, place).steps) {
        if (s.kind === 'pick' && s.skipped && s.pick === s.mid - 1 && !broken.has(s.mid + 1)) ties.push(`${place}:${k}:c${s.mid}`);
      }
    }
    expect(ties).toEqual(['0:1:c10', '2:1:c12']);
  });

  it('회차별 계기 — broken 2 → 0 → 2 (범인 바로 앞)', async () => {
    const inputs: ReactiveInputEvent[] = [
      { type: 'broken', payload: { value: 0 } },
      { type: 'broken', payload: { value: 2 } },
    ];
    const totals = new Map<string, number>();
    const rounds: [number, number, number][] = [];
    let cancelled = false;
    const ctx = {
      data: { ...data },
      get cancelled() {
        return cancelled;
      },
      async emit(e: FacetRuntimeEvent) {
        if (e.type === 'answer') rounds.push([totals.get('tests') ?? -1, totals.get('minutes') ?? -1, totals.get('answer-candidates') ?? -1]);
      },
      metric(name: string, delta: number | 'inc') {
        if (typeof delta !== 'number') throw new Error('계기는 수로만 보낸다');
        totals.set(name, (totals.get(name) ?? 0) + delta);
      },
      async sleep() {
        return !cancelled;
      },
      async waitForInput() {
        const next = inputs.shift();
        if (next === undefined) {
          cancelled = true;
          return { type: 'none' };
        }
        return next;
      },
      pollInput() {
        return null;
      },
    };
    await historyBisectAlgorithm(ctx as unknown as FacetContext<HistoryBisectData>);
    expect(rounds).toEqual([
      [3, 12, 3],
      [4, 16, 1],
      [3, 12, 3],
    ]);
  });

  it('사다리 = segments · commits 16 · skip 17', () => {
    const controls = (historyBisectFacet.blocks.controls as { controls: { name?: unknown; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const broken = controls.find((c) => c.name === 'broken');
    const place = controls.find((c) => c.name === 'place');
    expect(broken?.segments?.map((s) => s.value)).toEqual(data.brokenLadder);
    expect(place?.segments?.map((s) => s.value)).toEqual(data.placements.map((_, i) => i));
    expect(broken?.segments?.find((s) => s.default)?.value).toBe(data.broken);
    expect(place?.segments?.find((s) => s.default)?.value).toBe(data.place);
    expect(data.brokenLadder.at(-1)).toBe(3);
    expect(data.commits).toHaveLength(16);
    expect(skipFlags(data, 3, 0)).toHaveLength(17);
    expect(data.placements.map((p) => p.id)).toEqual(['before-culprit', 'far-back', 'after-culprit']);
  });
});
