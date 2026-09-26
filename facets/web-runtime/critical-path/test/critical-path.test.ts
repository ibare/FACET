// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  computeTimeline,
  criticalPathAlgorithm,
  timelineToArray,
  type CriticalPathData,
} from '../src/algorithm.js';
import { criticalPathImperativeIR } from '../src/irs.js';
import { criticalPathFacet } from '../src/facet.js';
import { criticalPathStageView } from '../src/critical-path-stage.js';

const data = criticalPathFacet.initialData as unknown as CriticalPathData;

/** 여섯 조합 — 사양 "손잡이 실측표"·"DOM 완성 ↔ 첫 장 간격" 표를 옮긴 것. 다르면 이 테스트가 멈춘다. */
const COMBOS: { attr: number; preload: number; expected: number[] }[] = [
  { attr: 0, preload: 0, expected: [10, 160, 20, 270, 270, 330, 390, 340, 390, 310, 340, 640, 640, 300, 50, 1] },
  { attr: 0, preload: 1, expected: [20, 170, 30, 280, 280, 340, 400, 350, 400, 310, 10, 310, -1, 0, 50, 1] },
  { attr: 1, preload: 0, expected: [10, 160, 20, 270, 270, 330, 80, 160, 330, 0, 160, 460, 460, 300, 80, 0] },
  { attr: 1, preload: 1, expected: [20, 170, 30, 280, 280, 340, 90, 170, 340, 0, 10, 310, 310, 140, 80, 0] },
  { attr: 2, preload: 0, expected: [10, 160, 20, 270, 270, 330, 80, 160, 80, 0, 160, 460, 460, 300, 80, 0] },
  { attr: 2, preload: 1, expected: [20, 170, 30, 280, 280, 340, 90, 170, 90, 0, 10, 310, 310, 140, 80, 0] },
];

describe('critical-path — IR ↔ algorithm ↔ 사양 표', () => {
  for (const { attr, preload, expected } of COMBOS) {
    it(`attr=${attr} preload=${preload}`, () => {
      const tl = computeTimeline(attr, preload, data);
      const fromAlgo = timelineToArray(tl);
      expect(fromAlgo, '사양 표와 다르다').toEqual(expected);

      const out = new Array(16).fill(0);
      runIR(criticalPathImperativeIR, 'computeTimeline', [attr, preload, out]);
      expect(out, 'IR 이 algorithm 과 다른 값을 낸다').toEqual(fromAlgo);
    });
  }
});

// ── 판을 돌리는 얇은 하니스 — whole-self-check.test.ts 의 drive() 와 같은 자리를 이 facet 전용으로 잰다.

type Round = { events: FacetRuntimeEvent[]; metrics: Map<string, number>; lit: Set<string> };

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

async function drive(inputs: { type: string; payload: Record<string, unknown> }[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals = new Map<string, number>();
  let current: Round = { events: [], metrics: totals, lit: new Set() };
  let lastPhase: string | null = null;
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const waiting = new Promise<void>((r) => (idle = r));
  const close = (): void => {
    if (lastPhase) current.lit.add(lastPhase);
    rounds.push({ ...current, metrics: new Map(totals) });
  };
  const ctx = {
    data: clone(data),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc'): void {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      current.events.push(event);
      const p = event.payload as { phase?: unknown } | undefined;
      if (event.type === 'phase' && typeof p?.phase === 'string') lastPhase = p.phase;
    },
    async sleep(): Promise<boolean> {
      if (lastPhase) current.lit.add(lastPhase);
      return !cancelled;
    },
    async waitForInput(): Promise<{ type: string; payload: Record<string, unknown> }> {
      close();
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      current = { events: [], metrics: totals, lit: new Set() };
      return next;
    },
    pollInput(): null {
      return null;
    },
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('20 초 안에 입력 대기에 닿지 않았다')), 20_000);
  });
  try {
    await Promise.race([criticalPathAlgorithm(ctx as never).then(() => close()), waiting, cap]);
  } finally {
    clearTimeout(timer);
    cancelled = true;
  }
  return rounds;
}

function timelineKinds(round: Round): string[] {
  return round.events
    .filter((e) => e.type === 'timeline')
    .map((e) => String((e.payload as { kind: unknown }).kind));
}

describe('critical-path — 계기 회차', () => {
  it('parser-stall-ms 가 없음(310) → defer(0) → 없음(310) 순으로, 누적되지 않는다', async () => {
    const rounds = await drive([
      { type: 'setAttr', payload: { value: 1 } },
      { type: 'setAttr', payload: { value: 0 } },
    ]);
    expect(rounds.length).toBe(3);
    expect(rounds[0]!.metrics.get('parser-stall-ms')).toBe(310);
    expect(rounds[1]!.metrics.get('parser-stall-ms')).toBe(0);
    expect(rounds[2]!.metrics.get('parser-stall-ms')).toBe(310);
  });

  it('없음×있음 조합에서는 font-swap 이벤트가 한 번도 발화하지 않는다 (없음×없음 판은 발화한다)', async () => {
    const rounds = await drive([{ type: 'setPreload', payload: { value: 1 } }]);
    expect(timelineKinds(rounds[0]!)).toContain('font-swap');
    expect(timelineKinds(rounds[1]!)).not.toContain('font-swap');
  });

  it('없음 조합에서만 parser-stop/parser-resume phase 가 나온다', async () => {
    const rounds = await drive([
      { type: 'setAttr', payload: { value: 1 } },
      { type: 'setAttr', payload: { value: 2 } },
    ]);
    const phasesOf = (r: Round): Set<string> =>
      new Set(
        r.events
          .filter((e) => e.type === 'phase')
          .map((e) => String((e.payload as { phase: unknown }).phase)),
      );
    expect(phasesOf(rounds[0]!).has('parser-stop')).toBe(true);
    expect(phasesOf(rounds[0]!).has('parser-resume')).toBe(true);
    expect(phasesOf(rounds[1]!).has('parser-stop')).toBe(false);
    expect(phasesOf(rounds[2]!).has('parser-stop')).toBe(false);
  });
});

describe('critical-path — 손잡이 사다리', () => {
  it('segments[].value 가 initialData 의 사다리와 같다', () => {
    const controls = (criticalPathFacet.blocks.controls as { controls: { action: string; segments?: { value: unknown }[] }[] })
      .controls;
    const attrCtl = controls.find((c) => c.action === 'setAttr')!;
    const preloadCtl = controls.find((c) => c.action === 'setPreload')!;
    expect(attrCtl.segments!.map((s) => s.value)).toEqual(data.attrLadder);
    expect(preloadCtl.segments!.map((s) => s.value)).toEqual(data.preloadLadder);
  });
});

describe('critical-path — mount', () => {
  it('config: {} 만 줘도 마운트에서 던지지 않는다', () => {
    const container = document.createElement('div');
    const instance = mountView(criticalPathStageView, container, { config: {} });
    expect(instance).toBeTruthy();
    instance.destroy();
  });
});
