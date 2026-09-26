// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  firstBelowHalf,
  logitOf,
  lossAlgorithm,
  lossAxes,
  lossRun,
  lossTrack,
  type LossData,
} from '../src/algorithm.js';
import { lossImperativeIR } from '../src/irs.js';
import { lossFacet } from '../src/facet.js';
import { lossProjector } from '../src/projector.js';
import { lossStageView, type LossStage } from '../src/loss-stage.js';

const data = lossFacet.initialData as unknown as LossData;

/** 사양 실측표 (sim `loss`) — 대조용 */
const TABLE: Record<string, [string, string, string, string, string, string, number | null, string]> = {
  //            z0      L@0      g@0       p@3      p@6      p@12     0.5 아래  L@12
  '0:0.7': ['0.85', '0.490', '0.2940', '0.495', '0.341', '0.211', 3, '0.044'],
  '0:0.9': ['2.20', '0.810', '0.1620', '0.839', '0.711', '0.347', 10, '0.121'],
  '0:0.99': ['4.60', '0.980', '0.0196', '0.989', '0.989', '0.987', null, '0.974'],
  '0:0.999': ['6.91', '0.998', '0.0020', '0.999', '0.999', '0.999', null, '0.998'],
  '1:0.7': ['0.85', '1.204', '0.7000', '0.311', '0.174', '0.088', 2, '0.092'],
  '1:0.9': ['2.20', '2.303', '0.9000', '0.472', '0.227', '0.101', 3, '0.107'],
  '1:0.99': ['4.60', '4.605', '0.9900', '0.845', '0.405', '0.132', 6, '0.142'],
  '1:0.999': ['6.91', '6.908', '0.9990', '0.981', '0.752', '0.183', 8, '0.202'],
};

const at = (a: readonly number[], i: number): number => {
  const v = a[i];
  if (v === undefined) throw new Error(`no ${i}`);
  return v;
};

function irRun(kind: number, y: number, p0: number) {
  const n = data.steps + 1;
  const ps = new Array<number>(n).fill(0);
  const gs = new Array<number>(n).fill(0);
  const ls = new Array<number>(n).fill(0);
  const ret = runIR(lossImperativeIR, 'lossRun', [kind, y, logitOf(p0), data.eta, data.steps, ps, gs, ls]);
  return { ret, ps, gs, ls };
}

describe('loss — 사양 대조', () => {
  it('사다리 · segments · 기본값', () => {
    const blocks = lossFacet.blocks.controls as { controls: { name?: string; segments?: { value: number; default?: boolean }[] }[] };
    const kindSeg = blocks.controls.find((c) => c.name === 'lossKind')?.segments;
    const confSeg = blocks.controls.find((c) => c.name === 'confidence')?.segments;
    expect(kindSeg?.map((s) => s.value)).toEqual(data.kinds.map((_, i) => i));
    expect(confSeg?.map((s) => s.value)).toEqual(data.confidences.map((_, i) => i));
    expect(kindSeg?.findIndex((s) => s.default)).toBe(data.kindIndex);
    expect(confSeg?.findIndex((s) => s.default)).toBe(data.confidenceIndex);
    expect(data.kinds).toEqual(['squared', 'cross-entropy']);
    expect(data.confidences).toEqual([0.7, 0.9, 0.99, 0.999]);
    expect(data.steps).toBe(12);
  });

  it('여덟 칸이 실측표와 같다', () => {
    for (let kind = 0; kind < 2; kind++) {
      for (const p0 of data.confidences) {
        const row = TABLE[`${kind}:${p0}`];
        if (!row) throw new Error('no row');
        const tr = lossTrack(kind, data.y, p0, data.eta, data.steps);
        expect(at(tr.zs, 0).toFixed(2)).toBe(row[0]);
        expect(at(tr.ls, 0).toFixed(3)).toBe(row[1]);
        expect(at(tr.gs, 0).toFixed(4)).toBe(row[2]);
        expect(at(tr.ps, 3).toFixed(3)).toBe(row[3]);
        expect(at(tr.ps, 6).toFixed(3)).toBe(row[4]);
        expect(at(tr.ps, 12).toFixed(3)).toBe(row[5]);
        expect(firstBelowHalf(tr.ps, data.steps)).toBe(row[6]);
        expect(at(tr.ls, 12).toFixed(3)).toBe(row[7]);
        // p 는 갱신마다 내려간다 · 0.5 에 닿지 않는다
        for (let t = 1; t <= data.steps; t++) expect(at(tr.ps, t)).toBeLessThan(at(tr.ps, t - 1));
        for (const p of tr.ps) expect(Math.abs(p - 0.5)).toBeGreaterThan(0.004);
      }
    }
  });

  it('기본값 판 (교차 엔트로피 × 0.99) 의 열', () => {
    const tr = lossTrack(1, data.y, 0.99, data.eta, data.steps);
    expect(tr.ps.map((p) => p.toFixed(3)).join(' ')).toBe(
      '0.990 0.974 0.933 0.845 0.701 0.538 0.405 0.312 0.249 0.206 0.174 0.150 0.132',
    );
    expect(tr.gs.map((g) => g.toFixed(4)).join(' ')).toBe(
      '0.9900 0.9735 0.9329 0.8454 0.7013 0.5379 0.4047 0.3120 0.2492 0.2056 0.1740 0.1504 0.1322',
    );
    expect(tr.ls.map((l) => l.toFixed(3)).join(' ')).toBe(
      '4.605 3.632 2.701 1.867 1.208 0.772 0.519 0.374 0.287 0.230 0.191 0.163 0.142',
    );
  });

  it('축은 사다리 전체로 고정', () => {
    const ax = lossAxes(data);
    expect(ax.zMin).toBe(-3);
    expect(ax.zMax).toBe(7);
    expect(ax.lMax).toEqual([1, 7]);
    expect(ax.gMax).toBe(1);
    expect(ax.curves.length).toBe(2);
  });
});

describe('loss — IR 과 algorithm', () => {
  it('모든 손잡이 조합에서 같은 버퍼 · 같은 답', () => {
    for (let kind = 0; kind < 2; kind++) {
      for (const p0 of data.confidences) {
        const tr = lossTrack(kind, data.y, p0, data.eta, data.steps);
        const ir = irRun(kind, data.y, p0);
        expect(ir.ret).toBe(tr.last);
        expect(ir.ps).toEqual(tr.ps);
        expect(ir.gs).toEqual(tr.gs);
        expect(ir.ls).toEqual(tr.ls);
      }
    }
  });

  it('y 를 실제로 읽는다 — y = 1 · p0 = 0.01 은 y = 0 · p0 = 0.99 의 거울', () => {
    for (let kind = 0; kind < 2; kind++) {
      const a = irRun(kind, 0, 0.99);
      const b = irRun(kind, 1, 0.01);
      for (let t = 0; t <= data.steps; t++) {
        expect(at(b.gs, t)).toBeCloseTo(-at(a.gs, t), 12);
        expect(at(b.ls, t)).toBeCloseTo(at(a.ls, t), 12);
        expect(at(b.ps, t)).toBeCloseTo(1 - at(a.ps, t), 12);
      }
    }
  });

  it('모르는 종류 — TS 는 던지고 IR 은 −1', () => {
    expect(() => lossRun(2, 0, 1, 1, 1, [0, 0], [0, 0], [0, 0])).toThrow();
    expect(runIR(lossImperativeIR, 'lossRun', [2, 0, 1.0, 1.0, 1, [0, 0], [0, 0], [0, 0]])).toBe(-1);
    expect(runIR(lossImperativeIR, 'lossRun', [-1, 0, 1.0, 1.0, 1, [0, 0], [0, 0], [0, 0]])).toBe(-1);
  });
});

type Rec = { type: string; payload?: unknown; silent?: boolean };

async function drive(inputs: { type: string; payload: unknown }[]) {
  const events: Rec[] = [];
  const metrics: { name: string; delta: number | 'inc' }[] = [];
  let cancelled = false;
  const queue = inputs.slice();
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e as Rec);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.push({ name, delta });
      events.push({ type: '#metric', payload: { name, delta } });
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        return { type: 'none' };
      }
      events.push({ type: '#input' });
      return next;
    },
  };
  await lossAlgorithm(ctx as never);
  return { events, metrics };
}

describe('loss — 판과 걸음', () => {
  it('판마다 14 걸음, 걸음마다 바로 앞이 그 걸음의 phase', async () => {
    const { events } = await drive([{ type: 'lossKind', payload: { value: 0 } }]);
    const steps = events.filter((e) => !e.silent && !e.type.startsWith('#'));
    expect(steps.length).toBe(28);
    const want: Record<string, string> = { start: 'measure', slope: 'slope', update: 'update' };
    events.forEach((e, i) => {
      if (e.silent || e.type.startsWith('#')) return;
      // 바로 앞 (계기 기록은 건너뛴다)
      let j = i - 1;
      while (j >= 0 && events[j]?.type === '#metric') j--;
      const prev = events[j];
      expect(prev?.type).toBe('phase');
      expect((prev?.payload as { phase: string }).phase).toBe(want[e.type]);
    });
  });

  it('계기 updates — A → B → A 회차마다 0 에서 12 까지', async () => {
    const { events } = await drive([
      { type: 'confidence', payload: { value: 3 } },
      { type: 'confidence', payload: { value: 2 } },
      { type: 'other', payload: { value: 1 } }, // 우리 것이 아닌 type 은 흘린다
    ]);
    let shown = 0;
    const perRun: number[][] = [];
    for (const e of events) {
      if (e.type === '#metric') {
        const d = (e.payload as { delta: number }).delta;
        shown += d;
      }
      if (e.type === 'init') perRun.push([]);
      if (e.type === 'start' || e.type === 'slope' || e.type === 'update') perRun[perRun.length - 1]?.push(shown);
    }
    expect(perRun.length).toBe(3);
    for (const run of perRun) expect(run).toEqual([0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    // 회차마다 p0 이 손잡이를 따른다
    const starts = events.filter((e) => e.type === 'start').map((e) => (e.payload as { p0: number }).p0);
    expect(starts).toEqual([0.99, 0.999, 0.99]);
  });
});

describe('loss — 손잡이 값 확인', () => {
  it('제 type 인데 사다리 밖이면 던진다', async () => {
    await expect(drive([{ type: 'confidence', payload: { value: 'x' } }])).rejects.toThrow();
    await expect(drive([{ type: 'lossKind', payload: { value: 2 } }])).rejects.toThrow();
  });
});

describe('loss — 무대', () => {
  it('첫 그림을 두 번 먹여도 요소 수가 같고, onReset 이 비운다', async () => {
    const container = document.createElement('div');
    const stage = mountView(lossStageView, container, { config: {}, locale: 'ko', isInstant: () => true }) as LossStage;
    const proj = lossProjector({ stage }, { getSpeed: () => 1, t: (_k, en) => en });
    const { events } = await drive([]);
    const first = events.filter((e) => !e.type.startsWith('#'));
    const init = first[0];
    if (!init) throw new Error('no init');
    await proj.onEvent(init as FacetRuntimeEvent);
    const n1 = container.querySelectorAll('*').length;
    await proj.onEvent(init as FacetRuntimeEvent);
    expect(container.querySelectorAll('*').length).toBe(n1);
    for (const e of first.slice(1)) await proj.onEvent(e as FacetRuntimeEvent);
    proj.onReset?.();
    expect(container.querySelectorAll('svg *').length).toBe(0);
    stage.destroy();
  });
});
