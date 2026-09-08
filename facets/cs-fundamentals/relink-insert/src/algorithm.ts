/**
 * relink-insert — 조각(piece). 재연결: 고리를 끊고 다시 잇는다.
 *
 * 한 주장만 말한다 — **노드는 제자리에 그대로 있고 화살표만 움직인다.**
 * 배열처럼 값을 옮기는 일이 없다는 것을 걸음 다섯으로 보인다.
 *
 * ── 식별자 (C1)
 *   node:<id>        노드 하나 (A / B / C / X)
 *   edge:<from>-<to> 한 노드의 next 화살표가 가리키는 연결
 *
 * ── 이벤트 (facet 고유 확장 — C2)
 *   chain-shown    payload { textKey: string }                                     silent 아님
 *   node-staged    payload { value: number; textKey: string }                       silent 아님
 *   link-attached  payload { from: string; to: string; textKey: string }           silent 아님
 *   link-detached  payload { from: string; was: string; textKey: string }          silent 아님
 *   done           payload { textKey: string; rewires: number; moves: number }     silent 아님 (표준)
 *   rewind         payload 없음                                                    silent 아님
 *
 * textKey 는 화면 문안이 아니라 키다. 문안은 facet.ts 의 messages 에 있고
 * projector 가 tr 로 해석한다 (C10).
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece).
 *
 * ── 진행
 *   reactive. mount 즉시 한 바퀴 자동 재생하고, 그 뒤로는 `advance` 입력마다
 *   한 걸음씩 나아간다. 마지막 걸음 다음의 입력은 `rewind` 로 처음에 돌려놓는다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type RelinkNode = {
  /** 화면에 붙는 이름표. 사람이 걸음을 가리켜 말할 수 있게 한다. */
  id: string;
  value: number;
};

export type RelinkInsertData = {
  type: 'relink-insert';
  /** 처음부터 줄에 서 있는 노드들. 끝까지 자리를 옮기지 않는다. */
  nodes: RelinkNode[];
  /** 끼워 넣을 노드. 줄 밖에서 기다린다. */
  incoming: RelinkNode;
  /** 이 노드의 next 를 떼어 incoming 에 붙인다. */
  insertAfter: string;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 1200;

/**
 * 재연결 삽입 — X.next 를 B 에 붙이고, A.next 를 B 에서 떼어 X 에 붙인다.
 * 노드를 옮기는 코드는 한 줄도 없다. 그것이 이 조각의 주장이다.
 */
export async function relinkInsertAlgorithm(base: FacetContext<RelinkInsertData>): Promise<void> {
  const ctx = base as ReactiveContext<RelinkInsertData>;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  const anchorId = ctx.data.insertAfter;
  const anchorAt = ctx.data.nodes.findIndex((n) => n.id === anchorId);
  const follower = anchorAt >= 0 ? ctx.data.nodes[anchorAt + 1] : undefined;
  const incoming = ctx.data.incoming;
  if (anchorAt < 0 || follower === undefined || incoming === undefined) return;
  const followerId = follower.id;

  /** 자동 재생 한 바퀴가 끝나면 true — 그 뒤로는 걸음마다 누름을 기다린다. */
  let manual = false;

  /** 다음 입력 하나. 취소로 깨어나면 null. */
  const waitOnce = async (): Promise<ReactiveInputEvent | null> => {
    try {
      return await ctx.waitForInput();
    } catch {
      return null;
    }
  };

  /** 한 걸음 쉬어 간다. 계속 가도 되면 true. */
  const beat = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (!manual) return ctx.sleep(stepMs);
    return (await waitOnce()) !== null;
  };

  for (;;) {
    if (ctx.cancelled) return;
    /** 화살표를 고쳐 쓴 횟수. 세는 것이 아니라 실제로 일어난 것을 담는다. */
    let rewires = 0;

    await ctx.emit({
      type: 'chain-shown',
      payload: { textKey: 'caption.chain' },
    });
    if (!(await beat())) return;

    await ctx.emit({
      type: 'node-staged',
      target: `node:${incoming.id}`,
      payload: { value: incoming.value, textKey: 'caption.staged' },
    });
    if (!(await beat())) return;

    // 1) X.next 를 B 에 붙인다. 먼저 붙여 두어야 뒤가 끊기지 않는다.
    rewires += 1;
    await ctx.emit({
      type: 'link-attached',
      target: `edge:${incoming.id}-${followerId}`,
      payload: { from: incoming.id, to: followerId, textKey: 'caption.attachNew' },
    });
    if (!(await beat())) return;

    // 2-1) A.next 를 B 에서 뗀다. 이 사이 A 의 화살표는 아무 데도 닿지 않는다.
    await ctx.emit({
      type: 'link-detached',
      target: `edge:${anchorId}-${followerId}`,
      payload: { from: anchorId, was: followerId, textKey: 'caption.detach' },
    });
    if (!(await beat())) return;

    // 2-2) 같은 화살표를 X 에 붙인다. 새 화살표가 아니라 그 화살표다.
    rewires += 1;
    await ctx.emit({
      type: 'link-attached',
      target: `edge:${anchorId}-${incoming.id}`,
      payload: { from: anchorId, to: incoming.id, textKey: 'caption.attachBack' },
    });
    if (!(await beat())) return;

    // 노드를 옮긴 적이 없으므로 0 이다. 세어서 0 이 아니라 일어나지 않아서 0 이다.
    await ctx.emit({
      type: 'done',
      payload: { textKey: 'caption.done', rewires, moves: 0 },
    });

    manual = true;
    if ((await waitOnce()) === null) return;
    await ctx.emit({ type: 'rewind' });
  }
}
