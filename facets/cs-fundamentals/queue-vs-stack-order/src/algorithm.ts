/**
 * queue-vs-stack-order — 탐색이 쓰는 그릇 조각(piece).
 *
 * 답하는 질문 하나: **같은 그래프에서 담는 그릇만 바꾸면 방문 순서가 갈리는가.**
 *
 * 두 갈래를 나란히(lockstep) 돌린다. 그래프도, 출발점도, 이웃을 보는 순서도
 * (번호 오름차순) 같다. 다른 것은 그릇에서 꺼내는 자리 하나뿐이다 —
 * 한쪽은 먼저 넣은 것을 앞에서, 다른 쪽은 나중에 넣은 것을 위에서 꺼낸다.
 * 걸음마다 두 갈래가 동시에 하나씩 꺼내므로, 갈리는 순간이 한 화면에서 보인다.
 *
 * 걸음표를 손으로 적지 않는다 — 순회 순서는 간선 목록이 정한다 (C2 / S-piece).
 *
 * ── 이벤트 (`done` 만 표준 어휘. 나머지는 facet 고유)
 *
 *   seed    { vertex: number; fifoPending: number[]; lifoPending: number[] }
 *           출발 정점이 두 그릇에 동시에 들어간다. silent 아님.
 *
 *   take    { step: number; fifoTaken: number; lifoTaken: number;
 *             fifoPending: number[]; lifoPending: number[]; diverged: boolean }
 *           두 그릇이 각자 다음 정점을 하나씩 내놓는다. `diverged` 는 두 정점이
 *           **처음으로** 달라지는 걸음에서만 true. silent 아님.
 *
 *   offer   { fifoFrom: number; lifoFrom: number;
 *             fifoAdded: number[]; lifoAdded: number[];
 *             fifoPending: number[]; lifoPending: number[] }
 *           방금 꺼낸 정점의 아직 못 본 이웃이 번호 오름차순으로 그릇에 들어간다.
 *           양쪽 다 보탤 것이 없는 걸음에서는 발신하지 않는다. silent 아님.
 *
 *   rewind  payload 없음. 수동 걸음이 처음으로 되감긴다. silent 아님.
 *
 *   done    payload 없음 (표준 어휘). 재생이 끝났다.
 *
 * `*Pending` 은 그 이벤트가 끝난 시점의 그릇 내용이며 **앞(0번)이 fifo 가 꺼낼
 * 자리, 끝이 lifo 가 꺼낼 자리**다. 화면이 그리는 상태의 원본은 언제나 여기다.
 *
 * ── 메트릭
 * 없다. 조각은 셀 것이 없다 (S-piece / C5 무대상).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type QueueVsStackOrderData = {
  type: string;
  /** 정점 번호. */
  vertices: number[];
  /** 무방향 간선. */
  edges: number[][];
  /** 출발 정점. */
  start: number;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 그릇 하나와 그것이 만든 방문 순서. */
type Lane = {
  /** `fifo` 는 앞에서, `lifo` 는 뒤에서 꺼낸다. 이 한 글자가 전부다. */
  readonly id: 'fifo' | 'lifo';
  /** 그릇에 든 것. 넣는 자리는 언제나 끝이다. */
  pending: number[];
  /** 이미 그릇에 넣어 본 정점 — 같은 것을 두 번 넣지 않는다. */
  seen: Set<number>;
  /** 꺼낸 순서 = 방문 순서. */
  order: number[];
};

const DEFAULT_STEP_MS = 750;

/** 간선 목록 → 이웃 표. 이웃은 번호 오름차순으로 본다. */
function buildAdjacency(vertices: number[], edges: number[][]): Map<number, number[]> {
  const adjacency = new Map<number, number[]>();
  for (const v of vertices) adjacency.set(v, []);
  for (const edge of edges) {
    const a = edge[0];
    const b = edge[1];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    if (!adjacency.has(a)) adjacency.set(a, []);
    if (!adjacency.has(b)) adjacency.set(b, []);
    adjacency.get(a)?.push(b);
    adjacency.get(b)?.push(a);
  }
  for (const list of adjacency.values()) list.sort((x, y) => x - y);
  return adjacency;
}

/** 그릇에서 하나 꺼낸다. 두 갈래가 갈리는 유일한 지점. */
function takeFrom(lane: Lane): number | undefined {
  return lane.id === 'fifo' ? lane.pending.shift() : lane.pending.pop();
}

/** 아직 그릇에 넣어 본 적 없는 이웃을 번호 순서대로 넣는다. */
function offerNeighbours(lane: Lane, from: number, adjacency: Map<number, number[]>): number[] {
  const added: number[] = [];
  for (const neighbour of adjacency.get(from) ?? []) {
    if (lane.seen.has(neighbour)) continue;
    lane.seen.add(neighbour);
    lane.pending.push(neighbour);
    added.push(neighbour);
  }
  return added;
}

function newLane(id: Lane['id'], start: number): Lane {
  return { id, pending: [start], seen: new Set([start]), order: [] };
}

export const queueVsStackOrderAlgorithm = async (
  ctx: FacetContext<QueueVsStackOrderData>,
): Promise<void> => {
  const rctx = ctx as ReactiveContext<QueueVsStackOrderData>;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  /** 자동 재생이 끝나면 수동으로 바뀐다. */
  let manual = false;
  /** 되감기 직후의 첫 문은 그냥 통과시킨다 — 누르자마자 첫 걸음이 보여야 한다. */
  let freeGate = false;

  const gate = async (): Promise<void> => {
    if (!manual) {
      await rctx.sleep(stepMs);
      return;
    }
    if (freeGate) {
      freeGate = false;
      return;
    }
    // `advance` 만 걸음으로 친다 — 위젯 입력이 붙어도 걸음이 어긋나지 않게.
    while ((await rctx.waitForInput()).type !== 'advance') {
      if (ctx.cancelled) return;
    }
  };

  const play = async (): Promise<void> => {
    const vertices = Array.isArray(ctx.data.vertices) ? ctx.data.vertices : [];
    const edges = Array.isArray(ctx.data.edges) ? ctx.data.edges : [];
    const adjacency = buildAdjacency(vertices, edges);
    const start = ctx.data.start;

    const fifo = newLane('fifo', start);
    const lifo = newLane('lifo', start);

    await gate();
    if (ctx.cancelled) return;
    await ctx.emit({
      type: 'seed',
      target: `node:${start}`,
      payload: {
        vertex: start,
        fifoPending: [...fifo.pending],
        lifoPending: [...lifo.pending],
      },
    });

    let step = 0;
    let alreadyDiverged = false;

    while (fifo.pending.length > 0 && lifo.pending.length > 0) {
      const fifoTaken = takeFrom(fifo);
      const lifoTaken = takeFrom(lifo);
      if (fifoTaken === undefined || lifoTaken === undefined) break;
      fifo.order.push(fifoTaken);
      lifo.order.push(lifoTaken);
      step += 1;

      // 두 순서가 처음 달라지는 걸음. 이 조각이 하려는 말이 여기서 일어난다.
      const partsHere = !alreadyDiverged && fifoTaken !== lifoTaken;
      if (partsHere) alreadyDiverged = true;

      await gate();
      if (ctx.cancelled) return;
      await ctx.emit({
        type: 'take',
        target: [`node:${fifoTaken}`, `node:${lifoTaken}`],
        payload: {
          step,
          fifoTaken,
          lifoTaken,
          fifoPending: [...fifo.pending],
          lifoPending: [...lifo.pending],
          diverged: partsHere,
        },
      });

      const fifoAdded = offerNeighbours(fifo, fifoTaken, adjacency);
      const lifoAdded = offerNeighbours(lifo, lifoTaken, adjacency);
      if (fifoAdded.length === 0 && lifoAdded.length === 0) continue;

      await gate();
      if (ctx.cancelled) return;
      await ctx.emit({
        type: 'offer',
        target: [`node:${fifoTaken}`, `node:${lifoTaken}`],
        payload: {
          fifoFrom: fifoTaken,
          lifoFrom: lifoTaken,
          fifoAdded,
          lifoAdded,
          fifoPending: [...fifo.pending],
          lifoPending: [...lifo.pending],
        },
      });
    }

    await gate();
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'done' });
  };

  await play();

  // 자동 재생이 끝난 뒤 — 곱씹으며 한 걸음씩 짚어 보고 싶은 사람을 위한 루프.
  // 첫 누름은 되감고 첫 걸음까지 보인다 (S-piece).
  for (;;) {
    while ((await rctx.waitForInput()).type !== 'advance') {
      if (ctx.cancelled) return;
    }
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'rewind' });
    manual = true;
    freeGate = true;
    await play();
  }
};
