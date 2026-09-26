// @vitest-environment happy-dom
/**
 * convolution 고유의 검수 — 사양 실측표 · 대조값, IR ↔ algorithm 여섯 조합(전치 포함), 회차별 계기,
 * 사다리 ↔ segments, 무대 마운트.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  computeRound,
  convolutionAlgorithm,
  convolutionFacet,
  convolutionImperativeIR,
  convolutionProjector,
  convolutionStageView,
  readConvolutionData,
  type ConvolutionData,
} from '../src/index.js';

const data = readConvolutionData(convolutionFacet.initialData);

type Row = { s: number; p: number; o: number; placed: number; dropped: number; lines: number[]; corner: number; max: number; padded: number; steps: number };
// 사양 실측표 (sim.py)
const TABLE: Row[] = [
  { s: 1, p: 0, o: 6, placed: 36, dropped: 0, lines: [], corner: 1, max: 9, padded: 0, steps: 8 },
  { s: 2, p: 0, o: 3, placed: 9, dropped: 15, lines: [7], corner: 1, max: 4, padded: 0, steps: 5 },
  { s: 3, p: 0, o: 2, placed: 4, dropped: 28, lines: [6, 7], corner: 1, max: 1, padded: 0, steps: 4 },
  { s: 1, p: 1, o: 8, placed: 64, dropped: 0, lines: [], corner: 4, max: 9, padded: 36, steps: 11 },
  { s: 2, p: 1, o: 4, placed: 16, dropped: 0, lines: [], corner: 1, max: 4, padded: 36, steps: 7 },
  { s: 3, p: 1, o: 3, placed: 9, dropped: 0, lines: [], corner: 1, max: 1, padded: 36, steps: 6 },
];

const OUTPUT: Record<string, string> = {
  's1p0': '0 1 4 3 1 −5 / 1 6 −3 −3 6 2 / 5 −3 −2 −2 −3 5 / 5 −3 −2 −2 −3 4 / 1 6 −3 −3 6 1 / 0 0 4 3 0 0',
  's2p0': '0 4 1 / 5 −2 −3 / 1 −3 6',
  's3p0': '0 3 / 5 −2',
  's1p1':
    '4 −2 −4 2 6 −1 −1 −1 / −2 0 1 4 3 1 −5 4 / −3 1 6 −3 −3 6 2 −4 / 0 5 −3 −2 −2 −3 5 −1 / 0 5 −3 −2 −2 −3 4 4 / −3 1 6 −3 −3 6 1 −4 / −3 0 0 4 3 0 0 −2 / 8 −4 0 1 6 −1 −3 4',
  's2p1': '4 −4 6 −1 / −3 6 −3 2 / 0 −3 −2 4 / −3 0 3 0',
  's3p1': '4 2 −1 / 0 −2 5 / −3 4 0',
};

const AXIS_USE: Record<string, number[]> = {
  's1p0': [1, 2, 3, 3, 3, 3, 2, 1],
  's2p0': [1, 1, 2, 1, 2, 1, 1, 0],
  's3p0': [1, 1, 1, 1, 1, 1, 0, 0],
  's1p1': [2, 3, 3, 3, 3, 3, 3, 2],
  's2p1': [1, 2, 1, 2, 1, 2, 1, 1],
  's3p1': [1, 1, 1, 1, 1, 1, 1, 1],
};

// 사양의 "줄마다 창이 닿은 입력 칸"
const TOUCHED: Record<string, number[]> = {
  's1p0': [24, 32, 40, 48, 56, 64],
  's2p0': [21, 35, 49],
  's3p0': [18, 36],
  's1p1': [16, 24, 32, 40, 48, 56, 64, 64],
  's2p1': [16, 32, 48, 64],
  's3p1': [16, 40, 64],
};

const fmt = (grid: number[][]): string => grid.map((r) => r.map((v) => (v < 0 ? `−${-v}` : String(v))).join(' ')).join(' / ');

function transpose(g: number[][]): number[][] {
  return g[0]!.map((_, c) => g.map((row) => row[c]!));
}

describe('convolution — 사양 실측표', () => {
  for (const row of TABLE) {
    it(`s ${row.s} · p ${row.p}`, () => {
      const r = computeRound(data, row.s, row.p);
      const key = `s${row.s}p${row.p}`;
      expect(r.o).toBe(row.o);
      expect(r.anchors.length).toBe(row.placed);
      expect(r.dropped).toBe(row.dropped);
      expect(r.droppedRows).toEqual(row.lines);
      expect(r.droppedCols).toEqual(row.lines);
      expect(r.cornerUse).toBe(row.corner);
      expect(r.maxUse).toBe(row.max);
      expect(r.paddedCells).toBe(row.p > 0 ? row.padded : 0);
      expect(fmt(r.output)).toBe(OUTPUT[key]);
      expect(r.rows.map((x) => x.touched)).toEqual(TOUCHED[key]);
      // 걸음 = 걸음 0 + (두르기) + 줄 + 끝
      expect(1 + (row.p > 0 ? 1 : 0) + r.o + 1).toBe(row.steps);
      // 2 차원 쓰임 = 행 쓰임 × 열 쓰임
      const axis = AXIS_USE[key]!;
      for (let i = 0; i < 8; i += 1) for (let j = 0; j < 8; j += 1) expect(r.cover[i]![j]).toBe(axis[i]! * axis[j]!);
    });
  }
  it('기본값 s 2 · p 1 의 창 왼위 자리 (두른 격자 기준)', () => {
    const r = computeRound(data, 2, 1);
    expect(r.rows[0]!.anchors).toEqual([[0, 0], [0, 2], [0, 4], [0, 6]]);
    expect(r.rows[3]!.anchors).toEqual([[6, 0], [6, 2], [6, 4], [6, 6]]);
    expect(r.rows.map((x) => x.placed)).toEqual([4, 8, 12, 16]);
  });
});

describe('convolution — IR 과 algorithm', () => {
  const flat = (g: number[][]): number[] => g.flat();
  for (const transposed of [false, true]) {
    for (const row of TABLE) {
      it(`s ${row.s} · p ${row.p}${transposed ? ' · 전치' : ''}`, () => {
        const input = transposed ? transpose(data.input) : data.input;
        const d: ConvolutionData = { ...data, input };
        const r = computeRound(d, row.s, row.p);
        const out = new Array<number>(64).fill(0);
        const o = runIR(convolutionImperativeIR, 'convolve', [flat(input), 8, flat(data.kernel), 3, row.s, row.p, out]);
        expect(o).toBe(r.o);
        expect(out.slice(0, r.o * r.o)).toEqual(flat(r.output));
        const cover = new Array<number>(8).fill(7);
        const dropped = runIR(convolutionImperativeIR, 'droppedCells', [8, 3, row.s, row.p, cover]);
        expect(dropped).toBe(r.dropped);
        // 한 축의 쓰임
        expect(cover).toEqual(AXIS_USE[`s${row.s}p${row.p}`]);
      });
    }
  }
  it('매개변수 배열 길이와 사다리 끝값', () => {
    expect(data.input.length).toBe(8);
    expect(data.kernel.length).toBe(3);
    const largest = computeRound(data, Math.min(...data.strideLadder), Math.max(...data.paddingLadder));
    expect(largest.o * largest.o).toBeLessThanOrEqual(64);
    expect(Math.max(...data.paddingLadder)).toBe(1);
    expect(Math.min(...data.strideLadder)).toBe(1);
  });
});

describe('convolution — 사다리와 손잡이', () => {
  const controls = (convolutionFacet.blocks.controls as { controls: unknown[] }).controls;
  const knob = (name: string) =>
    controls.find((c) => typeof c === 'object' && c !== null && (c as { name?: unknown }).name === name) as
      | { segments: { value: number; default?: boolean }[] }
      | undefined;
  it('segments[].value 가 사다리와 같고 기본값이 initialData 와 같다', () => {
    const stride = knob('stride');
    const padding = knob('padding');
    expect(stride?.segments.map((s) => s.value)).toEqual(data.strideLadder);
    expect(padding?.segments.map((s) => s.value)).toEqual(data.paddingLadder);
    expect(stride?.segments.find((s) => s.default)?.value).toBe(data.initialStride);
    expect(padding?.segments.find((s) => s.default)?.value).toBe(data.initialPadding);
  });
});

type Input = { type: string; payload: { value: number } };

/** 알고리즘을 돌려 판마다 계기 · 이벤트 · 걸음 수를 모은다 */
async function drive(inputs: Input[]) {
  const totals = new Map<string, number>();
  const rounds: { metrics: Map<string, number>; events: FacetRuntimeEvent[]; steps: number; phases: string[] }[] = [];
  let events: FacetRuntimeEvent[] = [];
  let steps = 0;
  let phases: string[] = [];
  let lastPhase = '';
  const queue = [...inputs];
  let cancelled = false;
  let done!: () => void;
  const finished = new Promise<void>((r) => (done = r));
  const ctx = {
    data: structuredClone(convolutionFacet.initialData),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      const p = e.payload as { phase?: unknown } | undefined;
      if (e.type === 'phase' && typeof p?.phase === 'string') lastPhase = p.phase;
    },
    async sleep() {
      steps += 1;
      phases.push(lastPhase);
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ metrics: new Map(totals), events, steps, phases });
      events = [];
      steps = 0;
      phases = [];
      const next = queue.shift();
      if (!next) {
        done();
        return new Promise<never>(() => {});
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([convolutionAlgorithm(ctx as never), finished]);
  cancelled = true;
  return rounds;
}

describe('convolution — 회차별 계기', () => {
  it('s 2 · p 1 → s 2 · p 0 → s 2 · p 1 → s 1 · p 1 → s 3 · p 1 → s 3 · p 0 → s 1 · p 0', async () => {
    const rounds = await drive([
      { type: 'padding', payload: { value: 0 } },
      { type: 'padding', payload: { value: 1 } },
      { type: 'stride', payload: { value: 1 } },
      { type: 'stride', payload: { value: 3 } },
      { type: 'padding', payload: { value: 0 } },
      { type: 'stride', payload: { value: 1 } },
    ]);
    const expected = [
      [2, 1],
      [2, 0],
      [2, 1],
      [1, 1],
      [3, 1],
      [3, 0],
      [1, 0],
    ];
    expect(rounds.length).toBe(expected.length);
    rounds.forEach((round, i) => {
      const [s, p] = expected[i]!;
      const row = TABLE.find((x) => x.s === s && x.p === p)!;
      expect(round.metrics.get('positions'), `회차 ${i + 1}`).toBe(row.placed);
      expect(round.metrics.get('weights'), `회차 ${i + 1}`).toBe(9);
      expect(round.metrics.get('dropped-cells'), `회차 ${i + 1}`).toBe(row.dropped);
      expect(round.steps, `회차 ${i + 1} 걸음`).toBe(row.steps);
    });
    // 기본값의 걸음마다 켜지는 phase
    expect(rounds[0]!.phases).toEqual(['output-size', 'pad-zero', 'window-sum', 'window-sum', 'window-sum', 'window-sum', 'cover-count']);
    expect(rounds[1]!.phases).toEqual(['output-size', 'window-sum', 'window-sum', 'window-sum', 'cover-count']);
  });

  it('phase 는 그 걸음의 발신 앞에 온다', async () => {
    const [first] = await drive([]);
    const types = first!.events.map((e) => e.type);
    for (let i = 0; i < types.length; i += 1) {
      if (types[i] === 'phase') expect(types[i + 1]).not.toBe('phase');
    }
    expect(types.slice(0, 2)).toEqual(['phase', 'round-start']);
  });

  it('사다리 밖 값과 남의 입력은 흘린다', async () => {
    const rounds = await drive([
      { type: 'stride', payload: { value: 5 } },
      { type: 'other', payload: { value: 1 } },
      { type: 'stride', payload: { value: 3 } },
    ]);
    // 흘린 입력 뒤에는 발신 없이 다시 기다린다 — 판이 도는 것은 첫 판과 보폭 3 판뿐이다
    const played = rounds.filter((r) => r.events.length > 0);
    expect(played.length).toBe(2);
    expect(played[1]!.metrics.get('positions')).toBe(9);
  });
});

describe('convolution — 무대', () => {
  it('판마다 이벤트를 받아 그리고 새 판 걸음 0 에 앞 판의 결론을 걷는다', async () => {
    const rounds = await drive([{ type: 'padding', payload: { value: 0 } }]);
    const container = document.createElement('div');
    const stage = mountView(convolutionStageView, container, { config: {}, locale: 'ko' });
    const projector = convolutionProjector({ stage }, { getSpeed: () => 1, t: (_k, en) => en });
    for (const e of rounds[0]!.events) await projector.onEvent(e);
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const texts = () => [...svg!.querySelectorAll('text')].map((x) => x.textContent ?? '');
    expect(texts()).toContain('−4');
    for (const e of rounds[1]!.events) {
      await projector.onEvent(e);
      if (e.type === 'round-start') {
        // 걸음 0 — 출력 값 · 쓰임 글자가 걷혔다 (입력 · 창 값만 남는다)
        const all = texts();
        expect(all.filter((x) => x === '−4').length).toBe(0);
      }
    }
    expect(texts().join(' ')).toContain('15');
    expect(() => projector.onEvent({ type: 'nope', payload: {} })).toThrow();
    stage.destroy();
  });

  it('initialData 없이 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    const stage = mountView(convolutionStageView, container, { config: {} });
    stage.destroy();
  });
});
