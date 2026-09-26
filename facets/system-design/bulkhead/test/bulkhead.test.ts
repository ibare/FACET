// @vitest-environment happy-dom
/**
 * 벌크헤드 — facet 고유의 주장. 공통분(손잡이 · 덮이는 phase · 계기 누적 · IR 옮김)은 whole-check 가 잰다.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  bulkheadAlgorithm,
  bulkheadRanges,
  parseBulkheadData,
  simulateBulkhead,
  type BulkheadData,
} from '../src/algorithm.js';
import { bulkheadImperativeIR } from '../src/irs.js';
import { bulkheadFacet } from '../src/facet.js';
import { bulkheadProjector } from '../src/projector.js';
import { bulkheadStageView, type BulkheadStage } from '../src/bulkhead-stage.js';

const data = parseBulkheadData(bulkheadFacet.initialData);

/** 사양 실측표 (measure.py) — a 받음 · a 거절 · b 받음 · b 거절 · 틱마다 b 거절 · 걸음 수(걸음 0 포함) */
const TABLE: Record<number, { totals: [number, number, number, number]; perTick: string; steps: number }> = {
  0: { totals: [12, 12, 2, 22], perTick: '022222222222', steps: 17 },
  5: { totals: [10, 14, 6, 18], perTick: '121212121212', steps: 19 },
  4: { totals: [8, 16, 12, 12], perTick: '020202020202', steps: 19 },
  3: { totals: [6, 18, 18, 6], perTick: '010101010101', steps: 23 },
  2: { totals: [4, 20, 24, 0], perTick: '000000000000', steps: 23 },
};

function irRun(d: BulkheadData, aSlots: number): { answer: number; tally: number[] } {
  const [a, b] = d.services;
  if (a === undefined || b === undefined) throw new Error('services');
  const ends = new Array<number>(d.pool).fill(0);
  const owner = new Array<number>(d.pool).fill(0);
  const tally = [0, 0, 0, 0];
  const answer = runIR(bulkheadImperativeIR, 'runBulkhead', [
    aSlots, d.pool, d.ticks, a.rate, a.hold, b.rate, b.hold, ends, owner, tally,
  ]);
  if (typeof answer !== 'number') throw new Error('IR 답이 수가 아니다');
  return { answer, tally };
}

type Metrics = Record<string, number>;

/** 가짜 reactive ctx 로 알고리즘을 돌린다 — 입력을 차례로 주고, 판마다 계기 · 이벤트를 모은다 */
async function drive(inputs: number[]): Promise<{ runs: { metrics: Metrics; events: FacetRuntimeEvent[] }[] }> {
  const runs: { metrics: Metrics; events: FacetRuntimeEvent[] }[] = [];
  let cur: { metrics: Metrics; events: FacetRuntimeEvent[] } | null = null;
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data: data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      if (e.type === 'init') {
        cur = { metrics: {}, events: [] };
        runs.push(cur);
      }
      if (cur === null) throw new Error('init 전 이벤트');
      cur.events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      if (cur === null) throw new Error('init 전 계기');
      const d = delta === 'inc' ? 1 : delta;
      cur.metrics[name] = (cur.metrics[name] ?? 0) + d;
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const v = queue.shift();
      if (v === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'aSlots', payload: { value: v } };
    },
  };
  await bulkheadAlgorithm(ctx as never);
  return { runs };
}

/** 한 판의 계기 끝값 — 판 안의 차이를 모두 더하되 앞 판에서 이어진 값을 더한다 */
function cumulative(runs: { metrics: Metrics }[]): Metrics[] {
  const shown: Metrics = {};
  return runs.map((r) => {
    for (const [k, v] of Object.entries(r.metrics)) shown[k] = (shown[k] ?? 0) + v;
    return { ...shown };
  });
}

describe('벌크헤드 — 사양 대조', () => {
  it('사다리가 segments[].value 와 같고 끝값 · 길이가 사양대로다', () => {
    const controls = (bulkheadFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const knob = controls.find((c) => c.action === 'aSlots');
    if (knob?.segments === undefined) throw new Error('손잡이가 없다');
    expect(knob.segments.map((s) => s.value)).toEqual(data.ladder);
    expect(data.ladder).toEqual([0, 5, 4, 3, 2]);
    expect(knob.segments.find((s) => s.default)?.value).toBe(data.aSlots);
    expect(data.pool).toBe(6);
    expect(data.ticks).toBe(12);
  });

  it('칸 다섯 모두 판 끝 수 · 틱마다 b 거절 · 걸음 수가 실측표와 같다', () => {
    for (const aSlots of data.ladder) {
      const want = TABLE[aSlots];
      if (want === undefined) throw new Error(`표에 ${aSlots} 가 없다`);
      const run = simulateBulkhead(data, aSlots);
      const t = run.totals;
      expect([t.aTaken, t.aRefused, t.bTaken, t.bRefused]).toEqual(want.totals);
      const perTick = run.steps
        .filter((s) => s.kind === 'arrive')
        .map((s) => (s.kind === 'arrive' ? String(s.counts.bRefused) : ''))
        .join('');
      expect(perTick).toBe(want.perTick);
      expect(run.steps.length + 1).toBe(want.steps);
    }
  });

  it('기본값(나누지 않음)의 걸음 차례가 사양과 같다', () => {
    const run = simulateBulkhead(data, 0);
    const lines = run.steps.map((s) =>
      s.kind === 'release'
        ? `${s.tick} free ${s.freed.map((f) => `${f.seat}:${f.call}`).join(' ')}`
        : `${s.tick} ${s.calls.map((c) => (c.seat === null ? `${c.call}x` : `${c.call}>${c.seat}`)).join(' ')}`,
    );
    expect(lines.slice(0, 4)).toEqual([
      '0 a1>1 a2>2 b1>3 b2>4',
      '1 a3>5 a4>6 b3x b4x',
      '2 free 3:b1 4:b2',
      '2 a5>3 a6>4 b5x b6x',
    ]);
    expect(lines[7]).toBe('6 free 1:a1 2:a2');
    expect(lines[8]).toBe('6 a13>1 a14>2 b13x b14x');
    expect(lines[15]).toBe('11 a23x a24x b23x b24x');
  });

  it('3:3 판 끝 자리 모양이 대조값과 같다', () => {
    const run = simulateBulkhead(data, 3);
    const last = run.steps[run.steps.length - 1];
    expect(last?.seats.map((s) => s.call)).toEqual(['a13', 'a14', 'a15', 'b21', 'b22', 'b23']);
  });
});

describe('벌크헤드 — IR 과 algorithm 이 같은 답을 낸다', () => {
  it('칸 다섯 모두에서 tally 가 판 끝 계기와 같다', () => {
    for (const aSlots of data.ladder) {
      const run = simulateBulkhead(data, aSlots);
      const { answer, tally } = irRun(data, aSlots);
      expect(tally).toEqual([run.totals.aTaken, run.totals.aRefused, run.totals.bTaken, run.totals.bRefused]);
      expect(answer).toBe(run.totals.bRefused);
    }
  });

  it('빠르기 · 쥐는 틱을 흔든 데이터에서도 같다', () => {
    const variants: [number, number, number, number][] = [
      [1, 3, 3, 1],
      [3, 5, 1, 4],
      [2, 1, 2, 6],
    ];
    for (const [aRate, aHold, bRate, bHold] of variants) {
      const d: BulkheadData = {
        ...data,
        services: [
          { id: 'a', rate: aRate, hold: aHold },
          { id: 'b', rate: bRate, hold: bHold },
        ],
      };
      for (const aSlots of data.ladder) {
        const run = simulateBulkhead(d, aSlots);
        const { tally } = irRun(d, aSlots);
        expect(tally).toEqual([run.totals.aTaken, run.totals.aRefused, run.totals.bTaken, run.totals.bRefused]);
      }
    }
  });

  it('칸 크기가 0..pool−1 밖이면 TS 는 던지고 IR 은 −1 을 돌려준다', () => {
    for (const bad of [-1, 6, 7]) {
      expect(() => bulkheadRanges(bad, data.pool)).toThrow();
      expect(irRun(data, bad).answer).toBe(-1);
    }
  });
});

describe('벌크헤드 — 발신', () => {
  it('회차마다 계기가 실측표와 같다 (나누지 않음 → 3:3 → 나누지 않음)', async () => {
    const { runs } = await drive([3, 0]);
    expect(runs.length).toBe(3);
    const shown = cumulative(runs);
    const want = [TABLE[0], TABLE[3], TABLE[0]];
    shown.forEach((m, i) => {
      const w = want[i];
      if (w === undefined) throw new Error('표');
      expect([m['a-taken'], m['a-refused'], m['b-taken'], m['b-refused']]).toEqual(w.totals);
    });
  });

  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 이고, 걸음은 silent 가 아니다', async () => {
    const { runs } = await drive([5, 4, 3, 2]);
    const seen = new Set<string>();
    for (const r of runs) {
      expect(r.events[0]?.type).toBe('init');
      expect(r.events[0]?.silent).toBe(true);
      r.events.forEach((e, i) => {
        if (e.type !== 'release' && e.type !== 'arrive') return;
        expect(e.silent).not.toBe(true);
        const prev = r.events[i - 1];
        expect(prev?.type).toBe('phase');
        const ph = (prev?.payload as { phase: string }).phase;
        seen.add(ph);
        if (e.type === 'release') expect(ph).toBe('free');
        else {
          const c = (e.payload as { counts: { aRefused: number; bRefused: number } }).counts;
          expect(ph).toBe(c.aRefused + c.bRefused > 0 ? 'refuse' : 'take');
        }
      });
    }
    expect([...seen].sort()).toEqual(['free', 'refuse', 'take']);
  });
});

describe('벌크헤드 — 무대', () => {
  async function mounted() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    // 운동은 끝 상태로 건너뛴다 — 튕겨 나가던 토막이 걷힌 뒤를 본다
    const stage = mountView(bulkheadStageView, container, { config: {}, locale: 'ko', isInstant: () => true }) as BulkheadStage;
    const projector = bulkheadProjector({ stage }, { getSpeed: () => 1, t: (_k, f) => f });
    const { runs } = await drive([3]);
    return { container, stage, projector, runs };
  }

  it('config 만 주고 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    expect(() => mountView(bulkheadStageView, container, { config: {} })).not.toThrow();
  });

  it('첫 그림을 두 번 먹여도 요소 수가 늘지 않는다', async () => {
    const { container, projector, runs } = await mounted();
    const init = runs[0]?.events[0];
    if (init === undefined) throw new Error('init');
    await projector.onEvent(init);
    const n1 = container.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(n1);
  });

  it('한 판을 먹이면 끝 자리 모양이 되고, 다음 판 걸음 0 에서 앞 판의 결론이 걷힌다', async () => {
    const { container, projector, runs } = await mounted();
    const [first, second] = runs;
    if (first === undefined || second === undefined) throw new Error('판 둘');
    for (const e of [...first.events, ...second.events]) await projector.onEvent(e);
    const tokens = () => [...container.querySelectorAll('text')].map((x) => x.textContent ?? '');
    const held = tokens().filter((x) => /^[ab]\d+$/.test(x)).sort();
    expect(held).toEqual(['a13', 'a14', 'a15', 'b21', 'b22', 'b23']);
    const head = first.events[0];
    if (head === undefined) throw new Error('init');
    await projector.onEvent(head);
    expect(tokens().some((x) => /^[ab]\d+$/.test(x))).toBe(false);
    expect(tokens()).not.toContain('✗');
  });

  it('onReset 은 무대를 비운다', async () => {
    const { container, projector, runs } = await mounted();
    for (const e of runs[0]?.events ?? []) await projector.onEvent(e);
    projector.onReset?.();
    expect(container.querySelectorAll('svg *').length).toBe(1);
    // 되짚기: 첫 줄부터 다시 먹여도 된다
    for (const e of runs[0]?.events ?? []) await projector.onEvent(e);
  });
});
