// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { BOX_COUNTS, FB_BEATS, PROP_LEFT, PROP_TRANSFORM, frameBudgetAlgorithm, type FrameBudgetData } from '../src/algorithm.js';
import { frameBudgetImperativeIR } from '../src/irs.js';
import { frameBudgetFacet } from '../src/facet.js';
import { frameBudgetStageView, type FrameBudgetBeatPayload } from '../src/frame-budget-stage.js';

type Input = { type: string; payload: { value: number } };

/** 판 하나를 처음부터 끝까지(박자 0..FB_BEATS) 돌려 'beat' 이벤트 payload 를 모은다. */
async function collectRound(prop: number, boxCount: number): Promise<FrameBudgetBeatPayload[]> {
  const events: FrameBudgetBeatPayload[] = [];
  let cancelled = false;
  const ctx: FacetContext<FrameBudgetData> = {
    data: { type: 'frameBudget', stepMs: 1, prop, boxCount },
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      if (e.type === 'beat') events.push(e.payload as FrameBudgetBeatPayload);
    },
    metric() {
      /* 이 검사에서는 보지 않는다 — driveRounds 몫 */
    },
  } as unknown as FacetContext<FrameBudgetData>;
  Object.assign(ctx, {
    async sleep() {
      if (events.length > FB_BEATS) {
        cancelled = true;
        return false;
      }
      return true;
    },
    async waitForInput() {
      return new Promise<never>(() => {});
    },
    pollInput() {
      return null;
    },
  });
  await frameBudgetAlgorithm(ctx);
  return events;
}

/** 손잡이를 A → B → A 로 돌려 각 판의 계기(new-frames, fps) 최종값을 모은다. */
async function driveRounds(inputs: Input[]): Promise<{ metrics: Map<string, number>; roundEndMetrics: Map<string, number>[] }> {
  const totals = new Map<string, number>();
  const roundEndMetrics: Map<string, number>[] = [];
  let cancelled = false;
  const queue = [...inputs];
  const ctx: FacetContext<FrameBudgetData> = {
    data: { type: 'frameBudget', stepMs: 1, prop: PROP_LEFT, boxCount: 7 },
    get cancelled() {
      return cancelled;
    },
    async emit() {
      /* no-op */
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
  } as unknown as FacetContext<FrameBudgetData>;
  let beatsThisRound = 0;
  Object.assign(ctx, {
    async sleep() {
      beatsThisRound += 1;
      if (beatsThisRound > FB_BEATS + 1) {
        cancelled = true;
        return false;
      }
      return true;
    },
    async waitForInput() {
      roundEndMetrics.push(new Map(totals));
      beatsThisRound = 0;
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
  });
  await frameBudgetAlgorithm(ctx);
  return { metrics: totals, roundEndMetrics };
}

const PROPS = [PROP_TRANSFORM, PROP_LEFT];

describe('frame-budget — IR ↔ algorithm 전 조합 대조', () => {
  for (const prop of PROPS) {
    for (const n of BOX_COUNTS) {
      it(`prop=${prop} boxCount=${n}`, async () => {
        const events = await collectRound(prop, n);
        expect(events.length).toBe(FB_BEATS + 1);
        for (const e of events) {
          const irPos = runIR(frameBudgetImperativeIR, 'frameAtBeat', [e.beat, prop, n]);
          const irHits = runIR(frameBudgetImperativeIR, 'newFramesUpTo', [e.beat, prop, n]);
          const irFps = runIR(frameBudgetImperativeIR, 'fpsAtBeat', [e.beat, prop, n]);
          expect(irPos, `beat ${e.beat} position`).toBe(e.position);
          expect(irHits, `beat ${e.beat} newFrames`).toBe(e.newFrames);
          expect(irFps, `beat ${e.beat} fps`).toBe(e.fps);
        }
      });
    }
  }
});

/** spec-frame-budget.md 의 손잡이 표 — judge-sim.py frame-budget 실측 그대로. */
const SPEC_TABLE: { prop: number; n: number; cost: number; overMs: number | null; newFrames: number; repeats: number; fps: number; gapMs: number; jumpPx: number }[] = [
  { prop: PROP_TRANSFORM, n: 2, cost: 2, overMs: null, newFrames: 12, repeats: 0, fps: 60, gapMs: 16.7, jumpPx: 20 },
  { prop: PROP_TRANSFORM, n: 4, cost: 2, overMs: null, newFrames: 12, repeats: 0, fps: 60, gapMs: 16.7, jumpPx: 20 },
  { prop: PROP_TRANSFORM, n: 7, cost: 2, overMs: null, newFrames: 12, repeats: 0, fps: 60, gapMs: 16.7, jumpPx: 20 },
  { prop: PROP_TRANSFORM, n: 8, cost: 2, overMs: null, newFrames: 12, repeats: 0, fps: 60, gapMs: 16.7, jumpPx: 20 },
  { prop: PROP_TRANSFORM, n: 12, cost: 2, overMs: null, newFrames: 12, repeats: 0, fps: 60, gapMs: 16.7, jumpPx: 20 },
  { prop: PROP_TRANSFORM, n: 16, cost: 2, overMs: null, newFrames: 12, repeats: 0, fps: 60, gapMs: 16.7, jumpPx: 20 },
  { prop: PROP_TRANSFORM, n: 20, cost: 2, overMs: null, newFrames: 12, repeats: 0, fps: 60, gapMs: 16.7, jumpPx: 20 },
  { prop: PROP_LEFT, n: 2, cost: 6, overMs: null, newFrames: 12, repeats: 0, fps: 60, gapMs: 16.7, jumpPx: 20 },
  { prop: PROP_LEFT, n: 4, cost: 10, overMs: null, newFrames: 12, repeats: 0, fps: 60, gapMs: 16.7, jumpPx: 20 },
  { prop: PROP_LEFT, n: 7, cost: 16, overMs: null, newFrames: 12, repeats: 0, fps: 60, gapMs: 16.7, jumpPx: 20 },
  { prop: PROP_LEFT, n: 8, cost: 18, overMs: 1.3, newFrames: 6, repeats: 6, fps: 30, gapMs: 33.3, jumpPx: 40 },
  { prop: PROP_LEFT, n: 12, cost: 26, overMs: 9.3, newFrames: 6, repeats: 6, fps: 30, gapMs: 33.3, jumpPx: 40 },
  { prop: PROP_LEFT, n: 16, cost: 34, overMs: 17.3, newFrames: 4, repeats: 8, fps: 20, gapMs: 50.0, jumpPx: 60 },
  { prop: PROP_LEFT, n: 20, cost: 42, overMs: 25.3, newFrames: 4, repeats: 8, fps: 20, gapMs: 50.0, jumpPx: 60 },
];

describe('frame-budget — 사양 표 대조', () => {
  for (const row of SPEC_TABLE) {
    it(`prop=${row.prop} n=${row.n}`, async () => {
      const events = await collectRound(row.prop, row.n);
      const last = events[events.length - 1]!;
      expect(last.frameCost, '한 장 ms').toBe(row.cost);
      expect(last.newFrames, '새 장').toBe(row.newFrames);
      expect(last.repeats, '되풀이').toBe(row.repeats);
      expect(last.fps, '초당').toBe(row.fps);

      const over60 = last.frameCost * 60 - 1000;
      const over = over60 > 0 ? Math.round((over60 / 60) * 10) / 10 : null;
      expect(over, '넘친 ms').toBe(row.overMs);

      const newBeats = events.filter((e) => e.isNewFrame).map((e) => e.beat);
      expect(newBeats.length, '새 장 나온 박자 수').toBe(row.newFrames);
      let longestGapBeats = 0;
      for (let i = 1; i < newBeats.length; i += 1) longestGapBeats = Math.max(longestGapBeats, newBeats[i]! - newBeats[i - 1]!);
      const gapMs = Math.round(longestGapBeats * (1000 / 60) * 10) / 10;
      expect(gapMs, '가장 긴 간격').toBe(row.gapMs);

      if (newBeats.length >= 2) {
        const positions = newBeats.map((b) => events[b]!.position);
        const jump = positions[1]! - positions[0]!;
        for (let i = 2; i < positions.length; i += 1) expect(positions[i]! - positions[i - 1]!, '한 번에 옮긴 px 는 고정').toBe(jump);
        expect(jump, '한 번에 옮긴 px').toBe(row.jumpPx);
      }
    });
  }
});

describe('frame-budget — 회차별 계기(A → B → A)', () => {
  it('boxCount 를 7 → 8 → 7 로 돌리면 1 회차와 3 회차의 계기가 같다', async () => {
    const { roundEndMetrics } = await driveRounds([
      { type: 'boxCount', payload: { value: 8 } },
      { type: 'boxCount', payload: { value: 7 } },
    ]);
    expect(roundEndMetrics.length).toBeGreaterThanOrEqual(3);
    const first = roundEndMetrics[0]!;
    const third = roundEndMetrics[2]!;
    expect(third.get('new-frames')).toBe(first.get('new-frames'));
    expect(third.get('fps')).toBe(first.get('fps'));
    // 1 회차(boxCount 7, left)는 사양 표대로 새 장 12 · 초당 60 이어야 한다.
    expect(first.get('new-frames')).toBe(12);
    expect(first.get('fps')).toBe(60);
    // 2 회차(boxCount 8)는 새 장 6 · 초당 30 이어야 한다.
    const second = roundEndMetrics[1]!;
    expect(second.get('new-frames')).toBe(6);
    expect(second.get('fps')).toBe(30);
  });
});

describe('frame-budget — 손잡이 사다리', () => {
  it('boxCount 사다리가 BOX_COUNTS 와 같다', () => {
    const controls = frameBudgetFacet.blocks.controls as unknown as { controls: { action: string; segments: { value: number; default?: boolean }[] }[] };
    const boxCountControl = controls.controls.find((c) => c.action === 'boxCount');
    expect(boxCountControl, 'boxCount 손잡이가 있어야 한다').toBeDefined();
    const values = boxCountControl!.segments.map((s) => s.value);
    expect(values).toEqual([...BOX_COUNTS]);
    const def = boxCountControl!.segments.find((s) => s.default === true)?.value;
    expect(def).toBe(7);

    const propControl = controls.controls.find((c) => c.action === 'prop');
    expect(propControl, 'prop 손잡이가 있어야 한다').toBeDefined();
    const propValues = propControl!.segments.map((s) => s.value);
    expect(propValues).toEqual([PROP_TRANSFORM, PROP_LEFT]);
    const propDef = propControl!.segments.find((s) => s.default === true)?.value;
    expect(propDef).toBe(PROP_LEFT);
  });
});

describe('frame-budget — stage 마운트', () => {
  it('initialData 없이 마운트해도 던지지 않고, onBeat 이 던지지 않는다', () => {
    const container = document.createElement('div');
    const instance = mountView(frameBudgetStageView, container, { config: {} }) as unknown as {
      onBeat(payload: FrameBudgetBeatPayload, speedMul: number): void;
      destroy(): void;
    };
    expect(() =>
      instance.onBeat(
        { beat: 3, position: 40, isNewFrame: true, newFrames: 2, repeats: 1, fps: 40, frameCost: 18, prop: PROP_LEFT, boxCount: 8 },
        1,
      ),
    ).not.toThrow();
    expect(() => instance.onBeat({ beat: 0, position: 0, isNewFrame: false, newFrames: 0, repeats: 0, fps: 0, frameCost: 2, prop: PROP_TRANSFORM, boxCount: 2 }, 2)).not.toThrow();
    instance.destroy();
  });
});
