/**
 * traversal-order — 순회 순서 조각(piece) 알고리즘.
 *
 * 같은 나무를 세 차례 밟는다. **발이 지나는 길은 세 번 다 똑같다.** 뿌리에서
 * 내려가 왼쪽을 돌고 올라와 오른쪽을 돌고 다시 올라오는 한 바퀴 — 나무가 정하는
 * 길이지 순서가 정하는 길이 아니다. 차례마다 달라지는 것은 그 길 위에서 "제
 * 자리를 밟았다" 고 세는 순간 하나뿐이다.
 *
 *   전위(pre)   자식보다 먼저      노드의 왼쪽에서 셈한다
 *   중위(in)    왼쪽을 마친 다음   노드의 아래에서 셈한다
 *   후위(post)  둘 다 마친 뒤      노드의 오른쪽에서 셈한다
 *
 * 그래서 노드마다 접점이 셋이고, 세 차례 모두 그 셋을 다 밟되 세는 접점만 옮겨
 * 간다.
 *
 * ── 식별자 ──────────────────────────────────────────────────────────────
 *   node:<값>   값이 곧 이름인 이진 탐색 트리 노드 (node:4, node:2 …)
 *
 * ── 이벤트 (전부 이 facet 고유 확장. silent 인 것 없음) ──────────────────
 *   order-begin  payload { order: 'pre'|'in'|'post'; index: number }
 *                한 차례가 시작된다. 세는 순간 표식이 자리를 옮긴다.
 *   touch        target  'node:<값>'
 *                payload { moment: 'pre'|'in'|'post'; counted: boolean }
 *                발이 그 노드의 세 접점 중 하나에 닿았다. counted 면 이번
 *                차례가 세기로 한 접점이다.
 *   record       target  'node:<값>'
 *                payload { order: 'pre'|'in'|'post'; slot: number; value: number }
 *                세는 접점에 닿았으므로 값이 그 차례의 결과 줄 slot 번째 칸으로
 *                떨어진다. 언제나 직전 touch 와 같은 걸음 안에서 온다.
 *   order-end    payload { order: 'pre'|'in'|'post'; index: number }
 *                한 차례를 마쳤다. 그 줄이 완성된다.
 *   done         payload 없음. 세 차례를 다 마쳤다.
 *   rewind       payload 없음. advance 로 처음으로 되돌아간다.
 *
 * ── 메트릭 ──────────────────────────────────────────────────────────────
 *   없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 노드가 제 자리를 밟는 순간. 세 차례의 이름이기도 하다. */
export type TraversalMoment = 'pre' | 'in' | 'post';

export type TraversalOrderData = {
  type: 'traversal-order';
  /**
   * 레벨 순서로 적은 완전 이진 트리. 값이 곧 이름이라 `node:<값>` 이 식별자가
   * 된다. 인덱스 i 의 자식은 2i+1 / 2i+2.
   */
  values: number[];
  /** 밟아 볼 차례들. 배열 순서가 곧 결과 줄의 순서다. */
  orders: TraversalMoment[];
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 480;

export function isTraversalMoment(value: unknown): value is TraversalMoment {
  return value === 'pre' || value === 'in' || value === 'post';
}

/**
 * 걸음 하나.
 *
 * 자동 재생과 `advance` 한 걸음씩 보기가 **같은 목록**을 쓴다. 목록은 데이터일
 * 뿐이고 발신은 `emitBeat` 안에서 리터럴 type 으로 일어난다 (C2).
 */
type Beat =
  | { kind: 'begin'; order: TraversalMoment; index: number }
  | {
      kind: 'touch';
      node: number;
      moment: TraversalMoment;
      order: TraversalMoment;
      counted: boolean;
      /** counted 일 때 값이 떨어질 칸. 아니면 -1. */
      slot: number;
    }
  | { kind: 'end'; order: TraversalMoment; index: number }
  | { kind: 'finish' };

/**
 * 세 차례의 걸음을 모두 펼친다.
 *
 * 한 차례의 접점 열거는 세 줄 — 제 자리, 왼쪽, 제 자리, 오른쪽, 제 자리 — 로
 * 끝나며, 그 자체가 나무를 도는 한 바퀴다. 차례가 바뀌어도 이 열거는 한 글자도
 * 바뀌지 않고 `counted` 만 옮겨 간다.
 */
function buildBeats(values: number[], orders: TraversalMoment[]): Beat[] {
  const beats: Beat[] = [];

  for (let i = 0; i < orders.length; i += 1) {
    const order = orders[i];
    if (order === undefined) continue;
    beats.push({ kind: 'begin', order, index: i });

    let filled = 0;
    const touch = (node: number, moment: TraversalMoment): void => {
      const counted = moment === order;
      const slot = counted ? filled : -1;
      if (counted) filled += 1;
      beats.push({ kind: 'touch', node, moment, order, counted, slot });
    };
    const walk = (idx: number): void => {
      const node = values[idx];
      if (node === undefined) return;
      touch(node, 'pre');
      walk(idx * 2 + 1);
      touch(node, 'in');
      walk(idx * 2 + 2);
      touch(node, 'post');
    };
    walk(0);

    beats.push({ kind: 'end', order, index: i });
  }

  beats.push({ kind: 'finish' });
  return beats;
}

/**
 * 걸음마다의 머무는 시간.
 *
 * 세는 접점에서 오래 머물고, 지나가기만 하는 접점은 빠르게 흘린다. 그 리듬 자체가
 * "어느 접점이 이번 차례의 것인가" 를 말한다.
 */
function beatDelay(beat: Beat, stepMs: number): number {
  switch (beat.kind) {
    case 'begin':
      return Math.round(stepMs * 1.2);
    case 'touch':
      return beat.counted ? Math.round(stepMs * 0.7) : Math.round(stepMs * 0.22);
    case 'end':
      return stepMs;
    case 'finish':
      return 0;
  }
}

async function emitBeat(ctx: ReactiveContext<TraversalOrderData>, beat: Beat): Promise<void> {
  if (beat.kind === 'begin') {
    await ctx.emit({ type: 'order-begin', payload: { order: beat.order, index: beat.index } });
    return;
  }
  if (beat.kind === 'touch') {
    await ctx.emit({
      type: 'touch',
      target: `node:${beat.node}`,
      payload: { moment: beat.moment, counted: beat.counted },
    });
    if (beat.counted) {
      await ctx.emit({
        type: 'record',
        target: `node:${beat.node}`,
        payload: { order: beat.order, slot: beat.slot, value: beat.node },
      });
    }
    return;
  }
  if (beat.kind === 'end') {
    await ctx.emit({ type: 'order-end', payload: { order: beat.order, index: beat.index } });
    return;
  }
  await ctx.emit({ type: 'done' });
}

export const traversalOrder = async (base: FacetContext<TraversalOrderData>): Promise<void> => {
  const ctx = base as ReactiveContext<TraversalOrderData>;

  const values = Array.isArray(ctx.data.values) ? ctx.data.values : [];
  const orders = (Array.isArray(ctx.data.orders) ? ctx.data.orders : []).filter(isTraversalMoment);
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;
  const beats = buildBeats(values, orders);

  const pause = async (ms: number): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (ms <= 0) return true;
    return ctx.sleep(ms);
  };

  // ── 자동 재생. mount 하자마자 스스로 세 차례를 밟고 멈춘다. 누르지 않아도
  //    화면은 할 말을 마친다 (S-piece).
  for (const beat of beats) {
    if (ctx.cancelled) return;
    await emitBeat(ctx, beat);
    if (!(await pause(beatDelay(beat, stepMs)))) return;
  }

  // ── 다 마친 뒤. advance 를 받아 처음부터 한 걸음씩 짚는다. 곱씹으며 읽고
  //    싶은 사람을 위한 것이지 진행에 필요한 조작이 아니다.
  let cursor = beats.length;
  for (;;) {
    const input = await ctx.waitForInput();
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;
    if (cursor >= beats.length) {
      await ctx.emit({ type: 'rewind' });
      cursor = 0;
    }
    const beat = beats[cursor];
    if (beat === undefined) {
      cursor = beats.length;
      continue;
    }
    await emitBeat(ctx, beat);
    cursor += 1;
  }
};
