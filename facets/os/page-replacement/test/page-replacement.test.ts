// @vitest-environment happy-dom
/**
 * page-replacement — 사양 표 대조 · IR ↔ algorithm 전 조합 · 회차별 계기 · 사다리 · 화면 끝 모습.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  countFaults,
  pageReplacementAlgorithm,
  pageReplacementFacet,
  pageReplacementImperativeIR,
  pageReplacementProjector,
  pageReplacementStageView,
  type PageReplacementData,
  type PageStep,
} from '../src/index.js';

const data = pageReplacementFacet.initialData as unknown as PageReplacementData;
const CAP = Math.max(...data.frameLadder);

/** 사양 실측표 (sim.py page-replacement) — [참조열][프레임-1] = [FIFO, LRU, Clock] */
const SPEC_FAULTS: number[][][] = [
  [
    [13, 13, 13],
    [12, 11, 12],
    [9, 10, 9],
    [10, 8, 9],
    [5, 5, 5],
  ],
  [
    [12, 12, 12],
    [12, 12, 12],
    [9, 10, 9],
    [10, 8, 10],
    [5, 5, 5],
  ],
];

/** 사양 전 조합표의 끝 프레임 (칸 차례) — [참조열][정책][프레임-1] */
const SPEC_END: number[][][][] = [
  [
    [[3], [1, 3], [3, 5, 1], [1, 3, 2, 5], [4, 2, 5, 1, 3]],
    [[3], [3, 1], [5, 1, 3], [3, 2, 1, 5], [4, 2, 5, 1, 3]],
    [[3], [1, 3], [3, 5, 1], [1, 3, 4, 5], [4, 2, 5, 1, 3]],
  ],
  [
    [[5], [4, 5], [5, 3, 4], [4, 5, 2, 3], [1, 2, 3, 4, 5]],
    [[5], [4, 5], [3, 4, 5], [5, 2, 4, 3], [1, 2, 3, 4, 5]],
    [[5], [4, 5], [5, 3, 4], [4, 5, 2, 3], [1, 2, 3, 4, 5]],
  ],
];

const buffers = (): [number[], number[], number[]] => [new Array(CAP).fill(0), new Array(CAP).fill(0), new Array(CAP).fill(0)];

function traceOf(refIx: number, policy: number, frames: number): { faults: number; trace: PageStep[] } {
  const trace: PageStep[] = [];
  const faults = countFaults(data.refStrings[refIx]!, frames, policy, ...buffers(), trace);
  return { faults, trace };
}

type Input = { type: string; payload: Record<string, unknown> };

/** 알고리즘을 돌려 판마다 계기 합과 발신을 모은다. */
async function drive(inputs: Input[]): Promise<{ metrics: Record<string, number>; events: FacetRuntimeEvent[] }[]> {
  const rounds: { metrics: Record<string, number>; events: FacetRuntimeEvent[] }[] = [];
  const totals: Record<string, number> = {};
  let events: FacetRuntimeEvent[] = [];
  const queue = [...inputs];
  let cancelled = false;
  let finish!: () => void;
  const done = new Promise<void>((r) => (finish = r));
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ metrics: { ...totals }, events });
      events = [];
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        finish();
        return new Promise<never>(() => {});
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  void pageReplacementAlgorithm(ctx as never);
  await done;
  return rounds;
}

const knob = (type: string, value: number, state: Record<string, number>): Input => {
  const next = { ...state, [type]: value };
  Object.assign(state, next);
  return {
    type,
    payload: { value, segmentIndex: 0, refString: String(next.refString), policy: String(next.policy), frames: String(next.frames) },
  };
};

describe('page-replacement', () => {
  it('사다리 — segments 값과 initialData 가 같고, 데이터 크기를 잠근다', () => {
    const controls = (pageReplacementFacet.blocks.controls as { controls: { widget?: string; action?: string; segments?: { value: number }[] }[] }).controls;
    const ladder = (action: string) => controls.find((c) => c.action === action)?.segments?.map((s) => s.value);
    expect(ladder('policy')).toEqual(data.policyLadder);
    expect(ladder('frames')).toEqual(data.frameLadder);
    expect(ladder('refString')).toEqual(data.refLadder);
    expect(data.refStrings.map((r) => r.length)).toEqual([13, 12]);
    expect(data.frameLadder.at(-1)).toBe(5);
    expect(data.policies).toEqual(['fifo', 'lru', 'clock']);
  });

  it('IR ↔ algorithm — 서른 조합의 폴트 수와 끝 프레임이 같고, 사양 표와 같다', () => {
    let maxMid = 0;
    for (const refIx of data.refLadder) {
      for (const policy of data.policyLadder) {
        for (const frames of data.frameLadder) {
          const [sp, st, sm] = buffers();
          const irFaults = runIR(pageReplacementImperativeIR, 'countFaults', [data.refStrings[refIx]!, frames, policy, sp, st, sm]);
          const { faults, trace } = traceOf(refIx, policy, frames);
          const tag = `열 ${refIx + 1} · 정책 ${policy} · 프레임 ${frames}`;
          expect(irFaults, tag).toBe(faults);
          expect(faults, tag).toBe(SPEC_FAULTS[refIx]![frames - 1]![policy]);
          expect(sp.slice(0, frames), tag).toEqual(trace.at(-1)!.pages);
          expect(sp.slice(0, frames), tag).toEqual(SPEC_END[refIx]![policy]![frames - 1]);
          maxMid = Math.max(maxMid, faults, ...st, data.refStrings[refIx]!.length);
        }
      }
    }
    expect(maxMid).toBe(13);
  });

  it('기본 판의 걸음표 — 사양의 #1..#13', () => {
    const { trace } = traceOf(0, 0, 4);
    expect(trace.map((s) => s.kind)).toEqual(['fill', 'fill', 'fill', 'fill', 'hit', 'hit', 'evict', 'hit', 'evict', 'evict', 'evict', 'evict', 'evict']);
    expect(trace.filter((s) => s.kind === 'evict').map((s) => [s.frame, s.evicted])).toEqual([
      [0, 4],
      [1, 2],
      [2, 5],
      [3, 1],
      [0, 3],
      [1, 4],
    ]);
    // 같은 열 FIFO · 3 은 #8 · #9 · #10 · #13 이 적중
    expect(traceOf(0, 0, 3).trace.flatMap((s) => (s.kind === 'hit' ? [s.index + 1] : []))).toEqual([8, 9, 10, 13]);
  });

  it('동률 — FIFO · LRU 에서 내보낼 때 차 있는 프레임의 때가 겹친 적이 없다', () => {
    let ties = 0;
    for (const refIx of data.refLadder) {
      for (const policy of [0, 1]) {
        for (const frames of data.frameLadder) {
          const { trace } = traceOf(refIx, policy, frames);
          for (let k = 1; k < trace.length; k += 1) {
            if (trace[k]!.kind !== 'evict') continue;
            const before = trace[k - 1]!.stamps;
            ties += before.length - new Set(before).size;
          }
        }
      }
    }
    expect(ties).toBe(0);
  });

  it('회차별 계기 — (1·FIFO·4) → (1·FIFO·3) → (1·LRU·4) → (1·FIFO·4), 막대 다섯은 IR 로 셈한 값', async () => {
    const state = { refString: 0, policy: 0, frames: 4 };
    const inputs = [knob('frames', 3, state), knob('frames', 4, state), knob('policy', 1, state), knob('policy', 0, state), knob('refString', 1, state)];
    const rounds = await drive(inputs);
    const m = rounds.map((r) => [r.metrics.faults, r.metrics.hits, r.metrics.evictions]);
    expect(m).toEqual([
      [10, 3, 6],
      [9, 4, 6],
      [10, 3, 6],
      [8, 5, 4],
      [10, 3, 6],
      [10, 2, 6],
    ]);
    // 걸음 수 — #0 을 포함해 14 · 13 (sleep 한 번이 한 걸음)
    const starts = rounds.map((r) => r.events.filter((e) => e.type === 'reference').length + 1);
    expect(starts).toEqual([14, 14, 14, 14, 14, 13]);
    for (const [ix, r] of rounds.entries()) {
      const start = r.events.find((e) => e.type === 'round-start')!.payload as { bars: number[]; policy: number; refString: number };
      const expected = data.frameLadder.map((f) => {
        const [sp, st, sm] = buffers();
        return runIR(pageReplacementImperativeIR, 'countFaults', [data.refStrings[start.refString]!, f, start.policy, sp, st, sm]);
      });
      expect(start.bars, `판 ${ix + 1}`).toEqual(expected);
    }
  });

  it('phase — 걸음마다 하나, 정책마다 제 줄', async () => {
    const state = { refString: 0, policy: 0, frames: 4 };
    const rounds = await drive([knob('policy', 1, state), knob('policy', 2, state)]);
    const phases = rounds.map((r) => r.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase));
    expect(new Set(phases[0])).toEqual(new Set(['fill', 'hit-fifo', 'evict-stamp']));
    expect(new Set(phases[1])).toEqual(new Set(['fill', 'hit-lru', 'evict-stamp']));
    expect(new Set(phases[2])).toEqual(new Set(['fill', 'hit-clock', 'evict-clock']));
    for (const p of phases) expect(p.length).toBe(13);
  });

  it('화면 — 기본 판을 끝까지 먹이면 프레임 0~3 에 1 · 3 · 2 · 5, 캡션은 마지막 내보냄', async () => {
    const [first] = await drive([]);
    const container = document.createElement('div');
    const stage = mountView(pageReplacementStageView, container, { config: {}, initialData: data as never, locale: 'en' });
    const captions: string[] = [];
    const projector = pageReplacementProjector({ stage }, { getSpeed: () => 1, t: (_k, en, vars) => Object.entries(vars ?? {}).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), en) });
    projector.onInit?.(data);
    for (const e of first!.events) {
      await projector.onEvent(e);
      const text = container.querySelectorAll('text');
      captions.push(text[text.length - 1]!.textContent ?? '');
    }
    expect(captions.at(-1)).toBe('Reference: 3 · Fault: evicted 4 from frame 1');
    const svg = container.querySelector('svg')!;
    const tokenTexts = [...svg.querySelectorAll('g > g > text')].map((n) => n.textContent);
    // 걸린 운동이 남았을 수 있다 — 들어온 페이지 네 개는 끝 모습으로 있다
    expect(tokenTexts).toEqual(expect.arrayContaining(['1', '3', '2', '5']));
    stage.destroy();
  });

  it('손잡이 라벨과 정적 모양 — 막대 눈금은 가장 긴 참조열', async () => {
    const [first] = await drive([]);
    const start = first!.events.find((e) => e.type === 'round-start')!.payload as { scale: number };
    expect(start.scale).toBe(13);
  });
});
