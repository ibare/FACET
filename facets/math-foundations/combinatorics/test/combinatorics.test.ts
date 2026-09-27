// @vitest-environment happy-dom
/**
 * combinatorics 고유 검사 — IR ↔ algorithm 42 조합 · 사양 표 · 걸음과 phase 차례 · 회차별 계기 · 사다리 ·
 * 점을 날것으로 센 수 = 뺀 쪽 + 넣은 쪽 · P ÷ k! · 무대 첫 그림의 멱등.
 * 공통분(손잡이가 닿는가 · 덮이는 phase · 계기 누적 · transpile)은 whole-check 가 잰다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  combinatoricsAlgorithm,
  combinatoricsFacet,
  combinatoricsImperativeIR,
  combinatoricsProjector,
  combinatoricsStageView,
  type CombinatoricsData,
  type CombinatoricsStage,
} from '../src/index.js';

/** 사양 표 (python3 sim.py combinatorics) — 칸 = 크기 k 무리 수. 대조용. */
const SPEC: Record<number, number[]> = {
  1: [1, 1, 0, 0, 0, 0, 0],
  2: [1, 2, 1, 0, 0, 0, 0],
  3: [1, 3, 3, 1, 0, 0, 0],
  4: [1, 4, 6, 4, 1, 0, 0],
  5: [1, 5, 10, 10, 5, 1, 0],
  6: [1, 6, 15, 20, 15, 6, 1],
};
/** 사양의 P(n, k) ÷ k! 줄 — n 4 · n 6. */
const SPEC_P: Record<number, [number, number][]> = {
  4: [[1, 1], [4, 1], [12, 2], [24, 6], [24, 24]],
  6: [[1, 1], [6, 1], [30, 2], [120, 6], [360, 24], [720, 120], [720, 720]],
};

type Input = { type: 'elements' | 'size'; value: number };
type Round = { events: FacetRuntimeEvent[]; metrics: Record<string, number>; lit: string[]; order: string[] };

function data(): CombinatoricsData {
  return JSON.parse(JSON.stringify(combinatoricsFacet.initialData)) as CombinatoricsData;
}

/** 첫 판(기본값)에서 시작해 inputs 를 차례로 넣고 판마다 이벤트 · 계기 · 걸음 경계마다 켜진 phase 를 모은다. */
async function drive(inputs: Input[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const metrics = new Map<string, number>();
  const blank = (): Round => ({ events: [], metrics: {}, lit: [], order: [] });
  let cur = blank();
  let lastPhase: string | null = null;
  let cancelled = false;
  const queue = [...inputs];
  const close = (): void => {
    cur.metrics = Object.fromEntries(metrics);
    rounds.push(cur);
    cur = blank();
    lastPhase = null;
  };
  const ctx = {
    data: data(),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      cur.events.push(e);
      cur.order.push(e.type === 'phase' ? `phase:${String((e.payload as { phase?: unknown }).phase)}` : e.type);
      if (e.type === 'phase') {
        const p = e.payload as { phase?: unknown };
        lastPhase = typeof p.phase === 'string' ? p.phase : null;
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      cur.order.push('sleep');
      if (lastPhase !== null) cur.lit.push(lastPhase);
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      if (lastPhase !== null) cur.lit.push(lastPhase);
      close();
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value, segmentIndex: 0 } };
    },
  };
  await combinatoricsAlgorithm(ctx as never);
  return rounds;
}

const pay = (e: FacetRuntimeEvent): Record<string, unknown> => e.payload as Record<string, unknown>;
function one(r: Round, type: string): Record<string, unknown> {
  const e = r.events.find((x) => x.type === type);
  if (!e) throw new Error(`이벤트 ${type} 가 없다`);
  return pay(e);
}

/** 42 조합 전부를 한 번씩 도는 입력 — n 을 고르고 k 0..6 을 차례로. */
function allCombos(): Input[] {
  const out: Input[] = [];
  for (let n = 1; n <= 6; n += 1) {
    out.push({ type: 'elements', value: n });
    for (let k = 0; k <= 6; k += 1) out.push({ type: 'size', value: k });
  }
  return out;
}

describe('combinatorics', () => {
  it('사다리 = segments[].value · default = 첫 판 · 원소 수 = n 사다리 끝값', () => {
    const d = data();
    expect(d.nLadder).toEqual([1, 2, 3, 4, 5, 6]);
    expect(d.kLadder).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(d.elements.length).toBe(d.nLadder[d.nLadder.length - 1]);
    expect(d.elements.length).toBe(6);
    const controls = (combinatoricsFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const knob = (name: string) =>
      controls.find((c) => c.widget === 'segmented-slider' && c.name === name) as {
        action: string;
        segments: Array<{ value: number; default?: boolean }>;
      };
    expect(knob('elements').segments.map((s) => s.value)).toEqual(d.nLadder);
    expect(knob('size').segments.map((s) => s.value)).toEqual(d.kLadder);
    expect(knob('elements').segments.find((s) => s.default)?.value).toBe(d.n);
    expect(knob('size').segments.find((s) => s.default)?.value).toBe(d.k);
    expect(knob('size').segments.length).toBeLessThanOrEqual(9);
  });

  it('42 조합 모두 IR countSize = 알고리즘의 모으기 수 = 사양 표 · P ÷ k! = 그 수', async () => {
    const rounds = await drive(allCombos());
    const seen = new Set<string>();
    for (const r of rounds) {
      const pk = one(r, 'pick');
      const n = pk.n as number;
      const k = pk.k as number;
      seen.add(`${n},${k}`);
      const ir = runIR(combinatoricsImperativeIR, 'countSize', [n, k, new Array(7).fill(0)]);
      expect(pk.count).toBe(ir);
      expect(ir).toBe(SPEC[n]![k]);
      expect((pk.picked as number[]).length).toBe(pk.count);
      expect((pk.members as string[]).length).toBe(pk.count);
      if (k <= n) {
        expect(pk.within).toBe(true);
        expect((pk.p as number) / (pk.f as number)).toBe(pk.count);
        if (SPEC_P[n]) expect([pk.p, pk.f]).toEqual(SPEC_P[n]![k]);
      } else {
        expect(pk.within).toBe(false);
        expect(pk.p).toBeNull();
        expect(pk.f).toBeNull();
      }
    }
    expect(seen.size).toBe(42);
  });

  it('걸음 j 의 크기별 수 = countSize(j, i) = 점을 날것으로 센 수 = 뺀 쪽 + 넣은 쪽', async () => {
    const rounds = await drive([{ type: 'elements', value: 6 }]);
    for (const r of rounds) {
      for (const e of r.events.filter((x) => x.type === 'split')) {
        const p = pay(e);
        const j = p.j as number;
        const counts = p.counts as number[];
        const keep = p.keep as number[];
        const move = p.move as number[];
        const sizes = p.sizes as number[];
        expect(sizes.length).toBe(2 ** j);
        expect(p.total).toBe(sizes.length);
        expect(p.before).toBe(sizes.length / 2);
        for (let i = 0; i <= j; i += 1) {
          expect(counts[i]).toBe(runIR(combinatoricsImperativeIR, 'countSize', [j, i, new Array(7).fill(0)]));
          expect(counts[i]).toBe(sizes.filter((s) => s === i).length);
          expect(counts[i]).toBe(keep[i]! + move[i]!);
        }
        // 사본은 원본에서 한 열 옆으로
        const before = p.before as number;
        for (let i = before; i < sizes.length; i += 1) expect(sizes[i]).toBe(sizes[i - before]! + 1);
      }
    }
  });

  it('기본값 판 — 걸음 n + 2, 걸음마다 바로 앞이 그 걸음의 phase, init → sleep → 첫 phase', async () => {
    const rounds = await drive([
      { type: 'elements', value: 6 },
      { type: 'size', value: 3 },
      { type: 'elements', value: 2 },
      { type: 'size', value: 5 },
    ]);
    const want: Record<string, string> = { start: 'start', split: 'split', pick: 'pick' };
    for (const r of rounds) {
      const n = one(r, 'round').n as number;
      const steps = r.events.filter((e) => !e.silent);
      expect(steps.length).toBe(n + 2);
      expect(r.order.slice(0, 3)).toEqual(['round', 'sleep', 'phase:start']);
      r.events.forEach((e, i) => {
        if (e.silent) return;
        const prev = r.events[i - 1]!;
        expect(prev.type).toBe('phase');
        expect(pay(prev).phase).toBe(want[e.type]);
      });
      expect(r.lit).toEqual(['start', ...new Array(n).fill('split'), 'pick']);
    }
    // 판 모양이 사양의 예와 같다
    const def = rounds[0]!;
    expect(def.events.filter((e) => e.type === 'split').map((e) => pay(e).element)).toEqual(['a', 'b', 'c', 'd']);
    expect(one(def, 'pick').members).toEqual(['{a, b}', '{a, c}', '{b, c}', '{a, d}', '{b, d}', '{c, d}']);
    expect(one(rounds[2]!, 'pick').count).toBe(20);
    expect(one(rounds[4]!, 'pick')).toMatchObject({ n: 2, k: 5, count: 0, within: false });
  });

  it('회차별 계기 — (4, 2) → (6, 3) → (4, 2) · (4, 5) · (1, 0)', async () => {
    const rounds = await drive([
      { type: 'elements', value: 6 },
      { type: 'size', value: 3 },
      { type: 'elements', value: 4 },
      { type: 'size', value: 2 },
      { type: 'size', value: 5 },
      { type: 'elements', value: 1 },
      { type: 'size', value: 0 },
    ]);
    const want = [
      { subsets: 16, 'size-k-subsets': 6 },
      { subsets: 64, 'size-k-subsets': 15 }, // (6, 2)
      { subsets: 64, 'size-k-subsets': 20 },
      { subsets: 16, 'size-k-subsets': 4 }, // (4, 3)
      { subsets: 16, 'size-k-subsets': 6 },
      { subsets: 16, 'size-k-subsets': 0 },
      { subsets: 2, 'size-k-subsets': 0 }, // (1, 5)
      { subsets: 2, 'size-k-subsets': 1 },
    ];
    expect(rounds.map((r) => r.metrics)).toEqual(want);
  });

  it('사다리 밖의 손잡이 값은 던지고, 남의 입력은 흘린다', async () => {
    await expect(drive([{ type: 'elements', value: 7 }])).rejects.toThrow(/사다리 밖/);
    await expect(drive([{ type: 'size', value: -1 }])).rejects.toThrow(/사다리 밖/);
  });

  it('무대 — 판 머리를 두 번 먹여도 요소 수가 같고, 한 판을 받아 수가 칸에 적힌다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(combinatoricsStageView, container, { config: {}, locale: 'en' }) as unknown as CombinatoricsStage & {
      destroy(): void;
    };
    const svg = container.querySelector('svg')!;
    inst.beginRound(7, 20, 0);
    const n0 = svg.querySelectorAll('*').length;
    inst.beginRound(7, 20, 0);
    expect(svg.querySelectorAll('*').length).toBe(n0);
    inst.start([0], [0], [1], 0);
    inst.split(1, 1, [0, 1], [0, 0], [1, 0], [0, 1], [1, 1], 0);
    inst.split(2, 2, [0, 1, 1, 2], [0, 0, 1, 0], [1, 1, 0], [0, 1, 1], [1, 2, 1], 0);
    expect(svg.querySelectorAll('circle').length).toBe(4);
    inst.pick(2, 1, true, [1, 2], ['{a}', '{b}'], 0);
    expect(container.textContent).toContain('{a}  {b}');
    // 새 판 머리 — 점이 하나로 접히고 결론이 걷힌다. 두 번 먹여도 같다
    inst.beginRound(7, 20, 0);
    expect(svg.querySelectorAll('circle').length).toBe(1);
    expect(container.textContent).not.toContain('{a}');
    expect(svg.querySelectorAll('*').length).toBe(n0);
    inst.destroy();
  });

  it('projector — 되짚기(onReset 뒤 첫 줄부터 재투입)에서 무대가 한 벌씩 늘지 않는다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(combinatoricsStageView, container, { config: {}, locale: 'en' });
    const proj = combinatoricsProjector({ stage } as never);
    const round: FacetRuntimeEvent = { type: 'round', payload: { n: 1, k: 1, columns: 7, colCap: 20, motionMs: 0 }, silent: true };
    const start: FacetRuntimeEvent = { type: 'start', payload: { total: 1, sizes: [0], rows: [0], counts: [1] } };
    const feed = () => {
      proj.onEvent(round);
      proj.onEvent(start);
    };
    proj.onInit?.(combinatoricsFacet.initialData);
    feed();
    const svg = container.querySelector('svg')!;
    const n0 = svg.querySelectorAll('*').length;
    proj.onReset?.();
    proj.onInit?.(combinatoricsFacet.initialData);
    feed();
    expect(svg.querySelectorAll('*').length).toBe(n0);
    expect(container.textContent).toContain('Subsets: 1');
    stage.destroy();
  });
});
