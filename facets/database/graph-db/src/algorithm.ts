/**
 * graph-db — 이음을 노드가 쥐느냐, 표 한 장에 두느냐에 따라 "k 홉 안의 친구" 를 찾을 때 읽는 이음 수가 갈린다.
 *
 * 손잡이 (reactive — 한 판을 끝까지 재생 → waitForInput → 받은 값으로 다시 재생):
 *   hops    홉 수. 값은 initialData.hopsLadder 안의 수
 *   layout  담는 법. 0 = 노드가 쥔 이음 · 1 = 이음 표 한 장. 값은 initialData.layoutLadder 안의 수
 *
 * 규약 (사양 그대로 — 하나라도 바꾸면 다른 수가 나온다):
 *   - 나가는 이음만 따른다. 홉 단위로 간다: 한 홉 = 앞 줄 노드 전부를 한꺼번에 펼친다
 *   - 쥔 이음: 앞 줄 노드가 쥔 나가는 이음 전부를 읽는다
 *   - 이음 표: 표의 줄을 전부 읽고, 나가는 노드가 앞 줄에 있는 줄만 쓴다 (표에 색인이 없다고 친다)
 *   - 읽은 이음 가운데 종류가 follow 이고 끝 노드가 아직 닿지 않았으면 건넌다 → 다음 앞 줄
 *   - 닿은 사람 = 출발을 뺀 닿은 노드 수. 앞 줄 · 답의 차례 = 닿은 차례
 *   - 겹침: 이미 닿은 노드로 가는 이음은 건너지 않는다 (이 자료에서는 홉 3 의 Eva → Ana 하나)
 *   - ring: 노드마다 follow 이음만으로 출발에서 몇 홉인지 (홉 한계 없이). 닿지 않는 노드는 -1.
 *     무대의 자리 잡기에만 쓴다 — 셈의 답이 아니다
 *
 * 이벤트 (payload 스키마 · silent 여부):
 *   phase        { phase: string }                                              silent
 *   round-start  { nodes: { id, kind, ring }[], edges: { from, type, to }[], start, follow,
 *                  hops, layout, ringSlots, hopsMax }                                    걸음 0 (처음 모습)
 *                  ringSlots = max(가장 먼 ring, 사다리의 가장 큰 홉) — 무대가 둘레 폭을 고정하는 데 쓴다
 *                  hopsMax = 사다리의 가장 큰 홉 — 무대가 막대 자리를 확인하는 데 쓴다
 *   look         { hop, layout, front: string[], looked: number[], used: number[],
 *                  readThisHop, readTotal }                                     읽음 걸음
 *                  looked = 이번 홉에 읽은 이음 번호(읽은 차례) · used = 그 가운데 나가는 노드가 앞 줄인 것
 *   cross        { hop, crossed: number[], reached: string[], front: string[], reachedCount }  건넘 걸음
 *                  crossed = 건넌 이음 번호 · reached = 출발을 뺀 닿은 노드(닿은 차례) · front = 다음 앞 줄
 *   done         { hops, layout, friends: string[], readTotal, reachedCount, perHop: number[] }  끝 걸음
 *
 * phase 어휘 (irs.ts 와 같다): look-held · look-table · cross · done
 *
 * 계기 (판마다 지금 값을 들고 차이만 보낸다. 첫 판에도 0 을 보낸다):
 *   edges-read      읽은 이음 누적 (읽음 걸음마다 오른다)
 *   people-reached  닿은 사람 (건넘 걸음마다 오른다)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GraphDbNode = { id: string; kind: string };
export type GraphDbEdge = { from: string; type: string; to: string };

export type GraphDbData = {
  type: 'graph-db';
  stepMs: number;
  nodes: GraphDbNode[];
  edgeTypes: string[];
  edges: GraphDbEdge[];
  start: string;
  follow: string;
  hopsLadder: number[];
  layoutLadder: number[];
  firstHops: number;
  firstLayout: number;
};

/** 담는 법 번호 — 사다리 값과 같다. */
export const LAYOUT_HELD = 0;
export const LAYOUT_TABLE = 1;

export type GraphDbHop = {
  hop: number;
  front: string[];
  looked: number[];
  used: number[];
  readThisHop: number;
  readTotal: number;
  crossed: number[];
  reached: string[];
  nextFront: string[];
};

export type GraphDbRound = {
  hops: number;
  layout: number;
  steps: GraphDbHop[];
  friends: string[];
  readTotal: number;
  reachedCount: number;
};

/** 자료를 검사한다 — 모르는 노드 · 모르는 종류 · 나가는 노드끼리 모이지 않은 이음은 던진다 (C6). */
export function checkGraph(data: GraphDbData): void {
  const ids = data.nodes.map((n) => n.id);
  if (new Set(ids).size !== ids.length) throw new Error('graph-db: 노드 식별자가 겹친다');
  if (!ids.includes(data.start)) throw new Error(`graph-db: 출발 노드 ${data.start} 가 없다`);
  if (!data.edgeTypes.includes(data.follow)) throw new Error(`graph-db: 따라갈 종류 ${data.follow} 가 없다`);
  let lastFrom = -1;
  for (const e of data.edges) {
    const from = ids.indexOf(e.from);
    if (from < 0 || !ids.includes(e.to)) throw new Error(`graph-db: 이음 ${e.from}→${e.to} 에 모르는 노드`);
    if (!data.edgeTypes.includes(e.type)) throw new Error(`graph-db: 모르는 이음 종류 ${e.type}`);
    if (from < lastFrom) throw new Error('graph-db: 이음은 나가는 노드끼리 모여 있어야 한다');
    lastFrom = from;
  }
}

/** follow 이음만으로 출발에서 몇 홉인지 (홉 한계 없이). 닿지 않으면 -1. 무대의 자리 잡기용. */
export function graphDbRings(data: GraphDbData): number[] {
  const ring: number[] = data.nodes.map((n) => (n.id === data.start ? 0 : -1));
  let front = [data.start];
  let depth = 0;
  while (front.length > 0) {
    depth += 1;
    const next: string[] = [];
    for (const e of data.edges) {
      if (!front.includes(e.from) || e.type !== data.follow) continue;
      const at = data.nodes.findIndex((n) => n.id === e.to);
      if (ring[at] !== -1) continue;
      ring[at] = depth;
      next.push(e.to);
    }
    front = next;
  }
  return ring;
}

/** 한 판을 셈한다 — 홉마다 읽은 이음 · 건넌 이음 · 닿은 노드. 무대는 이 값을 그리기만 한다. */
export function graphDbRound(data: GraphDbData, hops: number, layout: number): GraphDbRound {
  if (!data.hopsLadder.includes(hops)) throw new Error(`graph-db: 사다리 밖의 홉 ${hops}`);
  if (!data.layoutLadder.includes(layout)) throw new Error(`graph-db: 사다리 밖의 담는 법 ${layout}`);
  if (layout !== LAYOUT_HELD && layout !== LAYOUT_TABLE) throw new Error(`graph-db: 모르는 담는 법 ${layout}`);
  checkGraph(data);
  const reachedAll = [data.start];
  let front = [data.start];
  let readTotal = 0;
  const steps: GraphDbHop[] = [];
  for (let hop = 1; hop <= hops; hop += 1) {
    const looked: number[] = [];
    if (layout === LAYOUT_HELD) {
      // 앞 줄 노드마다 제 손에 쥔 나가는 이음만
      for (const v of front) {
        data.edges.forEach((e, i) => {
          if (e.from === v) looked.push(i);
        });
      }
    } else {
      // 표의 줄 전부
      data.edges.forEach((_e, i) => looked.push(i));
    }
    const used = looked.filter((i) => front.includes(data.edges[i]!.from));
    readTotal += looked.length;
    const crossed: number[] = [];
    const nextFront: string[] = [];
    for (const i of used) {
      const e = data.edges[i]!;
      if (e.type !== data.follow) continue; // 읽기만 하고 건너지 않는다
      if (reachedAll.includes(e.to)) continue; // 이미 닿은 노드
      reachedAll.push(e.to);
      nextFront.push(e.to);
      crossed.push(i);
    }
    steps.push({
      hop,
      front,
      looked,
      used,
      readThisHop: looked.length,
      readTotal,
      crossed,
      reached: reachedAll.slice(1),
      nextFront,
    });
    front = nextFront;
  }
  return {
    hops,
    layout,
    steps,
    friends: reachedAll.slice(1),
    readTotal,
    reachedCount: reachedAll.length - 1,
  };
}

function takeLadder(payload: unknown, ladder: number[], what: string): number {
  if (typeof payload !== 'object' || payload === null) throw new Error(`graph-db: ${what} 입력에 payload 가 없다`);
  const value = (payload as { value?: unknown }).value;
  if (typeof value !== 'number') throw new Error(`graph-db: ${what} 입력 값이 수가 아니다`);
  if (!ladder.includes(value)) throw new Error(`graph-db: 사다리 밖의 ${what} ${value}`);
  return value;
}

export async function graphDbAlgorithm(ctx: FacetContext<GraphDbData>): Promise<void> {
  const rctx = ctx as ReactiveContext<GraphDbData>;
  const data = ctx.data;
  checkGraph(data);
  const rings = graphDbRings(data);
  const ringSlots = Math.max(...rings, ...data.hopsLadder);
  let hops = data.firstHops;
  let layout = data.firstLayout;

  const shown = { 'edges-read': 0, 'people-reached': 0 };
  const setMetric = (name: 'edges-read' | 'people-reached', value: number): void => {
    const delta = value - shown[name];
    shown[name] = value;
    ctx.metric(name, delta);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const round = graphDbRound(data, hops, layout);

      // 걸음 0 — 처음 모습
      setMetric('edges-read', 0);
      setMetric('people-reached', 0);
      await ctx.emit({
        type: 'round-start',
        payload: {
          nodes: data.nodes.map((n, i) => ({ id: n.id, kind: n.kind, ring: rings[i]! })),
          edges: data.edges.map((e) => ({ from: e.from, type: e.type, to: e.to })),
          start: data.start,
          follow: data.follow,
          hops,
          layout,
          ringSlots,
          hopsMax: Math.max(...data.hopsLadder),
        },
      });
      if (!(await rctx.sleep(data.stepMs))) return;

      for (const s of round.steps) {
        if (ctx.cancelled) return;
        // 읽음 걸음
        if (layout === LAYOUT_HELD) await phase('look-held');
        else await phase('look-table');
        await ctx.emit({
          type: 'look',
          payload: {
            hop: s.hop,
            layout,
            front: s.front,
            looked: s.looked,
            used: s.used,
            readThisHop: s.readThisHop,
            readTotal: s.readTotal,
          },
        });
        setMetric('edges-read', s.readTotal);
        if (!(await rctx.sleep(data.stepMs))) return;

        // 건넘 걸음
        await phase('cross');
        await ctx.emit({
          type: 'cross',
          payload: {
            hop: s.hop,
            crossed: s.crossed,
            reached: s.reached,
            front: s.nextFront,
            reachedCount: s.reached.length,
          },
        });
        setMetric('people-reached', s.reached.length);
        if (!(await rctx.sleep(data.stepMs))) return;
      }

      // 끝 걸음
      await phase('done');
      await ctx.emit({
        type: 'done',
        payload: {
          hops,
          layout,
          friends: round.friends,
          readTotal: round.readTotal,
          reachedCount: round.reachedCount,
          perHop: round.steps.map((s) => s.readThisHop),
        },
      });

      // 손잡이를 기다린다 — 우리 것이 아닌 입력은 흘린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'hops') {
          hops = takeLadder(input.payload, data.hopsLadder, 'hops');
          break;
        }
        if (input.type === 'layout') {
          layout = takeLadder(input.payload, data.layoutLadder, 'layout');
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
