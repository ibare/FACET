// @vitest-environment happy-dom
/**
 * dropout — 사양 표 대조 · IR ↔ algorithm 전 조합 · 섞은 차례 · 표지 · 걸음과 phase · 회차별 계기 · 무대 멱등.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  DROPOUT_INITIAL,
  DROPOUT_MARK,
  computeRun,
  dropoutAlgorithm,
  dropoutFacet,
  dropoutImperativeIR,
  dropoutProjector,
  dropoutRun,
  dropoutStageView,
  expectedOutput,
  flattenDraws,
  maskedOutput,
  outputRange,
  outputTicks,
  type DropoutData,
} from '../src/index.js';

const D = DROPOUT_INITIAL;

/** 사양의 실측표 (sim `dropout`) */
const TABLE: { p: number; r: number; e: string; m: string; sd: string; off: number; pct: number; lo: string; hi: string }[] = [
  { p: 0, r: 1, e: '1.050', m: '1.05', sd: '0.00', off: 0, pct: 0, lo: '1.05', hi: '1.05' },
  { p: 0, r: 0, e: '1.050', m: '1.05', sd: '0.00', off: 0, pct: 0, lo: '1.05', hi: '1.05' },
  { p: 0.1, r: 1, e: '1.050', m: '1.05', sd: '0.20', off: 21, pct: 9, lo: '0.70', hi: '1.30' },
  { p: 0.1, r: 0, e: '0.945', m: '0.94', sd: '0.18', off: 21, pct: 9, lo: '0.63', hi: '1.17' },
  { p: 0.4, r: 1, e: '1.050', m: '1.03', sd: '0.58', off: 90, pct: 38, lo: '0.05', hi: '2.15' },
  { p: 0.4, r: 0, e: '0.630', m: '0.62', sd: '0.35', off: 90, pct: 38, lo: '0.03', hi: '1.29' },
  { p: 0.7, r: 1, e: '1.050', m: '1.02', sd: '0.92', off: 165, pct: 69, lo: '-0.80', hi: '2.97' },
  { p: 0.7, r: 0, e: '0.315', m: '0.31', sd: '0.28', off: 165, pct: 69, lo: '-0.24', hi: '0.89' },
];

/** 기본값 판(p 0.4 · 켬)의 걸음별 y 와 쉰 칸 누적 (사양 "걸음") */
const DEFAULT_STEPS: { ys: string; off: number }[] = [
  { ys: '0.38 1.50 1.50 0.92 1.28', off: 11 },
  { ys: '0.27 1.28 1.50 0.05 2.15', off: 23 },
  { ys: '0.75 1.70 0.72 1.50 1.95', off: 33 },
  { ys: '0.05 1.30 0.38 1.17 1.25', off: 44 },
  { ys: '0.50 1.08 0.72 0.83 0.92', off: 57 },
  { ys: '1.95 1.28 0.60 1.48 0.27', off: 68 },
  { ys: '0.95 1.95 0.60 1.28 0.27', off: 79 },
  { ys: '2.15 0.30 1.25 0.75 0.60', off: 90 },
];

function irRun(data: DropoutData, p: number, r: number) {
  const ys = new Array<number>(data.us.length).fill(0);
  const stats = [0, 0, 0];
  const offs = [0, 0];
  const ret = runIR(dropoutImperativeIR, 'dropoutRun', [data.h, data.v, flattenDraws(data.us), p, r, ys, stats, offs]);
  return { ret, ys, stats, offs };
}

/** 식이 적힌 섞개 — 선형 합동 생성기로 고른 순열 */
function permutation(n: number, seed: number): number[] {
  const order = Array.from({ length: n }, (_, i) => i);
  let s = seed;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return order;
}

describe('dropout — 데이터 · 사다리', () => {
  it('사다리가 손잡이 segments 와 같고, 길이 · 끝값이 사양대로다', () => {
    const controls = (dropoutFacet.blocks['controls'] as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const drop = controls.find((c) => c.action === 'dropRate')!;
    const resc = controls.find((c) => c.action === 'rescale')!;
    expect(drop.segments!.map((s) => s.value)).toEqual(D.dropRates);
    expect(resc.segments!.map((s) => s.value)).toEqual(D.rescales);
    expect(drop.segments!.find((s) => s.default)!.value).toBe(D.defaultDropRate);
    expect(resc.segments!.find((s) => s.default)!.value).toBe(D.defaultRescale);
    expect(D.dropRates).toEqual([0, 0.1, 0.4, 0.7]);
    expect(D.rescales).toEqual([1, 0]);
    expect(D.h).toHaveLength(6);
    expect(D.v).toHaveLength(6);
    expect(D.us).toHaveLength(40);
    for (const row of D.us) expect(row).toHaveLength(6);
    expect((D.stepMs + 600) * 10).toBeLessThan(20_000);
  });

  it('뽑힌 수에 사다리의 p 와 같은 값이 없다 — 동률이 걸리지 않는다', () => {
    for (const u of flattenDraws(D.us)) for (const p of D.dropRates) expect(u).not.toBe(p);
  });
});

describe('dropout — 사양 표 대조', () => {
  it('실측표 여덟 칸', () => {
    for (const row of TABLE) {
      const run = computeRun(D, row.p, row.r);
      expect(run.expected.toFixed(3)).toBe(row.e);
      expect(run.mean.toFixed(2)).toBe(row.m);
      expect(run.sd.toFixed(2)).toBe(row.sd);
      expect(run.off).toBe(row.off);
      expect(run.pct).toBe(row.pct);
      expect(Math.min(...run.ys).toFixed(2)).toBe(row.lo);
      expect(Math.max(...run.ys).toFixed(2)).toBe(row.hi);
    }
  });

  it('기본값 판의 걸음별 y 와 쉰 칸 누적', () => {
    const run = computeRun(D, 0.4, 1);
    let off = 0;
    DEFAULT_STEPS.forEach((step, b) => {
      const ys = run.ys.slice(5 * b, 5 * b + 5).map((y) => y.toFixed(2)).join(' ');
      expect(ys).toBe(step.ys);
      for (let k = 5 * b; k < 5 * b + 5; k++) off += run.offEach[k]!;
      expect(off).toBe(step.off);
    });
  });

  it('y 범위 −0.80 … 2.97 과 눈금', () => {
    const { lo, hi } = outputRange(D);
    expect(lo.toFixed(2)).toBe('-0.80');
    expect(hi.toFixed(2)).toBe('2.97');
    expect(outputTicks(lo, hi)).toEqual([-0.5, 0, 0.5, 1, 1.5, 2, 2.5]);
  });

  it('같은 u 라 p 를 올리면 마스크마다 켜진 칸이 줄기만 한다', () => {
    for (let a = 0; a < D.dropRates.length - 1; a++) {
      const lo = computeRun(D, D.dropRates[a]!, 1);
      const hi = computeRun(D, D.dropRates[a + 1]!, 1);
      hi.on.forEach((flags, k) => flags.forEach((on, i) => { if (on) expect(lo.on[k]![i]).toBe(true); }));
    }
  });
});

describe('dropout — IR 과 algorithm', () => {
  it('모든 손잡이 조합에서 IR 의 답이 algorithm 과 같다', () => {
    for (const p of D.dropRates) {
      for (const r of D.rescales) {
        const ir = irRun(D, p, r);
        const run = computeRun(D, p, r);
        expect(ir.ys).toEqual(run.ys);
        expect(ir.stats).toEqual([run.expected, run.mean, run.sd]);
        expect(ir.offs).toEqual([run.off, run.pct]);
        expect(ir.ret).toBe(run.mean);
      }
    }
  });

  it('마스크 차례를 섞어도 IR 과 algorithm 이 같고 모음 수의 표시가 같다', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const order = permutation(D.us.length, seed);
      const shuffled: DropoutData = { ...D, us: order.map((k) => D.us[k]!) };
      for (const p of D.dropRates) {
        for (const r of D.rescales) {
          const base = computeRun(D, p, r);
          const run = computeRun(shuffled, p, r);
          const ir = irRun(shuffled, p, r);
          expect(ir.ys).toEqual(run.ys);
          expect(ir.stats).toEqual([run.expected, run.mean, run.sd]);
          expect(ir.offs).toEqual([run.off, run.pct]);
          expect(run.mean.toFixed(2)).toBe(base.mean.toFixed(2));
          expect(run.sd.toFixed(2)).toBe(base.sd.toFixed(2));
          expect(run.expected.toFixed(3)).toBe(base.expected.toFixed(3));
          expect(run.pct).toBe(base.pct);
        }
      }
    }
  });

  it('칸의 차례를 섞어도 같은 답이다 (h · v · u 를 함께 옮긴다)', () => {
    const order = [3, 0, 5, 1, 4, 2];
    const moved: DropoutData = {
      ...D,
      h: order.map((i) => D.h[i]!),
      v: order.map((i) => D.v[i]!),
      us: D.us.map((row) => order.map((i) => row[i]!)),
    };
    for (const p of D.dropRates) {
      for (const r of D.rescales) {
        const base = computeRun(D, p, r);
        const run = computeRun(moved, p, r);
        const ir = irRun(moved, p, r);
        expect(ir.ys).toEqual(run.ys);
        expect(run.mean.toFixed(2)).toBe(base.mean.toFixed(2));
        expect(run.sd.toFixed(2)).toBe(base.sd.toFixed(2));
        expect(run.off).toBe(base.off);
      }
    }
  });

  it('모르는 되살림 종류 — TS 는 던지고 IR 은 표지', () => {
    const us = flattenDraws(D.us);
    expect(() => maskedOutput(D.h, D.v, us, 0, 0.4, 2, [0, 0])).toThrow();
    expect(() => expectedOutput(D.h, D.v, 0.4, -1)).toThrow();
    expect(() => dropoutRun(D.h, D.v, us, 0.4, 2, [0], [0, 0, 0], [0, 0])).toThrow();
    expect(runIR(dropoutImperativeIR, 'maskedOutput', [D.h, D.v, us, 0, 0.4, 2, [0, 0]])).toBe(DROPOUT_MARK);
    expect(runIR(dropoutImperativeIR, 'expectedOutput', [D.h, D.v, 0.4, -1])).toBe(DROPOUT_MARK);
    // 정상 y 와 겹치지 않는다
    const { lo } = outputRange(D);
    expect(DROPOUT_MARK).toBeLessThan(lo);
  });
});

// ── 알고리즘을 가짜 ctx 로 돌린다
type Log = { events: FacetRuntimeEvent[]; metrics: Map<string, number>; perRun: { masks: number; off: number }[] };

async function drive(inputs: { type: string; payload: { value: number } }[]): Promise<Log> {
  const log: Log = { events: [], metrics: new Map(), perRun: [] };
  let cancelled = false;
  const queue = [...inputs];
  const data = structuredClone(D);
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      log.events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      const d = delta === 'inc' ? 1 : delta;
      log.metrics.set(name, (log.metrics.has(name) ? log.metrics.get(name)! : 0) + d);
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      log.perRun.push({ masks: log.metrics.get('masks')!, off: log.metrics.get('units-off')! });
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
  } as unknown as ReactiveContext<DropoutData>;
  await dropoutAlgorithm(ctx);
  return log;
}

describe('dropout — 걸음 · phase · 계기', () => {
  it('판마다 걸음 10, 걸음 이벤트 바로 앞이 그 걸음의 phase', async () => {
    const log = await drive([]);
    const steps = log.events.filter((e) => !e.silent);
    expect(steps.map((e) => e.type)).toEqual(['all-on', ...Array(8).fill('masks'), 'summary']);
    const want: Record<string, string> = { 'all-on': 'expect', masks: 'drop', summary: 'spread' };
    log.events.forEach((e, i) => {
      if (e.silent) return;
      const prev = log.events[i - 1]!;
      expect(prev.type).toBe('phase');
      expect((prev.payload as { phase: string }).phase).toBe(want[e.type]);
    });
    const phases = new Set(log.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase));
    const irPhases = new Set<string>();
    const walk = (x: unknown) => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        if (typeof o['phase'] === 'string') irPhases.add(o['phase']);
        Object.values(o).forEach(walk);
      }
    };
    walk(dropoutImperativeIR.functions);
    expect(phases).toEqual(irPhases);
  });

  it('회차별 계기 — p 0.4 → 0.7 → 0.4, 되살림 끔 → 켬 (A → B → A)', async () => {
    const log = await drive([
      { type: 'dropRate', payload: { value: 0.7 } },
      { type: 'dropRate', payload: { value: 0.4 } },
      { type: 'dropRate', payload: { value: 0.33 } }, // 사다리 밖 — 흘린다
      { type: 'rescale', payload: { value: 0 } },
      { type: 'dropRate', payload: { value: 0.1 } },
      { type: 'dropRate', payload: { value: 0 } },
      { type: 'rescale', payload: { value: 1 } },
    ]);
    expect(log.perRun).toEqual([
      { masks: 40, off: 90 },
      { masks: 40, off: 165 },
      { masks: 40, off: 90 },
      { masks: 40, off: 90 }, // 사다리 밖 입력은 판을 새로 돌리지 않는다 — 같은 판에서 다시 기다린다
      { masks: 40, off: 90 },
      { masks: 40, off: 21 },
      { masks: 40, off: 0 },
      { masks: 40, off: 0 },
    ]);
    const summaries = log.events.filter((e) => e.type === 'summary').map((e) => e.payload as { mean: number; sd: number; expected: number; pct: number });
    expect(summaries.map((s) => [s.mean.toFixed(2), s.sd.toFixed(2), s.expected.toFixed(3), s.pct])).toEqual([
      ['1.03', '0.58', '1.050', 38],
      ['1.02', '0.92', '1.050', 69],
      ['1.03', '0.58', '1.050', 38],
      ['0.62', '0.35', '0.630', 38],
      ['0.94', '0.18', '0.945', 9],
      ['1.05', '0.00', '1.050', 0],
      ['1.05', '0.00', '1.050', 0],
    ]);
  });
});

describe('dropout — 무대', () => {
  async function mountAll() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(dropoutStageView, container, { config: {}, locale: 'ko', isInstant: () => true });
    const projector = dropoutProjector({ stage }, { getSpeed: () => 1, t: (_k, f, v) => (v ? Object.entries(v).reduce((s, [k, x]) => s.split(`{${k}}`).join(String(x)), f) : f) });
    return { container, stage, projector };
  }

  it('첫 그림(init)을 두 번 먹여도 요소 수가 같다 · 되짚기 뒤 앞 판의 점이 남지 않는다', async () => {
    const log = await drive([]);
    const { container, projector } = await mountAll();
    const init = log.events.find((e) => e.type === 'init')!;
    await projector.onEvent(init);
    const n1 = container.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(n1);

    for (const e of log.events) await projector.onEvent(e);
    const dotsAfter = container.querySelectorAll('circle').length;
    projector.onReset?.();
    await projector.onEvent(init);
    // 점 마흔이 걷혔다
    expect(container.querySelectorAll('circle').length).toBe(dotsAfter - 40);
    expect(container.querySelectorAll('*').length).toBe(n1);
  });

  it('새 판의 걸음 0 은 앞 판의 점 · 표본 평균을 걷는다', async () => {
    const log = await drive([{ type: 'rescale', payload: { value: 0 } }]);
    const { container, projector } = await mountAll();
    const allOns = log.events.map((e, i) => (e.type === 'all-on' ? i : -1)).filter((i) => i >= 0);
    expect(allOns).toHaveLength(2);
    for (const e of log.events.slice(0, allOns[1]! + 1)) await projector.onEvent(e);
    const circles = container.querySelectorAll('circle').length;
    const text = container.textContent ?? '';
    expect(text).toContain('0.630');
    expect(text).not.toContain('1.03');
    // 칸 여섯 + 출력 점 하나 — 쌓인 점은 없다
    expect(circles).toBe(7);
  });
});
