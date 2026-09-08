/**
 * node-points-next — 조각(piece). "노드가 다음 노드를 가리킨다" 하나만 말한다.
 *
 * 동사는 **가리킨다**. 노드는 값 옆에 다음 노드의 주소를 함께 쥐고 있고,
 * 그 주소가 메모리에 흩어진 노드들에 순서를 만든다. 그래서 걸음은
 *   흩어져 있다(문제) → 주소를 쥐고 가리킨다(장치) → 순서가 생긴다(결과)
 * 로 짜여 있다.
 *
 * ── 이벤트 (전부 facet 고유 확장, C2) ────────────────────────────────
 *   caption-changed  { textKey: string }
 *       화면 아래 캡션 교체. 문안이 아니라 **키**를 보낸다 (C10) — 문안은
 *       facet.ts 의 messages 에 있고 projector 가 해석한다. silent 아님.
 *   nodes-placed     { count: number }
 *       세 노드가 각자의 주소 자리에 내려앉는다. silent 아님.
 *   head-attached    { addr: string }
 *       head 가 쥔 주소가 첫 노드 위로 미끄러져 와 얹힌다. silent 아님.
 *   pointer-followed { from: string; to: string }
 *       from 노드의 next 칸에 적힌 주소의 복제본이 날아가 to 노드를 가리킨다.
 *       원본은 next 칸에 남는다. silent 아님.
 *   pointer-null     { addr: string }
 *       마지막 노드가 쥔 것은 null 이라 갈 곳이 없다. silent 아님.
 *   value-collected  { addr: string; slot: number; value: number }
 *       가리킨 차례대로 값이 순서 레인의 slot 번째 자리로 내려간다. silent 아님.
 *   rewind           payload 없음
 *       advance 로 처음부터 다시 짚을 때 화면을 빈 상태로 되돌린다. silent 아님.
 *   done             payload 없음
 *       순서가 다 드러났다. silent 아님.
 *
 * ── 진행 ─────────────────────────────────────────────────────────────
 * reactive. mount 시 스스로 자동 재생하고 (걸음 간격은 initialData.stepMs),
 * 끝난 뒤에는 `advance` 입력을 기다린다. 첫 누름에서 `rewind` 를 발신하고
 * 같은 순서를 한 걸음씩 되짚는다. 자동 재생만 보고 지나가도 화면은 할 말을
 * 마친다 (S-piece).
 *
 * 메트릭 없음 — 조각은 셀 것이 없다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type NodePointsNextNode = {
  /** 이 노드가 놓인 메모리 주소 (16진 표기 문자열). */
  addr: string;
  /** 노드가 담은 값 (int32). */
  value: number;
  /** 다음 노드의 주소. 마지막 노드는 null. */
  next: string | null;
};

export type NodePointsNextData = {
  type: string;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
  /** 첫 노드의 주소. 손에 처음 쥐는 주소. */
  head: string;
  /** 노드 하나가 차지하는 바이트 수 (값 + 주소). */
  nodeBytes: number;
  /** 논리 순서대로 적은 노드 목록. 메모리 순서와 다르다. */
  nodes: NodePointsNextNode[];
};

const DEFAULT_STEP_MS = 760;

export const nodePointsNextAlgorithm = async (
  base: FacetContext<NodePointsNextData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<NodePointsNextData>;
  const data = ctx.data;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : DEFAULT_STEP_MS;

  // 논리 순서 — head 부터 next 를 따라간 차례. 데이터에 적힌 순서 그대로다.
  const first = data.nodes[0];
  const second = data.nodes[1];
  const last = data.nodes[2];
  if (!first || !second || !last) return;

  /** 취소 검사 + 걸음 간격. 이어가도 되면 true, 접어야 하면 false. */
  const pause = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return await ctx.sleep(stepMs);
  };

  /** advance 를 누를 때까지 기다린다. 취소되거나 대기가 깨지면 false. */
  const waitAdvance = async (): Promise<boolean> => {
    for (;;) {
      if (ctx.cancelled) return false;
      let input: { type: string };
      try {
        input = await ctx.waitForInput();
      } catch {
        return false;
      }
      if (input.type === 'advance') return true;
    }
  };

  /**
   * 걸음 순서. 자동 재생이면 step 이 sleep 이고, 되짚기면 step 이 입력 대기다.
   * emit 의 type 은 리터럴이어야 하므로 (C2) 배열로 순회하지 않고 한 줄씩 편다.
   */
  const sequence = async (step: () => Promise<boolean>): Promise<boolean> => {
    await ctx.emit({ type: 'caption-changed', payload: { textKey: 'caption.scattered' } });
    await ctx.emit({ type: 'nodes-placed', payload: { count: data.nodes.length } });
    if (!(await step())) return false;

    await ctx.emit({ type: 'caption-changed', payload: { textKey: 'caption.holdsAddress' } });
    await ctx.emit({ type: 'head-attached', payload: { addr: data.head } });
    if (!(await step())) return false;

    await ctx.emit({
      type: 'pointer-followed',
      payload: { from: first.addr, to: second.addr },
    });
    if (!(await step())) return false;

    await ctx.emit({
      type: 'pointer-followed',
      payload: { from: second.addr, to: last.addr },
    });
    if (!(await step())) return false;

    await ctx.emit({ type: 'pointer-null', payload: { addr: last.addr } });
    if (!(await step())) return false;

    await ctx.emit({ type: 'caption-changed', payload: { textKey: 'caption.orderExists' } });
    await ctx.emit({
      type: 'value-collected',
      payload: { addr: first.addr, slot: 0, value: first.value },
    });
    if (!(await step())) return false;

    await ctx.emit({
      type: 'value-collected',
      payload: { addr: second.addr, slot: 1, value: second.value },
    });
    if (!(await step())) return false;

    await ctx.emit({
      type: 'value-collected',
      payload: { addr: last.addr, slot: 2, value: last.value },
    });
    if (!(await step())) return false;

    await ctx.emit({ type: 'done' });
    return true;
  };

  if (!(await sequence(pause))) return;

  // 자동 재생은 끝났다. 곱씹고 싶은 사람만 advance 로 한 걸음씩 되짚는다.
  for (;;) {
    if (!(await waitAdvance())) return;
    await ctx.emit({ type: 'rewind' });
    if (!(await sequence(waitAdvance))) return;
  }
};
