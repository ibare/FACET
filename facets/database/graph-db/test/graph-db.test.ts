// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  graphDbAlgorithm,
  graphDbFacet,
  graphDbImperativeIR,
  graphDbRound,
  graphDbStageView,
  LAYOUT_HELD,
  type GraphDbData,
} from '../src/index.js';

const data = graphDbFacet.initialData as GraphDbData;

/** 사양 실측표 — 홉 → [쥔 이음, 이음 표, 닿은 사람, 닿은 차례, 걸음]. */
const SPEC: Record<number, [number, number, number, string[], number]> = {
  1: [3, 12, 2, ['Ben', 'Cho'], 4],
  2: [7, 24, 4, ['Ben', 'Cho', 'Dan', 'Eva'], 6],
  3: [11, 36, 5, ['Ben', 'Cho', 'Dan', 'Eva', 'Fay'], 8],
};

/** 부르는 쪽이 IR 에 넘길 번호 배열을 짓는다 (IR 은 배열을 만들 수 없다). */
function arrays() {
  const ids = data.nodes.map((n) => n.id);
  const src = data.edges.map((e) => ids.indexOf(e.from));
  const typ = data.edges.map((e) => data.edgeTypes.indexOf(e.type));
  const dst = data.edges.map((e) => ids.indexOf(e.to));
  const first: number[] = [];
  for (let v = 0; v <= ids.length; v += 1) {
    const at = src.findIndex((s) => s >= v);
    first.push(at < 0 ? src.length : at);
  }
  return { ids, src, typ, dst, first };
}

function irRun(hops: number, layout: number): { read: number; reached: number } {
  const { ids, src, typ, dst, first } = arrays();
  const seen = ids.map(() => 0);
  const cur = ids.map(() => 0);
  const nxt = ids.map(() => 0);
  const read = runIR(graphDbImperativeIR, 'expand', [
    hops,
    layout === LAYOUT_HELD ? 1 : 0,
    ids.indexOf(data.start),
    data.edgeTypes.indexOf(data.follow),
    src,
    typ,
    dst,
    first,
    seen,
    cur,
    nxt,
  ]);
  return { read: read as number, reached: seen.reduce((a, b) => a + b, 0) - 1 };
}

/** 알고리즘을 입력 목록대로 돌려 판마다 끝 계기 값과 걸음 수를 모은다. */
async function play(inputs: { type: string; value: number }[]) {
  const metrics = new Map<string, number>();
  const rounds: { edges: number; people: number; steps: number }[] = [];
  let steps = 0;
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      if (e.type === 'round-start') steps = 0;
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      steps += 1;
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      rounds.push({ edges: metrics.get('edges-read')!, people: metrics.get('people-reached')!, steps: steps + 1 });
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'none' };
      }
      return { type: next.type, payload: { value: next.value } };
    },
  };
  await graphDbAlgorithm(ctx as never);
  return rounds;
}

describe('graph-db', () => {
  it('사다리가 손잡이 구간과 같다', () => {
    const controls = (graphDbFacet.blocks['controls'] as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const seg = (a: string) => controls.find((c) => c.action === a)!.segments!;
    expect(seg('hops').map((s) => s.value)).toEqual(data.hopsLadder);
    expect(seg('layout').map((s) => s.value)).toEqual(data.layoutLadder);
    expect(seg('hops').find((s) => s.default)!.value).toBe(data.firstHops);
    expect(seg('layout').find((s) => s.default)!.value).toBe(data.firstLayout);
    expect(data.hopsLadder).toEqual([1, 2, 3]);
    expect(data.nodes).toHaveLength(9);
    expect(data.edges).toHaveLength(12);
  });

  it('IR 배열이 사양이 적은 번호 배열과 같다', () => {
    const { src, typ, dst, first } = arrays();
    expect(src).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
    expect(typ).toEqual([0, 0, 1, 0, 1, 0, 1, 0, 1, 1, 0, 1]);
    expect(dst).toEqual([1, 2, 8, 3, 6, 4, 7, 5, 8, 6, 0, 7]);
    expect(first).toEqual([0, 3, 5, 7, 9, 11, 12, 12, 12, 12]);
  });

  it('모든 손잡이 조합에서 IR · 알고리즘 · 사양 표가 같다', () => {
    for (const hops of data.hopsLadder) {
      for (const layout of data.layoutLadder) {
        const round = graphDbRound(data, hops, layout);
        const ir = irRun(hops, layout);
        const [held, table, people, order] = SPEC[hops]!;
        expect(round.readTotal).toBe(layout === LAYOUT_HELD ? held : table);
        expect(ir.read).toBe(round.readTotal);
        expect(ir.reached).toBe(round.reachedCount);
        expect(round.reachedCount).toBe(people);
        expect(round.friends).toEqual(order);
      }
    }
  });

  it('겹침은 홉 3 의 Eva → Ana 하나에서만 걸린다', () => {
    const round = graphDbRound(data, 3, LAYOUT_HELD);
    const skipped = round.steps.flatMap((s) =>
      s.used.filter((i) => data.edges[i]!.type === data.follow && !s.crossed.includes(i)).map((i) => [s.hop, i]),
    );
    expect(skipped).toEqual([[3, 10]]);
  });

  it('회차별 계기 — 2·쥔 → 2·표 → 2·쥔 과 걸음 수', async () => {
    const rounds = await play([
      { type: 'layout', value: 1 },
      { type: 'layout', value: 0 },
      { type: 'hops', value: 1 },
      { type: 'hops', value: 3 },
    ]);
    expect(rounds.map((r) => r.edges)).toEqual([7, 24, 7, 3, 11]);
    expect(rounds.map((r) => r.people)).toEqual([4, 4, 4, 2, 5]);
    expect(rounds.map((r) => r.steps)).toEqual([6, 6, 6, 4, 8]);
  });

  it('사다리 밖의 손잡이 값은 던진다', async () => {
    await expect(play([{ type: 'hops', value: 4 }])).rejects.toThrow();
  });

  it('무대가 initialData 없이도 마운트된다', () => {
    const container = document.createElement('div');
    const inst = mountView(graphDbStageView, container, { config: {} });
    expect(container.querySelector('svg')).not.toBeNull();
    inst.destroy();
  });
});
