// @vitest-environment happy-dom
/**
 * join-kinds 고유의 주장 — IR 과 algorithm 이 다섯 종류 모두에서 같은 결과 줄을 내고, 사양 실측표와 같다.
 * 회차별 계기(INNER → LEFT → CROSS → FULL → INNER)와 사다리, 무대가 payload 만으로 그려지는지도 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  computeJoin,
  joinKindsAlgorithm,
  joinKindsFacet,
  joinKindsImperativeIR,
  joinKindsStageView,
  kindOf,
  rankOf,
  shownAt,
  type JoinKindsData,
  type JoinKindsStage,
} from '../src/index.js';

const data = joinKindsFacet.initialData as unknown as JoinKindsData;
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** 사양 실측표 (sim.py join-kinds) — 대조용. */
const SPEC: Record<number, { rows: number; nulls: number; compares: number; result: string }> = {
  0: { rows: 4, nulls: 0, compares: 18, result: 'Ivy-Foxes · Jay-Owls · Kai-Foxes · Mo-Owls' },
  1: { rows: 6, nulls: 2, compares: 18, result: 'Ivy-Foxes · Jay-Owls · Kai-Foxes · Lee-NULL · Mo-Owls · Ned-NULL' },
  2: { rows: 5, nulls: 1, compares: 18, result: 'Ivy-Foxes · Jay-Owls · Kai-Foxes · Mo-Owls · NULL-Bees' },
  3: { rows: 7, nulls: 3, compares: 18, result: 'Ivy-Foxes · Jay-Owls · Kai-Foxes · Lee-NULL · Mo-Owls · Ned-NULL · NULL-Bees' },
  4: {
    rows: 18,
    nulls: 0,
    compares: 0,
    result:
      'Ivy-Owls · Ivy-Foxes · Ivy-Bees · Jay-Owls · Jay-Foxes · Jay-Bees · Kai-Owls · Kai-Foxes · Kai-Bees · ' +
      'Lee-Owls · Lee-Foxes · Lee-Bees · Mo-Owls · Mo-Foxes · Mo-Bees · Ned-Owls · Ned-Foxes · Ned-Bees',
  },
};

const nL = data.left.rows.length;
const nR = data.right.rows.length;
const LADDER = data.kinds.map((k) => k.value);

function irJoin(kind: number) {
  const leftKey = data.left.rows.map((r) => r[2] as number);
  const rightKey = data.right.rows.map((r) => r[0] as number);
  const size = nL * nR + nL + nR;
  const rightHit = new Array<number>(nR).fill(0);
  const outL = new Array<number>(size).fill(0);
  const outR = new Array<number>(size).fill(0);
  const stats = [0];
  const m = runIR(joinKindsImperativeIR, 'joinRows', [kind, leftKey, nL, rightKey, nR, rightHit, outL, outR, stats]);
  if (typeof m !== 'number') throw new Error('joinRows 가 수를 돌려주지 않았다');
  const rows = Array.from({ length: m }, (_, k) => ({ l: outL[k] as number, r: outR[k] as number }));
  return { rows, compares: stats[0] as number };
}

function label(rows: { l: number; r: number }[]): string {
  return rows
    .map((p) => {
      const a = p.l < 0 ? data.nullText : String(data.left.rows[p.l]?.[1]);
      const b = p.r < 0 ? data.nullText : String(data.right.rows[p.r]?.[1]);
      return `${a}-${b}`;
    })
    .join(' · ');
}

describe('join-kinds — 셈', () => {
  it('사다리가 segments 와 같고, 데이터 크기가 사양대로다', () => {
    const controls = (joinKindsFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const knob = controls.find((c) => c.widget === 'segmented-slider');
    const segs = (knob?.segments as Array<{ value: number }>).map((s) => s.value);
    expect(segs).toEqual(LADDER);
    expect(LADDER).toEqual([0, 1, 2, 3, 4]);
    expect(nL).toBe(6);
    expect(nR).toBe(3);
    expect(nL * nR + nL + nR).toBe(27);
  });

  it.each(LADDER)('종류 %i — IR 과 algorithm 이 같은 줄 · 같은 차례 · 같은 견줌이고 사양 표와 같다', (value) => {
    const kind = kindOf(data, value);
    const alg = computeJoin(data, kind);
    const ir = irJoin(value);
    expect(alg.rows).toEqual(ir.rows);
    expect(alg.compares).toBe(ir.compares);
    const spec = SPEC[value];
    if (!spec) throw new Error('사양 표에 없는 종류');
    expect(alg.rows.length).toBe(spec.rows);
    expect(alg.rows.filter((p) => p.l < 0 || p.r < 0).length).toBe(spec.nulls);
    expect(alg.compares).toBe(spec.compares);
    expect(label(alg.rows)).toBe(spec.result);
    // 자리 규약으로 늘어놓아도 같은 차례다 (무대의 줄 차례 = IR 차례)
    const sorted = [...alg.rows].sort((a, b) => rankOf(a, nL, nR) - rankOf(b, nL, nR));
    expect(sorted).toEqual(ir.rows);
    // 마지막 걸음에 보이는 줄 = 결과 전부 (앞 판에서 든 줄이 남지 않는다)
    const last = shownAt(data, kind, kindOf(data, 4), computeJoin(data, kindOf(data, 4)).rows, alg, kind.cross ? 1 : 3);
    expect(last.map((r) => ({ l: r.l, r: r.r }))).toEqual(ir.rows);
    expect(last.every((r) => !r.held)).toBe(true);
  });
});

type Input = { type: string; payload: Record<string, unknown> };

/** 알고리즘을 가짜 reactive ctx 로 돌려 판마다 계기의 끝 값을 모은다. */
async function playRounds(seq: number[]) {
  const inputs: Input[] = seq.slice(1).map((v) => ({ type: 'kind', payload: { value: v, segmentIndex: v, kind: String(v) } }));
  const metrics = new Map<string, number>();
  const rounds: Array<Record<string, number>> = [];
  const events: FacetRuntimeEvent[] = [];
  let cancelled = false;
  const snapshot = () => ({
    'result-rows': metrics.get('result-rows') ?? Number.NaN,
    'null-rows': metrics.get('null-rows') ?? Number.NaN,
    'key-compares': metrics.get('key-compares') ?? Number.NaN,
  });
  const ctx = {
    data: { ...clone(data), kind: seq[0] ?? Number.NaN },
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return true;
    },
    async waitForInput() {
      rounds.push(snapshot());
      const next = inputs.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await joinKindsAlgorithm(ctx as never);
  return { rounds, events };
}

describe('join-kinds — 회차별 계기', () => {
  it('INNER → LEFT → CROSS → FULL → RIGHT → INNER, 판마다 사양 표와 같다', async () => {
    const seq = [0, 1, 4, 3, 2, 0];
    const { rounds, events } = await playRounds(seq);
    expect(rounds.length).toBe(seq.length);
    seq.forEach((v, i) => {
      const spec = SPEC[v];
      if (!spec) throw new Error('사양 표에 없는 종류');
      expect(rounds[i]).toEqual({ 'result-rows': spec.rows, 'null-rows': spec.nulls, 'key-compares': spec.compares });
    });
    // 걸음 수 — INNER..FULL 넷, CROSS 둘 (round · pairs · left-side · right-side)
    const steps = events.filter((e) => e.type !== 'phase').map((e) => e.type);
    expect(steps).toEqual([
      ...['round', 'pairs', 'left-side', 'right-side'],
      ...['round', 'pairs', 'left-side', 'right-side'],
      ...['round', 'pairs'],
      ...['round', 'pairs', 'left-side', 'right-side'],
      ...['round', 'pairs', 'left-side', 'right-side'],
      ...['round', 'pairs', 'left-side', 'right-side'],
    ]);
  });

  it('LEFT 뒤 INNER — 짝 맞은 넷은 걸음 1 에서 제자리에 남고, Lee · Ned 는 걸음 2 에서 떨어진다', async () => {
    const { events } = await playRounds([1, 0]);
    const second = events.filter((e) => e.type !== 'phase').slice(4);
    const rowsOf = (e: FacetRuntimeEvent | undefined) =>
      ((e?.payload as { rows: Array<{ leftText: string; rightText: string; held: boolean }> }).rows ?? []).map(
        (r) => `${r.leftText}-${r.rightText}${r.held ? '?' : ''}`,
      );
    expect(rowsOf(second[0])).toEqual(['Ivy-Foxes?', 'Jay-Owls?', 'Kai-Foxes?', 'Lee-NULL?', 'Mo-Owls?', 'Ned-NULL?']);
    expect(rowsOf(second[1])).toEqual(['Ivy-Foxes', 'Jay-Owls', 'Kai-Foxes', 'Lee-NULL?', 'Mo-Owls', 'Ned-NULL?']);
    expect(rowsOf(second[2])).toEqual(['Ivy-Foxes', 'Jay-Owls', 'Kai-Foxes', 'Mo-Owls']);
  });
});

describe('join-kinds — 칸 고정', () => {
  it('짝 맞은 넷은 INNER · LEFT · RIGHT · FULL 에서 같은 칸, 짝 없는 줄은 제 칸 (FULL 7 칸)', () => {
    const slotsOf = (v: number) => {
      const kind = kindOf(data, v);
      return Object.fromEntries(
        shownAt(data, kind, null, [], computeJoin(data, kind), 3).map((r) => [`${r.leftText}-${r.rightText}`, r.slot]),
      );
    };
    const full = { 'Ivy-Foxes': 0, 'Jay-Owls': 1, 'Kai-Foxes': 2, 'Lee-NULL': 3, 'Mo-Owls': 4, 'Ned-NULL': 5, 'NULL-Bees': 6 };
    expect(slotsOf(3)).toEqual(full);
    expect(slotsOf(0)).toEqual({ 'Ivy-Foxes': 0, 'Jay-Owls': 1, 'Kai-Foxes': 2, 'Mo-Owls': 4 });
    expect(slotsOf(1)).toEqual({ 'Ivy-Foxes': 0, 'Jay-Owls': 1, 'Kai-Foxes': 2, 'Lee-NULL': 3, 'Mo-Owls': 4, 'Ned-NULL': 5 });
    expect(slotsOf(2)).toEqual({ 'Ivy-Foxes': 0, 'Jay-Owls': 1, 'Kai-Foxes': 2, 'Mo-Owls': 4, 'NULL-Bees': 6 });
  });
});

describe('join-kinds — 무대', () => {
  it('mountView 로 올려 CROSS 18 줄을 즉시 그린다', () => {
    const container = document.createElement('div');
    const inst = mountView(joinKindsStageView, container, { config: {}, isInstant: () => true });
    const stage = inst as unknown as JoinKindsStage;
    stage.init({
      sqlHead: data.sqlHead,
      left: { title: 'player p', cols: data.left.cols, rows: data.left.rows.map((r) => r.map(String)), source: 1 },
      right: { title: 'team t', cols: data.right.cols, rows: data.right.rows.map((r) => r.map(String)), source: 1 },
      resultCols: ['p.name', 't.tname'],
    });
    const cross = kindOf(data, 4);
    const rows = shownAt(data, cross, null, [], computeJoin(data, cross), 1);
    void stage.setRows(rows, 0);
    const texts = [...container.querySelectorAll('text')].map((n) => n.textContent);
    expect(texts.filter((s) => s === 'Ned').length).toBe(1 + 3);
    inst.destroy();
  });
});
