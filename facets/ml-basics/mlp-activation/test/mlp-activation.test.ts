// @vitest-environment happy-dom
/**
 * mlp-activation — facet 고유의 검수.
 *   사양 표 대조 (아홉 칸 × 스냅샷 여덟) · 끝 무게 · IR ↔ algorithm 전 조합 · 차례 섞기 · 모르는 종류 ·
 *   사다리 · 걸음 앞 phase · 회차별 계기 (A → B → A) · 첫 그림 멱등
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import {
  mlpActivationAlgorithm,
  mlpActivationFacet,
  mlpActivationImperativeIR,
  mlpActivationProjector,
  mlpActivationStageView,
  mlpTrain,
  runRound,
  type MlpActivationData,
  type MlpActivationUnit,
} from '../src/index.js';

const data = mlpActivationFacet.initialData as unknown as MlpActivationData;

/** 사양 실측표 — 스냅샷마다 맞힌 수 · 손실(셋째 자리). 대조용 */
const TABLE: Record<string, string> = {
  '0,1': '3 0.750|6 0.698|8 0.687|6 0.678|6 0.676|6 0.676|6 0.676|6 0.676',
  '0,2': '7 0.748|9 0.684|6 0.677|6 0.676|6 0.676|6 0.676|6 0.676|6 0.676',
  '0,4': '5 0.858|9 0.683|6 0.676|6 0.676|6 0.676|6 0.676|6 0.676|6 0.676',
  '1,1': '6 0.680|7 0.620|8 0.569|9 0.513|9 0.487|9 0.480|9 0.478|9 0.478',
  '1,2': '9 0.605|9 0.470|9 0.402|9 0.368|9 0.354|9 0.349|9 0.348|9 0.347',
  '1,4': '5 0.704|9 0.478|9 0.395|12 0.206|12 0.067|12 0.023|12 0.009|12 0.006',
  '2,1': '6 0.730|3 0.699|6 0.696|6 0.695|6 0.693|9 0.688|9 0.579|9 0.512',
  '2,2': '6 0.699|6 0.685|7 0.678|9 0.664|9 0.612|9 0.503|12 0.145|12 0.061',
  '2,4': '6 0.703|6 0.693|6 0.683|9 0.666|9 0.610|9 0.462|12 0.129|12 0.058',
};

const COMBOS: [number, number][] = [];
for (let k = 0; k < 3; k += 1) for (const w of [1, 2, 4]) COMBOS.push([k, w]);

type Pt = { x1: number; x2: number; y: number };

/** IR 을 스냅샷 사이 에폭 수로 이어 부른다 — 알고리즘과 같은 부름 */
function irRound(kind: number, pts: Pt[], units: MlpActivationUnit[]): string[] {
  const xs1 = pts.map((q) => q.x1);
  const xs2 = pts.map((q) => q.x2);
  const ys = pts.map((q) => q.y);
  const wa = units.map((u) => u.wa);
  const wb = units.map((u) => u.wb);
  const bs = units.map((u) => u.b);
  const vs = units.map((u) => u.v);
  const cs = [data.c0];
  const ds = pts.map(() => 0.0);
  const stats = [0.0];
  const out: string[] = [];
  let prev = 0;
  for (const e of data.snapshots) {
    const r = runIR(mlpActivationImperativeIR, 'mlpTrain', [kind, xs1, xs2, ys, wa, wb, bs, vs, cs, ds, stats, e - prev, data.lr]);
    prev = e;
    out.push(`${String(r)} ${stats[0].toFixed(3)}`);
  }
  return out;
}

function tsRound(kind: number, pts: Pt[], units: MlpActivationUnit[]): string[] {
  const d: MlpActivationData = { ...data, points: pts.map((q, i) => ({ id: `q${i + 1}`, ...q })), units };
  return runRound(d, kind, units.length).map((s) => `${s.right} ${s.loss.toFixed(3)}`);
}

/** 고정된 섞기 — 식이 적힌 생성기 (LCG) */
function shuffled<T>(xs: T[], seed: number): T[] {
  const out = [...xs];
  let s = seed;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (s * 1103515245 + 12345) % 2147483648;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

describe('mlp-activation — 셈', () => {
  it('사다리와 데이터 길이', () => {
    const controls = (mlpActivationFacet.blocks.controls as { controls: { name?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const act = controls.find((c) => c.name === 'activation');
    const width = controls.find((c) => c.name === 'width');
    expect(act?.segments?.map((s) => s.value)).toEqual(data.kinds.map((_, i) => i));
    expect(width?.segments?.map((s) => s.value)).toEqual(data.widths);
    expect(act?.segments?.find((s) => s.default)?.value).toBe(data.defaultKind);
    expect(width?.segments?.find((s) => s.default)?.value).toBe(data.defaultWidth);
    expect(data.kinds).toEqual(['none', 'relu', 'sigmoid']);
    expect(data.points).toHaveLength(12);
    expect(data.units).toHaveLength(Math.max(...data.widths));
    expect(data.snapshots).toEqual([0, 10, 25, 50, 100, 200, 400, 600]);
  });

  it('아홉 칸 × 스냅샷 여덟이 사양 표와 같다', () => {
    for (const [k, w] of COMBOS) {
      const got = runRound(data, k, w).map((s) => `${s.right} ${s.loss.toFixed(3)}`).join('|');
      expect(got, `${k},${w}`).toBe(TABLE[`${k},${w}`]);
    }
  });

  it('기본값 ReLU × 4 의 끝 무게가 사양 대조와 같다', () => {
    const pts = data.points;
    const wa = data.units.map((u) => u.wa);
    const wb = data.units.map((u) => u.wb);
    const bs = data.units.map((u) => u.b);
    const vs = data.units.map((u) => u.v);
    const cs = [data.c0];
    mlpTrain(1, pts.map((q) => q.x1), pts.map((q) => q.x2), pts.map((q) => q.y), wa, wb, bs, vs, cs, pts.map(() => 0), [0], 600, data.lr);
    const f = (xs: number[]) => xs.map((x) => x.toFixed(3));
    expect(f(wa)).toEqual(['-2.632', '-1.765', '1.614', '-0.386']);
    expect(f(wb)).toEqual(['1.474', '-2.006', '-2.081', '-0.564']);
    expect(f(bs)).toEqual(['0.054', '0.168', '0.257', '0.893']);
    expect(f(vs)).toEqual(['3.021', '-2.580', '2.559', '1.003']);
    expect(cs[0].toFixed(3)).toBe('-3.975');
  });

  it('점마다의 맞힘 표시를 더하면 맞힌 수다', () => {
    for (const [k, w] of COMBOS) {
      for (const s of runRound(data, k, w)) expect(s.correct.filter(Boolean).length).toBe(s.right);
    }
  });

  it('IR 의 답이 모든 손잡이 조합 · 모든 스냅샷에서 알고리즘과 같다', () => {
    for (const [k, w] of COMBOS) {
      const units = data.units.slice(0, w);
      expect(irRound(k, data.points, units), `${k},${w}`).toEqual(tsRound(k, data.points, units));
    }
  });

  it('점 · 단위의 차례를 섞어도 IR 과 알고리즘이 같고 표시는 적힌 차례와 같다', () => {
    for (const [k, w] of COMBOS) {
      const base = tsRound(k, data.points, data.units.slice(0, w));
      for (const seed of [7, 99]) {
        const pts = shuffled(data.points, seed);
        const units = shuffled(data.units.slice(0, w), seed + 1);
        const ts = tsRound(k, pts, units);
        expect(irRound(k, pts, units), `${k},${w} seed ${seed}`).toEqual(ts);
        expect(ts, `${k},${w} seed ${seed}`).toEqual(base);
      }
    }
  });

  it('모르는 종류 — TS 는 던지고 IR 은 −1', () => {
    const pts = data.points;
    for (const bad of [-1, 3, 7]) {
      const xs1 = () => pts.map((q) => q.x1);
      const xs2 = () => pts.map((q) => q.x2);
      const ys = () => pts.map((q) => q.y);
      const one = () => [0.1];
      expect(() => mlpTrain(bad, xs1(), xs2(), ys(), one(), one(), one(), one(), one(), pts.map(() => 0), [0], 1, 0.5)).toThrow();
      expect(runIR(mlpActivationImperativeIR, 'mlpTrain', [bad, xs1(), xs2(), ys(), one(), one(), one(), one(), one(), pts.map(() => 0), [0], 1, 0.5])).toBe(-1);
    }
  });
});

// ── 알고리즘을 가짜 ctx 로 돌린다 ───────────────────────────────────────────

type Log = { events: FacetRuntimeEvent[]; metrics: Map<string, number>; perRound: { epochs: number; correct: number }[][] };

async function drive(inputs: { type: string; payload: { value: number } }[]): Promise<Log> {
  const log: Log = { events: [], metrics: new Map(), perRound: [] };
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data: JSON.parse(JSON.stringify(data)) as MlpActivationData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      log.events.push(e);
      if (e.type === 'snapshot') {
        const p = e.payload as { step: number };
        if (p.step === 0) log.perRound.push([]);
        log.perRound[log.perRound.length - 1].push({ epochs: log.metrics.get('epochs') ?? NaN, correct: log.metrics.get('correct') ?? NaN });
      }
    },
    metric(name: string, delta: number | 'inc') {
      log.metrics.set(name, (log.metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      const next = queue.shift();
      if (next) return next;
      cancelled = true;
      throw new Error('cancelled');
    },
  } as unknown as ReactiveContext<MlpActivationData>;
  await mlpActivationAlgorithm(ctx);
  return log;
}

describe('mlp-activation — 재생', () => {
  it('걸음마다 바로 앞이 그 걸음의 phase 다 (#0 count · #1 … #7 train)', async () => {
    const log = await drive([{ type: 'width', payload: { value: 2 } }]);
    let steps = 0;
    log.events.forEach((e, i) => {
      if (e.type !== 'snapshot') return;
      steps += 1;
      expect(e.silent).toBeFalsy();
      const before = log.events[i - 1];
      const step = (e.payload as { step: number }).step;
      expect(before.type).toBe('phase');
      expect((before.payload as { phase: string }).phase).toBe(step === 0 ? 'count' : 'train');
    });
    expect(steps).toBe(16);
    expect(log.events[0].type).toBe('init');
    expect(log.events[0].silent).toBe(true);
  });

  it('회차별 계기 A → B → A (ReLU 4 → 시그모이드 4 → ReLU 4)', async () => {
    const log = await drive([
      { type: 'activation', payload: { value: 2 } },
      { type: 'activation', payload: { value: 1 } },
    ]);
    const want = (k: number, w: number) => TABLE[`${k},${w}`].split('|').map((c, i) => ({ epochs: data.snapshots[i], correct: Number(c.split(' ')[0]) }));
    expect(log.perRound).toHaveLength(3);
    expect(log.perRound[0]).toEqual(want(1, 4));
    expect(log.perRound[1]).toEqual(want(2, 4));
    expect(log.perRound[2]).toEqual(want(1, 4));
  });

  it('사다리 밖 · 수가 아닌 입력은 받지 않는다', async () => {
    const log = await drive([
      { type: 'width', payload: { value: 3 } },
      { type: 'activation', payload: { value: 5 } },
      { type: 'width', payload: { value: 1 } },
    ]);
    const rounds = log.events.filter((e) => e.type === 'snapshot' && (e.payload as { step: number }).step === 0).map((e) => (e.payload as { width: number }).width);
    expect(rounds).toEqual([4, 1]);
  });
});

describe('mlp-activation — 무대', () => {
  it('첫 그림을 두 번 먹여도 요소 수가 같고, reset 은 무대를 비운다', async () => {
    const log = await drive([{ type: 'width', payload: { value: 1 } }]);
    const container = document.createElement('div');
    const stage = mountView(mlpActivationStageView, container, { config: {}, locale: 'ko' });
    const projector = mlpActivationProjector({ stage }, { getSpeed: () => 1000, t: (_k, en) => en });
    const init = log.events[0];
    const feedAll = async () => {
      for (const e of log.events) await projector.onEvent(e);
    };
    await projector.onEvent(init);
    const once = container.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    await feedAll();
    const svg = container.querySelector('svg');
    expect(svg?.textContent).toContain('12');
    projector.onReset?.();
    const empty = container.querySelectorAll('*').length;
    expect(empty).toBeLessThan(once);
    await feedAll();
    expect(container.querySelectorAll('*').length).toBe(once);
  });
});
