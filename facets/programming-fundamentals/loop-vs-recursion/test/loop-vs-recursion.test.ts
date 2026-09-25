// @vitest-environment happy-dom
/**
 * loop-vs-recursion 고유 검사 — IR ↔ algorithm 전 조합 · 사양 표 · 회차별 계기 · 사다리 · 걸음 수.
 * 공통분(손잡이가 닿는가 · 덮이는 phase · 계기 누적 · transpile)은 whole-check 가 잰다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  loopVsRecursionAlgorithm,
  loopVsRecursionFacet,
  loopVsRecursionImperativeIR,
  loopVsRecursionStageView,
  type LoopVsRecursionData,
} from '../src/index.js';

type Round = { events: FacetRuntimeEvent[]; metrics: Record<string, number>; lit: string[] };

/** 사양 표 (python3 sim.py loop-vs-recursion) — 대조용. */
const SPEC: Record<number, { answer: number; checks: number; recFrames: number; loopSteps: number; recSteps: number }> = {
  1: { answer: 1, checks: 2, recFrames: 2, loopSteps: 5, recSteps: 5 },
  2: { answer: 5, checks: 3, recFrames: 3, loopSteps: 7, recSteps: 8 },
  3: { answer: 14, checks: 4, recFrames: 4, loopSteps: 9, recSteps: 11 },
  4: { answer: 30, checks: 5, recFrames: 5, loopSteps: 11, recSteps: 14 },
  5: { answer: 55, checks: 6, recFrames: 6, loopSteps: 13, recSteps: 17 },
  6: { answer: 91, checks: 7, recFrames: 7, loopSteps: 15, recSteps: 20 },
};

function data(): LoopVsRecursionData {
  return JSON.parse(JSON.stringify(loopVsRecursionFacet.initialData)) as LoopVsRecursionData;
}

/** 첫 판 n 에서 시작해 inputs 를 차례로 넣고, 판마다 이벤트 · 계기 · 걸음마다 켜진 phase 를 모은다. */
async function drive(inputs: number[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const metrics = new Map<string, number>();
  let cur: Round = { events: [], metrics: {}, lit: [] };
  let lastPhase: string | null = null;
  let cancelled = false;
  const queue = [...inputs];
  const close = (): void => {
    cur.metrics = Object.fromEntries(metrics);
    rounds.push(cur);
    cur = { events: [], metrics: {}, lit: [] };
  };
  const ctx = {
    data: data(),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      cur.events.push(e);
      if (e.type === 'phase') {
        const p = e.payload as { phase?: unknown };
        lastPhase = typeof p.phase === 'string' ? p.phase : null;
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      if (lastPhase !== null) cur.lit.push(lastPhase);
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      close();
      const v = queue.shift();
      if (v === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'upTo', payload: { value: v, segmentIndex: v - 1, upTo: String(v) } };
    },
  };
  await loopVsRecursionAlgorithm(ctx as never);
  return rounds;
}

function payloadOf(r: Round, type: string): Record<string, unknown> {
  const e = r.events.find((x) => x.type === type);
  if (!e) throw new Error(`이벤트 ${type} 가 없다`);
  return e.payload as Record<string, unknown>;
}

describe('loop-vs-recursion', () => {
  const LADDER = [1, 2, 3, 4, 5, 6];

  it('사다리 = segments[].value = SPEC 의 n, 첫 판 n = default', () => {
    const d = data();
    expect(d.upToLadder).toEqual(LADDER);
    expect(d.upToLadder.length).toBe(6);
    expect(d.upToLadder[d.upToLadder.length - 1]).toBe(6);
    const controls = (loopVsRecursionFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const knob = controls.find((c) => c.widget === 'segmented-slider') as { segments: Array<{ value: number; default?: boolean }> };
    expect(knob.segments.map((s) => s.value)).toEqual(d.upToLadder);
    expect(knob.segments.find((s) => s.default)?.value).toBe(d.upTo);
    expect(Object.keys(SPEC).map(Number)).toEqual(d.upToLadder);
  });

  it('모든 n 에서 IR 의 두 답 = algorithm 이 화면에 내는 두 답 = 사양 표', async () => {
    // 첫 판 4, 그다음 1..6 을 차례로
    const rounds = await drive(LADDER);
    expect(rounds.length).toBe(1 + LADDER.length);
    for (const r of rounds) {
      const v = payloadOf(r, 'verdict');
      const n = v.n as number;
      const loopIR = runIR(loopVsRecursionImperativeIR, 'sumSquaresLoop', [n]);
      const recIR = runIR(loopVsRecursionImperativeIR, 'sumSquaresRec', [n]);
      expect(v.loop).toBe(loopIR);
      expect(v.rec).toBe(recIR);
      expect(payloadOf(r, 'loop-return').answer).toBe(loopIR);
      const last = r.events.filter((e) => e.type === 'rec-return').at(-1)?.payload as Record<string, unknown>;
      expect(last.outside).toBe(true);
      expect(last.result).toBe(recIR);
      expect(loopIR).toBe(SPEC[n]!.answer);
      expect(recIR).toBe(SPEC[n]!.answer);
      expect(v.same).toBe(true);
    }
  });

  it('걸음 수와 걸음마다 켜진 phase — 반복 2n+3 · 재귀 3n+2', async () => {
    const rounds = await drive(LADDER);
    for (const r of rounds) {
      const n = payloadOf(r, 'round').n as number;
      const loopLit = r.lit.filter((p) => p.startsWith('loop-'));
      const recLit = r.lit.filter((p) => p.startsWith('rec-'));
      expect(loopLit.length).toBe(SPEC[n]!.loopSteps);
      expect(recLit.length).toBe(SPEC[n]!.recSteps);
      expect(r.lit.length).toBe(5 * n + 5);
      expect(new Set(r.lit)).toEqual(
        new Set(['loop-init', 'loop-check', 'loop-add', 'loop-return', 'rec-check', 'rec-base', 'rec-recurse']),
      );
    }
  });

  it('회차별 계기 — n = 4 → 6 → 4 가 회차마다 사양 표와 같다', async () => {
    const rounds = await drive([6, 4]);
    const want = [
      { 'loop-checks': 5, 'rec-checks': 5, 'loop-frames': 1, 'rec-frames': 5 },
      { 'loop-checks': 7, 'rec-checks': 7, 'loop-frames': 1, 'rec-frames': 7 },
      { 'loop-checks': 5, 'rec-checks': 5, 'loop-frames': 1, 'rec-frames': 5 },
    ];
    expect(rounds.map((r) => r.metrics)).toEqual(want);
  });

  it('모든 n 에서 계기 판 끝 값 = 사양 표', async () => {
    const rounds = await drive(LADDER);
    for (const r of rounds) {
      const n = payloadOf(r, 'round').n as number;
      expect(r.metrics).toEqual({
        'loop-checks': SPEC[n]!.checks,
        'rec-checks': SPEC[n]!.checks,
        'loop-frames': 1,
        'rec-frames': SPEC[n]!.recFrames,
      });
    }
  });

  it('사다리 밖의 손잡이 값은 던진다', async () => {
    await expect(drive([7])).rejects.toThrow(/사다리 밖/);
  });

  it('stage 가 mountView 로 한 판을 받는다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(loopVsRecursionStageView, container, { config: {}, locale: 'en' }) as unknown as {
      destroy(): void;
      startRound(): void;
      loopInit(n: number, acc: number, k: number, ms: number): void;
      recCheck(level: number, arg: number, base: boolean, count: number, height: number, ms: number): void;
      recCall(level: number, square: number, child: number, height: number, ms: number): void;
    };
    inst.startRound();
    inst.loopInit(2, 0, 1, 0);
    inst.recCheck(1, 2, false, 1, 1, 0);
    inst.recCall(1, 4, 1, 2, 0);
    expect(container.textContent).toContain('sumSquaresRec(1)');
    expect(container.textContent).toContain('Peak: 2');
    inst.destroy();
  });
});
