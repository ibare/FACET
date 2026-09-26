// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { getAlgorithmMechanismKind, makeTranslator, mountView } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent, ProjectorViews } from '@ffacet/core/runtime';
import {
  computeBoard,
  eccAlgorithm,
  eccFacet,
  eccImperativeIR,
  eccProjector,
  eccStageView,
  groupOpRaw,
  narrowEccData,
  registerEcc,
} from '../src/index.js';
import type { EccData } from '../src/index.js';

const data = narrowEccData(eccFacet.initialData);

/** 사양 표 (sim.py) — k: [곡선 kG, 곱셈 g^k, 가는 셈, 되찾는 셈, 곡선 K, 곱셈 K] */
const TABLE: Record<number, [[number, number], number, number, number, [number, number], number]> = {
  1: [[5, 1], 5, 0, 0, [3, 16], 19],
  2: [[6, 3], 2, 1, 1, [13, 10], 16],
  3: [[10, 6], 10, 2, 2, [0, 6], 5],
  4: [[3, 1], 4, 2, 3, [10, 6], 3],
  5: [[9, 16], 20, 3, 4, [5, 16], 11],
  6: [[16, 13], 8, 3, 5, [9, 1], 2],
  7: [[0, 6], 17, 4, 6, [7, 11], 15],
  8: [[13, 7], 16, 3, 7, [16, 13], 9],
  9: [[7, 6], 11, 4, 8, [6, 3], 10],
  10: [[7, 11], 9, 4, 9, [6, 14], 6],
  11: [[13, 10], 22, 5, 10, [16, 4], 22],
  12: [[0, 11], 18, 4, 11, [7, 6], 4],
  13: [[16, 4], 21, 5, 12, [9, 16], 7],
  14: [[9, 1], 13, 5, 13, [5, 1], 18],
  15: [[3, 16], 19, 6, 14, [10, 11], 20],
  16: [[10, 11], 3, 4, 15, [0, 11], 12],
  17: [[6, 14], 15, 5, 16, [13, 7], 21],
  18: [[5, 16], 6, 5, 17, [3, 1], 8],
};
const code17 = ([x, y]: [number, number]): number => x * 17 + y;

describe('ecc — 셈과 사양 표', () => {
  it('사다리가 segments 와 같고 사다리 끝이 두 군의 차수보다 작다', () => {
    const controls = (eccFacet.blocks.controls as { controls: Array<{ action: string; segments?: Array<{ value: number; default?: boolean }> }> }).controls;
    const seg = (a: string) => controls.find((c) => c.action === a)?.segments ?? [];
    expect(seg('group').map((s) => s.value)).toEqual(data.groupLadder);
    expect(seg('secret').map((s) => s.value)).toEqual(data.secretLadder);
    expect(seg('group').find((s) => s.default)?.value).toBe(data.group);
    expect(seg('secret').find((s) => s.default)?.value).toBe(data.secret);
    expect(data.secretLadder).toEqual([2, 3, 4, 7, 8, 11, 12, 13, 18]);
    expect(data.secretLadder[data.secretLadder.length - 1]).toBe(18);
    expect(computeBoard(data, 1, 1).order).toBe(19);
    expect(computeBoard(data, 0, 1).order).toBe(22);
  });

  it('두 군 × 사다리 아홉 칸이 사양 표와 같다', () => {
    for (const k of data.secretLadder) {
      const row = TABLE[k]!;
      const curve = computeBoard(data, 1, k);
      const mul = computeBoard(data, 0, k);
      expect(curve.aCode).toBe(code17(row[0]));
      expect(mul.aCode).toBe(row[1]);
      expect(curve.forward).toBe(row[2]);
      expect(mul.forward).toBe(row[2]);
      expect(curve.backward).toBe(row[3]);
      expect(mul.backward).toBe(row[3]);
      expect(curve.kCode).toBe(code17(row[4]));
      expect(mul.kCode).toBe(row[5]);
      // 두 배 수 · 더하기 수도 두 군이 같다
      const ops = (b: typeof curve) => b.ladder.map((s) => s.op).join(',');
      expect(ops(curve)).toBe(ops(mul));
    }
    expect(computeBoard(data, 1, 13).bCode).toBe(code17([3, 16]));
    expect(computeBoard(data, 0, 13).bCode).toBe(19);
  });

  it('기본 판의 두 배-더하기 길과 되찾기 길이 사양과 같다', () => {
    const bd = computeBoard(data, 1, 13);
    expect(bd.ladder.map((s) => [s.op, s.m, s.code])).toEqual([
      ['double', 2, code17([6, 3])],
      ['add', 3, code17([10, 6])],
      ['double', 6, code17([16, 13])],
      ['double', 12, code17([0, 11])],
      ['add', 13, code17([16, 4])],
    ]);
    expect(bd.recoverPath).toEqual(
      [[5, 1], [6, 3], [10, 6], [3, 1], [9, 16], [16, 13], [0, 6], [13, 7], [7, 6], [7, 11], [13, 10], [0, 11], [16, 4]].map((p) =>
        code17(p as [number, number]),
      ),
    );
    const mul = computeBoard(data, 0, 13);
    expect(mul.ladder.map((s) => s.code)).toEqual([2, 10, 8, 18, 21]);
    expect(mul.recoverPath).toEqual([5, 2, 10, 4, 20, 8, 17, 16, 11, 9, 22, 18, 21]);
    expect(bd.slots.filter((s) => !s.alias && !s.identity)).toHaveLength(18);
  });

  it('IR 과 algorithm 이 열여덟 판(두 군 × 아홉) 모두에서 같은 값을 낸다', () => {
    let maxMid = 0;
    for (const gi of data.groupLadder) {
      for (const k of data.secretLadder) {
        const bd = computeBoard(data, gi, k);
        const { kind, g, p, a } = bd.args;
        const cost = [0];
        expect(runIR(eccImperativeIR, 'scalarMul', [kind, k, g, p, a, cost])).toBe(bd.aCode);
        expect(cost[0]).toBe(bd.forward);
        expect(runIR(eccImperativeIR, 'recover', [kind, bd.aCode, g, p, a])).toBe(bd.backward);
        expect(runIR(eccImperativeIR, 'shared', [kind, k, data.peerSecret, g, p, a, [0]])).toBe(bd.kCode);
        if (kind === 1) maxMid = Math.max(maxMid, 3 * (p - 1) * (p - 1) + a);
        else maxMid = Math.max(maxMid, (p - 1) * (p - 1));
      }
    }
    expect(maxMid).toBe(770);
  });

  it('모르는 군 — TS 는 던지고 IR 은 −1', () => {
    expect(() => groupOpRaw({ kind: 2, g: 5, p: 23, a: 0 }, 5, 5)).toThrow();
    expect(() => computeBoard(data, 2, 5)).toThrow();
    expect(runIR(eccImperativeIR, 'scalarMul', [2, 5, 5, 23, 0, [0]])).toBe(-1);
    expect(runIR(eccImperativeIR, 'recover', [2, 5, 5, 23, 0])).toBe(-1);
    expect(runIR(eccImperativeIR, 'shared', [2, 5, 15, 5, 23, 0, [0]])).toBe(-1);
    expect(runIR(eccImperativeIR, 'groupOp', [2, 5, 5, 23, 0])).toBe(-1);
    // O 를 넣으면 IR 은 −1
    expect(runIR(eccImperativeIR, 'groupOp', [1, 289, 86, 17, 2])).toBe(-1);
  });
});

type Recorded = { events: FacetRuntimeEvent[]; boards: Array<{ steps: FacetRuntimeEvent[]; meters: Record<string, number> }> };

/** 입력 순서를 먹이며 알고리즘을 끝까지 돌린다. 판마다 걸음 이벤트와 판 끝의 계기 값을 모은다. */
async function drive(inputs: Array<{ type: string; value: number }>): Promise<Recorded> {
  const events: FacetRuntimeEvent[] = [];
  const meters = new Map<string, number>();
  const boards: Recorded['boards'] = [];
  let cancelled = false;
  const queue = [...inputs];
  const snapshot = () => {
    const lastInit = events.map((e) => e.type).lastIndexOf('init');
    boards.push({ steps: events.slice(lastInit), meters: Object.fromEntries(meters) });
  };
  const ctx = {
    data: structuredClone(eccFacet.initialData) as EccData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      meters.set(name, (meters.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      snapshot();
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value } };
    },
  };
  await eccAlgorithm(ctx as unknown as FacetContext<EccData>);
  return { events, boards };
}

describe('ecc — 걸음 · phase · 계기', () => {
  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 다 · 걸음 수가 사양과 같다', async () => {
    const inputs = [
      ...data.secretLadder.map((k) => ({ type: 'secret', value: k })),
      { type: 'group', value: 0 },
      ...data.secretLadder.map((k) => ({ type: 'secret', value: k })),
    ];
    const { events, boards } = await drive(inputs);
    const STEP = new Set(['double', 'add', 'recover', 'shared']);
    events.forEach((e, i) => {
      if (!STEP.has(e.type)) return;
      expect(e.silent).not.toBe(true);
      const prev = events[i - 1]!;
      expect(prev.type).toBe('phase');
      expect((prev.payload as { phase: string }).phase).toBe(e.type);
    });
    for (const e of events) if (e.type === 'init' || e.type === 'phase') expect(e.silent).toBe(true);
    // 판 하나의 걸음 수(걸음 0 포함) = 가는 셈 + 3
    for (const b of boards) {
      const init = b.steps[0]!.payload as { k: number };
      const nonSilent = b.steps.filter((e) => !e.silent).length;
      expect(nonSilent + 1).toBe(TABLE[init.k]![2] + 3);
    }
    // 기본 판은 네 phase 를 모두 켠다
    const first = boards[0]!.steps.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase);
    expect(new Set(first)).toEqual(new Set(['double', 'add', 'recover', 'shared']));
    expect(boards[0]!.steps.filter((e) => !e.silent).map((e) => e.type)).toEqual(['double', 'add', 'double', 'double', 'add', 'recover', 'shared']);
  });

  it('계기는 회차마다 지금 값이다 — secret 13 → 4 → 13 · group 1 → 0 → 1', async () => {
    const a = await drive([
      { type: 'secret', value: 4 },
      { type: 'secret', value: 13 },
    ]);
    expect(a.boards.map((b) => [b.meters['forward-ops'], b.meters['backward-ops']])).toEqual([
      [5, 12],
      [2, 3],
      [5, 12],
    ]);
    const b = await drive([
      { type: 'group', value: 0 },
      { type: 'group', value: 1 },
    ]);
    expect(b.boards.map((x) => [x.meters['forward-ops'], x.meters['backward-ops']])).toEqual([
      [5, 12],
      [5, 12],
      [5, 12],
    ]);
    // 사다리 첫 칸 k 2 — 두 막대가 같다
    const c = await drive([{ type: 'secret', value: 2 }]);
    expect(c.boards[1]!.meters).toEqual({ 'forward-ops': 1, 'backward-ops': 1 });
    // 되찾기가 0 번인 판이 사다리에 없다 — recover phase 가 늘 루프 몸통을 돈다
    for (const gi of data.groupLadder) for (const k of data.secretLadder) expect(computeBoard(data, gi, k).backward).toBeGreaterThan(0);
  });

  it('사다리 밖 입력은 흘린다', async () => {
    const r = await drive([
      { type: 'secret', value: 19 },
      { type: 'secret', value: 1 },
      { type: 'group', value: 2 },
      { type: 'other', value: 1 },
    ]);
    // 첫 판 뒤 입력 셋이 모두 흘려져 판이 더 생기지 않는다
    expect(r.events.filter((e) => e.type === 'init')).toHaveLength(1);
  });

  it('reactive 로 등록된다', () => {
    registerEcc();
    expect(getAlgorithmMechanismKind('ecc')).toBe('reactive');
  });
});

describe('ecc — 무대', () => {
  const mount = () => {
    const container = document.createElement('div');
    const stage = mountView(eccStageView, container, {
      config: { type: 'ecc-stage' },
      locale: 'ko',
      t: makeTranslator('ko', eccFacet.messages),
      isInstant: () => true,
    });
    const projector = eccProjector({ stage } as ProjectorViews);
    const svg = container.querySelector('svg');
    if (svg === null) throw new Error('svg 가 없다');
    return { projector, svg };
  };

  it('첫 그림은 멱등이다 — init 을 두 번 먹여도 요소 수가 같다 · 되짚기 뒤에도 같다', async () => {
    const { events } = await drive([{ type: 'group', value: 0 }]);
    const init = events.find((e) => e.type === 'init')!;
    const { projector, svg } = mount();
    await projector.onEvent(init);
    const once = svg.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(svg.querySelectorAll('*').length).toBe(once);
    // 한 판을 다 먹인 뒤 되짚기 — onReset 뒤 첫 그림
    const firstBoardEnd = events.findIndex((e, i) => i > 0 && e.type === 'init');
    for (const e of events.slice(0, firstBoardEnd)) await projector.onEvent(e);
    projector.onReset?.();
    await projector.onEvent(init);
    expect(svg.querySelectorAll('*').length).toBe(once);
    // 군을 바꾼 판도 같은 요소 수 모양으로 다시 짓는다 (점 자리는 22 개 그대로)
    await projector.onEvent(events[firstBoardEnd]!);
    expect(svg.querySelectorAll('circle').length).toBeGreaterThanOrEqual(22);
  });

  it('기본 판의 캡션이 셈한 값을 말한다', async () => {
    const { events } = await drive([]);
    const { projector, svg } = mount();
    const texts = () => [...svg.querySelectorAll('text')].map((t) => t.textContent ?? '');
    for (const e of events) {
      await projector.onEvent(e);
      if (e.type === 'recover') expect(texts().some((s) => s.includes('12 번') && s.includes('(16, 4)') && s.includes('13'))).toBe(true);
    }
    expect(texts().some((s) => s.includes('K: (9, 16)'))).toBe(true);
    expect(texts().some((s) => s.includes('13·B = 15·A = K: (9, 16)'))).toBe(true);
  });

  it('모르는 이벤트는 던진다', () => {
    const { projector } = mount();
    expect(() => projector.onEvent({ type: 'mystery' })).toThrow();
  });
});
