// @vitest-environment happy-dom
/**
 * 수거 두 방식 — facet 고유의 주장.
 *
 *   1. IR(`garbageLeft` · `countRefFreed` · `countTraced`) 의 답이 여덟 조합 모두에서 알고리즘의 판 끝 계기와 같다
 *   2. 판 끝 계기 · 걸음 수 · 두 쪽의 남은 객체가 사양의 실측표와 같다
 *   3. 손잡이를 A → B → A 로 돌려도 판마다 계기가 사양 표 값이다 (쌓이지 않는다)
 *   4. 사다리 = segments[].value, 버퍼 길이 · 사다리 끝값을 단언한다
 *   5. 무대의 쓰레기 표지 수 = garbage-left (mountView 로 띄운다)
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  tracingVsRefcountAlgorithm,
  tracingVsRefcountFacet,
  tracingVsRefcountImperativeIR,
  tracingVsRefcountInputs,
  tracingVsRefcountStageView,
  type TracingVsRefcountData,
  type TracingVsRefcountStage,
} from '../src/index.js';

const data = tracingVsRefcountFacet.initialData as unknown as TracingVsRefcountData;

type Row = { cycle: number; drop: number; tracing: number; refcount: number; garbage: number; steps: number; traceLeft: string; rcLeft: string };
// 사양 실측표 (sim.py 출력)
const TABLE: Row[] = [
  { cycle: 0, drop: 0, tracing: 0, refcount: 0, garbage: 0, steps: 13, traceLeft: 'ABCDEF', rcLeft: 'ABCDEF' },
  { cycle: 0, drop: 1, tracing: 3, refcount: 3, garbage: 0, steps: 14, traceLeft: 'DEF', rcLeft: 'DEF' },
  { cycle: 0, drop: 2, tracing: 3, refcount: 3, garbage: 0, steps: 14, traceLeft: 'ABC', rcLeft: 'ABC' },
  { cycle: 0, drop: 3, tracing: 6, refcount: 6, garbage: 0, steps: 15, traceLeft: '', rcLeft: '' },
  { cycle: 1, drop: 0, tracing: 0, refcount: 0, garbage: 0, steps: 13, traceLeft: 'ABCDEF', rcLeft: 'ABCDEF' },
  { cycle: 1, drop: 1, tracing: 3, refcount: 0, garbage: 3, steps: 11, traceLeft: 'DEF', rcLeft: 'ABCDEF' },
  { cycle: 1, drop: 2, tracing: 3, refcount: 1, garbage: 2, steps: 12, traceLeft: 'ABC', rcLeft: 'ABCEF' },
  { cycle: 1, drop: 3, tracing: 6, refcount: 1, garbage: 5, steps: 10, traceLeft: '', rcLeft: 'ABCEF' },
];

type Round = { metrics: Record<string, number>; steps: number; events: FacetRuntimeEvent[] };

/** 알고리즘을 판 여럿 돌린다 — 첫 판은 (drop, cycle), 그 뒤 inputs 를 하나씩 넣는다. 입력이 떨어지면 취소한다. */
async function play(drop: number, cycle: number, inputs: { type: string; value: number }[] = []): Promise<Round[]> {
  const rounds: Round[] = [];
  const metrics: Record<string, number> = {};
  let cur: Round = { metrics: {}, steps: 1, events: [] };
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data: { ...data, drop, cycle },
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      cur.events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      cur.steps += 1;
      return true;
    },
    async waitForInput() {
      rounds.push({ ...cur, metrics: { ...metrics } });
      cur = { metrics: {}, steps: 1, events: [] };
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await tracingVsRefcountAlgorithm(ctx as never);
  return rounds;
}

function irAnswers(drop: number, cycle: number) {
  const { adj, n, roots, kept } = tracingVsRefcountInputs(data, drop, cycle);
  const buf = (len: number) => new Array<number>(len).fill(0);
  const left = runIR(tracingVsRefcountImperativeIR, 'garbageLeft', [adj, n, roots, kept, buf(n), buf(n), buf(n), buf(n * n + roots.length)]);
  const byCount = runIR(tracingVsRefcountImperativeIR, 'countRefFreed', [adj, n, roots, kept, buf(n), buf(n)]);
  const marks = buf(n);
  const byTrace = runIR(tracingVsRefcountImperativeIR, 'countTraced', [adj, n, roots, kept, marks, buf(n * n + roots.length)]);
  return { left, byCount, byTrace, marks };
}

describe('tracing-vs-refcount', () => {
  it('사다리가 segments[].value 와 같고, 첫 판 값이 default 와 같다', () => {
    const controls = (tracingVsRefcountFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const seg = (action: string) => controls.find((c) => c.action === action)?.segments ?? [];
    expect(seg('drop').map((s) => s.value)).toEqual(data.dropLadder);
    expect(seg('cycle').map((s) => s.value)).toEqual(data.cycleLadder);
    expect(seg('drop').find((s) => s.default)?.value).toBe(data.drop);
    expect(seg('cycle').find((s) => s.default)?.value).toBe(data.cycle);
    expect(data.dropLadder.at(-1)).toBe(2 ** data.roots.length - 1);
    expect(data.cycleLadder.at(-1)).toBe(1);
  });

  it('IR 인자 모양 — adj 36 · pending 38 · 뿌리 [0, 3]', () => {
    const { adj, n, roots, kept } = tracingVsRefcountInputs(data, 3, 1);
    expect(n).toBe(6);
    expect(adj.length).toBe(36);
    expect(n * n + roots.length).toBe(38);
    expect(roots).toEqual([0, 3]);
    expect(kept).toEqual([0, 0]);
    expect(tracingVsRefcountInputs(data, 0, 0).kept).toEqual([1, 1]);
    expect(tracingVsRefcountInputs(data, 1, 0).kept).toEqual([0, 1]);
    expect(tracingVsRefcountInputs(data, 2, 0).kept).toEqual([1, 0]);
  });

  for (const row of TABLE) {
    it(`고리 ${row.cycle} · 놓는 이름 ${row.drop} — 실측표 · IR 과 같다`, async () => {
      const [round] = await play(row.drop, row.cycle);
      expect(round).toBeDefined();
      const m = round!.metrics;
      expect(m).toEqual({ 'tracing-freed': row.tracing, 'refcount-freed': row.refcount, 'garbage-left': row.garbage });
      expect(round!.steps).toBe(row.steps);

      // 두 쪽에 남은 객체 — 이벤트에서 센다
      const rcGone = new Set<string>();
      const trGone = new Set<string>();
      for (const e of round!.events) {
        const p = e.payload as { object?: string; freed?: boolean };
        if (e.type === 'rc-freed' && p.object) rcGone.add(p.object);
        if (e.type === 'swept' && p.freed && p.object) trGone.add(p.object);
      }
      expect(data.objects.filter((o) => !trGone.has(o)).join('')).toBe(row.traceLeft);
      expect(data.objects.filter((o) => !rcGone.has(o)).join('')).toBe(row.rcLeft);

      const ir = irAnswers(row.drop, row.cycle);
      expect(ir.left).toBe(m['garbage-left']);
      expect(ir.byCount).toBe(m['refcount-freed']);
      expect(ir.byTrace).toBe(m['tracing-freed']);
      expect(data.objects.filter((_, i) => ir.marks[i] === 1).join('')).toBe(row.traceLeft);
    });
  }

  it('손잡이 A → B → A — 판마다 사양 값 (쌓이지 않는다)', async () => {
    const rounds = await play(3, 1, [
      { type: 'cycle', value: 0 },
      { type: 'cycle', value: 1 },
      { type: 'drop', value: 2 },
    ]);
    const vals = rounds.map((r) => [r.metrics['tracing-freed'], r.metrics['refcount-freed'], r.metrics['garbage-left']]);
    expect(vals).toEqual([
      [6, 1, 5],
      [6, 6, 0],
      [6, 1, 5],
      [3, 1, 2],
    ]);
  });

  it('사다리 밖의 값은 던진다', async () => {
    await expect(play(3, 1, [{ type: 'drop', value: 7 }])).rejects.toThrow(/사다리/);
  });

  it('기본 판의 걸음 차례가 사양과 같다', async () => {
    const [round] = await play(3, 1);
    const seq = round!.events
      .filter((e) => e.type !== 'phase')
      .map((e) => {
        const p = e.payload as { object?: string; root?: string; freed?: boolean };
        if (e.type === 'round-start') return 'start';
        if (e.type === 'root-dropped') return `drop ${p.root}`;
        if (e.type === 'rc-freed') return `rc ${p.object}`;
        if (e.type === 'marked') return `mark ${p.object}`;
        return `${p.freed ? 'free' : 'keep'} ${p.object}`;
      });
    expect(seq).toEqual(['start', 'drop x', 'drop y', 'rc D', 'free A', 'free B', 'free C', 'free D', 'free E', 'free F']);
  });

  it('무대 — 쓰레기 표지 수가 garbage-left 와 같다', async () => {
    for (const row of TABLE) {
      const container = document.createElement('div');
      const stage = mountView(tracingVsRefcountStageView, container, { config: {}, initialData: data }) as TracingVsRefcountStage;
      const [round] = await play(row.drop, row.cycle);
      for (const e of round!.events) {
        const p = e.payload as Record<string, never>;
        if (e.type === 'round-start') stage.startRound(p.cycle, p.counts, 0);
        if (e.type === 'root-dropped') stage.dropRoot(p.root, p.object, p.count, 0);
        if (e.type === 'rc-freed') stage.refcountFree(p.object, p.lowered, 0);
        if (e.type === 'marked') stage.mark(p.object, p.root, p.via, 0);
        if (e.type === 'swept') stage.sweep(p.object, p.freed, p.leftover, 0);
      }
      const tags = [...container.querySelectorAll('g[visibility="visible"]')].length;
      expect(tags).toBe(row.garbage);
      stage.destroy();
    }
  });
});
