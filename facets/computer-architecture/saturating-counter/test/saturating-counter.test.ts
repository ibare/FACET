// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { clearRegistry, getAlgorithmMechanismKind, mountView } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, IRStmt, ReactiveContext } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  computeSaturatingCounterRound,
  registerSaturatingCounter,
  saturatingCounterAlgorithm,
  saturatingCounterFacet,
  saturatingCounterImperativeIR,
  saturatingCounterStageView,
} from '../src/index.js';
import type { SaturatingCounterData, SaturatingCounterStage } from '../src/index.js';

const data = saturatingCounterFacet.initialData as SaturatingCounterData;

/** 사양 표 — 대조용. */
const SPEC: Record<number, { loop: number; turn: number; total: number; percent: number; trace: number[] }> = {
  1: { loop: 5, turn: 0, total: 5, percent: 69, trace: [1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 0, 0, 0, 0] },
  2: { loop: 3, turn: 1, total: 4, percent: 75, trace: [3, 3, 3, 3, 2, 3, 3, 3, 2, 3, 3, 3, 2, 1, 0, 0, 0] },
  3: { loop: 3, turn: 3, total: 6, percent: 63, trace: [7, 7, 7, 7, 6, 7, 7, 7, 6, 7, 7, 7, 6, 5, 4, 3, 2] },
};

type Round = {
  bits: number;
  metrics: Record<string, number>;
  trace: number[];
  done: Record<string, unknown> | null;
};

/**
 * 알고리즘을 가짜 reactive ctx 로 돌린다. 손잡이 입력을 차례로 먹이고, 판이 끝날
 * 때마다(= 입력을 기다리는 자리) 그 순간의 계기 값을 뜬다. 입력이 떨어지면 취소한다.
 */
async function drive(inputs: number[]): Promise<{ rounds: Round[]; events: FacetRuntimeEvent[] }> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const rounds: Round[] = [];
  let cancelled = false;
  let current: Round = { bits: data.bits, metrics: {}, trace: [], done: null };
  const queue = inputs.slice();

  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      const p = (e.payload ?? {}) as Record<string, unknown>;
      if (e.type === 'counter-set') {
        current = { bits: p.bits as number, metrics: {}, trace: [p.state as number], done: null };
      }
      if (e.type === 'move') current.trace.push(p.to as number);
      if (e.type === 'done') current.done = p;
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      rounds.push({ ...current, metrics: { ...metrics } });
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'bits', payload: { value: next, segmentIndex: next - 1 } };
    },
  } as unknown as ReactiveContext<SaturatingCounterData>;

  await saturatingCounterAlgorithm(ctx);
  return { rounds, events };
}

function irPhases(stmts: IRStmt[], out: Set<string>): Set<string> {
  for (const s of stmts) {
    if (s.kind === 'comment') continue;
    if (s.phase) out.add(s.phase);
    if (s.kind === 'if') {
      irPhases(s.then, out);
      if (s.else) irPhases(s.else, out);
    }
    if (s.kind === 'for-range' || s.kind === 'while') irPhases(s.body, out);
  }
  return out;
}

describe('saturatingCounter — 데이터와 선언', () => {
  it('사다리가 손잡이 구간 값과 같고, 기본 구간이 처음 판의 비트다', () => {
    const controls = (saturatingCounterFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const knob = controls.find((c) => c.widget === 'segmented-slider')!;
    const segments = knob.segments as Array<{ value: number; default?: boolean }>;
    expect(segments.map((s) => s.value)).toEqual(data.bitsLadder);
    expect(segments.find((s) => s.default)?.value).toBe(data.bits);
    expect(knob.action).toBe('bits');
  });

  it('32 비트 잠금 — 결과 열 16 칸, 사다리 끝 3 비트 (중간값 최대 top 7 · 틀림 16)', () => {
    expect(data.outcomes).toHaveLength(16);
    expect(Math.max(...data.bitsLadder)).toBe(3);
    expect(data.turnAt).toBe(12);
  });

  it('등록하면 reactive 로 잡힌다', () => {
    clearRegistry();
    registerSaturatingCounter();
    expect(getAlgorithmMechanismKind('saturatingCounter')).toBe('reactive');
  });
});

describe('saturatingCounter — 셈이 사양 표와 같다', () => {
  for (const bits of [1, 2, 3]) {
    it(`${bits} 비트`, () => {
      const r = computeSaturatingCounterRound(data.outcomes, bits, data.turnAt);
      const want = SPEC[bits]!;
      expect(r.loopMisses).toBe(want.loop);
      expect(r.turnMisses).toBe(want.turn);
      expect(r.missCount).toBe(want.total);
      expect(r.percent).toBe(want.percent);
      expect(r.trace).toEqual(want.trace);
    });
  }
});

describe('saturatingCounter — IR 이 화면과 같은 답을 낸다', () => {
  it('모든 비트에서 두 구간 틀림과 합이 알고리즘 계기와 같다', async () => {
    const { rounds } = await drive([2, 3]);
    expect(rounds.map((r) => r.bits)).toEqual([1, 2, 3]);
    const n = data.outcomes.length;
    for (const round of rounds) {
      const ir = (lo: number, hi: number) =>
        runIR(saturatingCounterImperativeIR, 'countMisses', [data.outcomes.slice(), round.bits, lo, hi]);
      expect(ir(0, data.turnAt)).toBe(round.metrics['loop-miss-count']);
      expect(ir(data.turnAt, n)).toBe(round.metrics['turn-miss-count']);
      expect(ir(0, n)).toBe(round.metrics['miss-count']);
    }
  });

  it('phase 집합이 algorithm 과 IR 에서 같다 (C3)', async () => {
    const { events } = await drive([]);
    const fromAlgorithm = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    const fromIR = new Set<string>();
    for (const f of saturatingCounterImperativeIR.functions) irPhases(f.body, fromIR);
    expect([...fromAlgorithm].sort()).toEqual([...fromIR].sort());
    expect(events.filter((e) => e.type === 'phase').every((e) => e.silent === true)).toBe(true);
  });
});

describe('saturatingCounter — 회차별 계기 (손잡이 A → B → A)', () => {
  it('1 → 3 → 1 → 2 로 돌려도 판마다 사양 표 값이 뜬다 (쌓이지 않는다)', async () => {
    const { rounds } = await drive([3, 1, 2]);
    expect(rounds.map((r) => r.bits)).toEqual([1, 3, 1, 2]);
    for (const round of rounds) {
      const want = SPEC[round.bits]!;
      expect(round.metrics).toEqual({
        'loop-miss-count': want.loop,
        'turn-miss-count': want.turn,
        'miss-count': want.total,
      });
      expect(round.trace).toEqual(want.trace);
      expect(round.done?.percent).toBe(want.percent);
    }
  });

  it('사다리 밖의 값과 남의 입력은 흘려보낸다', async () => {
    const { rounds } = await drive([7, 2]);
    // 7 은 무시되고 판이 다시 돌지 않는다 — 입력 대기 자리가 한 번 더 찍힐 뿐이다.
    expect(rounds.map((r) => r.bits)).toEqual([1, 1, 2]);
  });
});

describe('saturatingCounter — stage', () => {
  function mountStage(): { stage: SaturatingCounterStage; svg: SVGSVGElement } {
    const container = document.createElement('div');
    const stage = mountView(saturatingCounterStageView, container, {
      config: { type: 'saturating-counter-stage' },
      initialData: data as unknown as Record<string, unknown>,
      isInstant: () => true,
    }) as unknown as SaturatingCounterStage;
    const svg = container.querySelector('svg')!;
    return { stage, svg };
  }

  const visibleCells = (svg: SVGSVGElement) =>
    [...svg.querySelectorAll('rect')].filter(
      (r) => r.getAttribute('rx') === '3' && r.getAttribute('fill') !== 'none' && Number(r.getAttribute('height')) > 0,
    ).length;

  it('비트를 늘리면 칸이 2 → 4 → 8 로 자라고 꼭대기 바늘이 문턱에서 멀어진다', () => {
    const { stage, svg } = mountStage();
    const needleY = () => {
      const g = [...svg.querySelectorAll('g')].find((x) => x.getAttribute('transform')?.startsWith('translate'))!;
      return Number(/translate\(0 ([-\d.]+)\)/.exec(g.getAttribute('transform') ?? '')![1]);
    };
    const distances: number[] = [];
    for (const bits of [1, 2, 3]) {
      const top = 2 ** bits - 1;
      stage.setCounter(top, (top + 1) / 2, top, 16, 12);
      expect(visibleCells(svg)).toBe(top + 1);
      distances.push(210 - needleY());
    }
    expect(distances[0]!).toBeLessThan(distances[1]!);
    expect(distances[1]!).toBeLessThan(distances[2]!);
  });

  it('바늘이 문턱 아래로 내려가면 자취가 문턱 선을 넘는다', () => {
    const { stage, svg } = mountStage();
    stage.setCounter(1, 1, 1, 16, 12);
    stage.moveNeedle(0, 1, 0, 1);
    const trace = [...svg.querySelectorAll('polyline')][1]!;
    const ys = (trace.getAttribute('points') ?? '')
      .split(' ')
      .map((pt) => Number(pt.split(',')[1]));
    expect(ys[0]!).toBeLessThan(210);
    expect(ys[ys.length - 1]!).toBeGreaterThan(210);
    stage.destroy();
    expect(svg.parentNode).not.toBeNull();
  });
});
