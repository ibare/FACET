// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  dependencyGraphAlgorithm,
  dependencyGraphFacet,
  dependencyGraphImperativeIR,
  dependencyGraphProjector,
  dependencyGraphStageView,
  longestChain,
  needIndices,
  planSchedule,
  targetsWith,
  type DependencyGraphData,
  type DependencyGraphTarget,
} from '../src/index.js';

const data = dependencyGraphFacet.initialData as DependencyGraphData;

// 사양 실측표 (measure.py) — codegen.o 초 | 일꾼 | 끝 시각 | 동시 최대 | 일의 합 | 가장 긴 사슬 | 걸음(0 포함)
const TABLE: [number, number, number, number, number, number, number][] = [
  [6, 1, 18, 1, 18, 8, 8],
  [6, 2, 12, 2, 18, 8, 8],
  [6, 3, 10, 3, 18, 8, 8],
  [6, 4, 8, 4, 18, 8, 8],
  [6, 6, 8, 4, 18, 8, 8],
  [3, 1, 15, 1, 15, 7, 8],
  [3, 2, 9, 2, 15, 7, 8],
  [3, 3, 7, 3, 15, 7, 7],
  [3, 4, 7, 4, 15, 7, 7],
  [3, 6, 7, 4, 15, 7, 7],
];


function irRun(targets: DependencyGraphTarget[], workers: number): { finish: number; startAt: number[] } {
  const n = targets.length;
  const needs = new Array<number>(n * n).fill(0);
  needIndices(targets).forEach((js, i) => {
    for (const j of js) needs[i * n + j] = 1;
  });
  const state = new Array<number>(n).fill(0);
  const startAt = new Array<number>(n).fill(0);
  const endAt = new Array<number>(n).fill(0);
  const out = runIR(dependencyGraphImperativeIR, 'schedule', [n, targets.map((tg) => tg.seconds), needs, workers, state, startAt, endAt]);
  if (typeof out !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return { finish: out, startAt };
}

function permutations(): number[][] {
  // 데이터 차례를 섞는다 — 항등 · 뒤집기 · 고정 순열 셋 (measure.py 의 parser.o 먼저 순열 포함)
  const ids = data.targets.map((tg) => tg.id);
  const order = (names: string[]): number[] => names.map((x) => ids.indexOf(x));
  return [
    [0, 1, 2, 3, 4, 5],
    [5, 4, 3, 2, 1, 0],
    order(['parser.o', 'codegen.o', 'compiler', 'lexer.o', 'ast.o', 'libfront.a']),
    order(['ast.o', 'codegen.o', 'libfront.a', 'compiler', 'lexer.o', 'parser.o']),
    order(['lexer.o', 'compiler', 'libfront.a', 'codegen.o', 'ast.o', 'parser.o']),
  ];
}

describe('dependency-graph — 사양 표', () => {
  it('사다리가 segments 와 같고 대상은 여섯', () => {
    const controls = (dependencyGraphFacet.blocks.controls as { controls: { action?: string; segments?: { value: number }[] }[] }).controls;
    const seg = (action: string): number[] => {
      const c = controls.find((x) => x.action === action);
      if (!c?.segments) throw new Error(`${action} 손잡이가 없다`);
      return c.segments.map((s) => s.value);
    };
    expect(seg('workers')).toEqual(data.workerLadder);
    expect(seg('codegen-seconds')).toEqual(data.secondsLadder);
    expect(data.workerLadder).toEqual([1, 2, 3, 4, 6]);
    expect(data.secondsLadder).toEqual([6, 3]);
    expect(data.targets).toHaveLength(6);
  });

  it.each(TABLE)('codegen.o %i · 일꾼 %i → 끝 %i · 동시 %i · 합 %i · 사슬 %i · 걸음 %i', (s, w, finish, busy, sum, chain, steps) => {
    const targets = targetsWith(data, s);
    const sch = planSchedule(targets, w);
    expect(sch.finishTime).toBe(finish);
    expect(sch.busyMax).toBe(busy);
    expect(targets.reduce((a, tg) => a + tg.seconds, 0)).toBe(sum);
    expect(longestChain(targets).seconds).toBe(chain);
    expect(sch.ticks.length + 2).toBe(steps);
  });

  it('가장 긴 사슬의 길', () => {
    expect(longestChain(targetsWith(data, 6)).path.map((x) => x.id)).toEqual(['codegen.o', 'compiler']);
    expect(longestChain(targetsWith(data, 3)).path.map((x) => x.id)).toEqual(['parser.o', 'libfront.a', 'compiler']);
  });

  it('기본값 한 판의 걸음 (일꾼 2 · codegen.o 6)', () => {
    const sch = planSchedule(targetsWith(data, 6), 2);
    expect(
      sch.ticks.map((k) => [k.t, k.finished.join(','), k.started.map((s) => `${s.id}@${s.lane + 1}:${s.start}..${s.end}`).join(','), k.running]),
    ).toEqual([
      [0, '', 'lexer.o@1:0..3,parser.o@2:0..4', 2],
      [3, 'lexer.o', 'ast.o@1:3..5', 2],
      [4, 'parser.o', 'codegen.o@2:4..10', 2],
      [5, 'ast.o', 'libfront.a@1:5..6', 2],
      [6, 'libfront.a', '', 1],
      [10, 'codegen.o', 'compiler@1:10..12', 1],
    ]);
    expect(sch.lastFinished).toEqual(['compiler']);
  });

  it('동률(준비 > 빈 일꾼)이 걸리는 시각', () => {
    const waitsAt = (w: number): number[] => planSchedule(targetsWith(data, 6), w).ticks.filter((k) => k.waiting.length > 0).map((k) => k.t);
    expect(waitsAt(1)).toEqual([0, 3, 7, 9]);
    expect(waitsAt(2)).toEqual([0, 3]);
    expect(waitsAt(3)).toEqual([0]);
    expect(waitsAt(4)).toEqual([]);
    expect(waitsAt(6)).toEqual([]);
  });

  it('모르는 입력 · 고리는 던진다, IR 은 고리에 −1', () => {
    expect(() => planSchedule([{ id: 'a', needs: ['zz'], seconds: 1 }], 1)).toThrow();
    const loop = [
      { id: 'a', needs: ['b'], seconds: 1 },
      { id: 'b', needs: ['a'], seconds: 1 },
    ];
    expect(() => planSchedule(loop, 2)).toThrow();
    expect(() => longestChain(loop)).toThrow();
    expect(irRun(loop, 2).finish).toBe(-1);
  });
});

describe('dependency-graph — IR ↔ algorithm', () => {
  it('모든 손잡이 조합 × 데이터 차례 다섯에서 끝 시각과 시작 시각이 같다', () => {
    let rounds = 0;
    const finishes = new Set<number>();
    for (const perm of permutations()) {
      for (const s of data.secondsLadder) {
        const base = targetsWith(data, s);
        const targets = perm.map((i) => base[i]!);
        for (const w of data.workerLadder) {
          const sch = planSchedule(targets, w);
          const ir = irRun(targets, w);
          expect(ir.finish).toBe(sch.finishTime);
          expect(ir.startAt).toEqual(sch.startAt);
          finishes.add(sch.finishTime);
          rounds += 1;
        }
      }
    }
    expect(rounds).toBe(50);
    // 차례를 섞으면 동률 깨기가 바뀐다 — parser.o 먼저 · 일꾼 2 는 11
    const base = targetsWith(data, 6);
    const p = permutations()[2]!.map((i) => base[i]!);
    expect(planSchedule(p, 2).finishTime).toBe(11);
    expect(finishes.has(11)).toBe(true);
  });
});

type Input = { type: string; payload: { value: number } };

async function drive(inputs: Input[]): Promise<{ metrics: Record<string, number>[]; events: FacetRuntimeEvent[][] }> {
  const totals: Record<string, number> = {};
  const metrics: Record<string, number>[] = [];
  const events: FacetRuntimeEvent[][] = [[]];
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const waiting = new Promise<void>((r) => (idle = r));
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async emit(e: FacetRuntimeEvent) {
      events[events.length - 1]!.push(e);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      metrics.push({ ...totals });
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      events.push([]);
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([dependencyGraphAlgorithm(ctx as never), waiting]);
  cancelled = true;
  return { metrics, events };
}

const pick = (m: Record<string, number>): [number, number, number] => [m['finish-time']!, m['busy-max']!, m['work-sum']!];

describe('dependency-graph — 회차별 계기', () => {
  it('일꾼 2 → 4 → 2 (codegen.o 6)', async () => {
    const { metrics } = await drive([
      { type: 'workers', payload: { value: 4 } },
      { type: 'workers', payload: { value: 2 } },
    ]);
    expect(metrics.map(pick)).toEqual([
      [12, 2, 18],
      [8, 4, 18],
      [12, 2, 18],
    ]);
  });

  it('codegen.o 6 → 3 (일꾼 2) · 일꾼 6 → 3 까지', async () => {
    const { metrics, events } = await drive([
      { type: 'codegen-seconds', payload: { value: 3 } },
      { type: 'workers', payload: { value: 6 } },
      { type: 'workers', payload: { value: 3 } },
    ]);
    expect(metrics.map(pick)).toEqual([
      [12, 2, 18],
      [9, 2, 15],
      [7, 4, 15],
      [7, 3, 15],
    ]);
    // 기본값 한 판: 걸음 = round + tick 여섯 + stop = 8, phase 셋이 다 온다
    const first = events[0]!;
    expect(first.filter((e) => e.type !== 'phase').map((e) => e.type)).toEqual(['round', 'tick', 'tick', 'tick', 'tick', 'tick', 'tick', 'stop']);
    const phases = new Set(first.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase));
    expect([...phases].sort()).toEqual(['done', 'finish', 'start']);
  });
});

describe('dependency-graph — stage', () => {
  it('한 판을 그리고 캡션의 수가 payload 의 수다', async () => {
    const { events } = await drive([{ type: 'workers', payload: { value: 4 } }]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(dependencyGraphStageView, container, { config: {}, locale: 'en' });
    const lit: (string | null)[] = [];
    const proj = dependencyGraphProjector(
      { stage, codePanel: { destroy() {}, highlightPhase: (p: string | null) => lit.push(p) } },
      { getSpeed: () => 1000, t: (_k, fb, vars) => fb.replace(/\{(\w+)\}/g, (_, k: string) => String(vars?.[k])) },
    );
    const caption = (): string => container.querySelector('svg text')?.textContent ?? '';
    for (const e of events[0]!) await proj.onEvent(e);
    expect(caption()).toBe('Finish at 12 s — 4 s above the longest chain, 8 s');
    for (const e of events[1]!) await proj.onEvent(e);
    expect(caption()).toBe('Finish at 8 s — equal to the longest chain, 8 s');
    expect(lit[lit.length - 1]).toBe('done');
    stage.destroy();
  });
});
