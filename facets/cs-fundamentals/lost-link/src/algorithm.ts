/**
 * lost-link — 연결 유실 조각(piece).
 *
 * 한 주장만 말한다: **화살표를 잘못된 차례로 옮기면 뒤쪽이 통째로 떨어져 나간다.**
 * 노드는 메모리에 그대로 있는데 닿을 길이 없어진다.
 *
 * 논증 순서 (문제 → 사고 → 되돌림 → 장치 → 결과):
 *   1) 새 노드를 준비한다            아직 아무도 가리키지 않는다
 *   2) A.next 를 먼저 X 로 옮긴다     B 를 가리키는 화살표가 사라진다
 *   3) B·C·D 가 떨어져 나간다         닿을 수 없는 자리로 내려앉는다
 *   4) 처음으로 되돌린다             같은 삽입, 다른 차례
 *   5) X.next 를 B 에 먼저 붙인다     B 를 가리키는 화살표가 둘이 된다
 *   6) 그 다음 A.next 를 X 로 옮긴다   B 는 X 가 계속 붙들고 있다
 *   7) X 가 줄 안으로 내려앉는다       아무것도 떨어지지 않았다
 *
 * ── 이벤트 어휘 (전부 이 facet 고유 확장, C2) ─────────────────────────────
 *
 * | type          | target                | payload                                   | silent |
 * |---------------|-----------------------|-------------------------------------------|--------|
 * | `node-staged` | `node:<id>`           | `{ id, value, after, textKey }`            | no     |
 * | `link-added`  | `edge:<from>-<to>`    | `{ from, to, textKey }`                    | no     |
 * | `link-moved`  | `edge:<from>-<to>`    | `{ from, to, textKey }`                    | no     |
 * | `detached`    | `node:<id>[]`         | `{ ids: string[], textKey }`               | no     |
 * | `settled`     | `node:<id>`           | `{ id, after, textKey }`                   | no     |
 * | `rewind`      | —                     | `{ textKey }`                              | no     |
 * | `done`        | —                     | `{ textKey }`                              | no     |
 *
 * `link-added` 와 `link-moved` 는 다른 일이다 — 붙이는 것은 아무에게서도 빼앗지
 * 않고, 옮기는 것은 원래 가리키던 쪽에서 화살표를 빼앗는다. 이 조각이 말하려는
 * 차이가 바로 그것이라 어휘를 나눈다.
 *
 * `textKey` 는 키일 뿐 문안이 아니다. 문안은 `facet.ts` 의 `messages` 에 있고
 * projector 가 해석한다 (C10).
 *
 * 메트릭은 발신하지 않는다 (조각은 셀 것이 없다, S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LostLinkNode = {
  id: string;
  value: number;
};

export type LostLinkData = {
  type: string;
  /** 처음 사슬. head → nodes[0] → nodes[1] → … */
  nodes: LostLinkNode[];
  /** 사슬에 끼워 넣을 새 노드. */
  newNode: LostLinkNode;
  /** 새 노드가 들어갈 자리 — 이 노드의 바로 뒤. */
  insertAfter: string;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

const FALLBACK_STEP_MS = 800;

/** 한 걸음의 끝. true 면 계속 진행, false 면 취소되었으므로 중단. */
type Gate = () => Promise<boolean>;

/**
 * 조각의 대본. 자동 재생과 한 걸음씩 보기가 같은 대본을 쓰되 걸음의 끝만
 * 달리한다 (`ctx.sleep` 이냐 `ctx.waitForInput` 이냐). emit 의 type 은 전부
 * 리터럴이며 배열 순회로 접지 않는다 (C2).
 */
async function playScript(ctx: ReactiveContext<LostLinkData>, gate: Gate): Promise<boolean> {
  const data = ctx.data;
  const anchorIndex = data.nodes.findIndex((n) => n.id === data.insertAfter);
  const anchor = data.nodes[anchorIndex];
  const follower = data.nodes[anchorIndex + 1];
  if (!anchor || !follower) return false;

  const fresh = data.newNode;
  const tail = data.nodes.slice(anchorIndex + 1).map((n) => n.id);

  await ctx.emit({
    type: 'node-staged',
    target: `node:${fresh.id}`,
    payload: { id: fresh.id, value: fresh.value, after: anchor.id, textKey: 'caption.staged' },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'link-moved',
    target: `edge:${anchor.id}-${fresh.id}`,
    payload: { from: anchor.id, to: fresh.id, textKey: 'caption.wrongMove' },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'detached',
    target: tail.map((id) => `node:${id}`),
    payload: { ids: tail, textKey: 'caption.detached' },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'rewind',
    payload: { textKey: 'caption.rewind' },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'node-staged',
    target: `node:${fresh.id}`,
    payload: { id: fresh.id, value: fresh.value, after: anchor.id, textKey: 'caption.stagedAgain' },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'link-added',
    target: `edge:${fresh.id}-${follower.id}`,
    payload: { from: fresh.id, to: follower.id, textKey: 'caption.rightAdd' },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'link-moved',
    target: `edge:${anchor.id}-${fresh.id}`,
    payload: { from: anchor.id, to: fresh.id, textKey: 'caption.rightMove' },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'settled',
    target: `node:${fresh.id}`,
    payload: { id: fresh.id, after: anchor.id, textKey: 'caption.settled' },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'done',
    payload: { textKey: 'caption.done' },
  });
  return true;
}

/**
 * reactive 알고리즘. mount 직후 스스로 자동 재생을 마치고, 그 뒤에는 `advance`
 * 입력을 받아 처음부터 한 걸음씩 짚는다 (S-piece).
 */
export const lostLink = async (ctx: FacetContext<LostLinkData>): Promise<void> => {
  const rctx = ctx as ReactiveContext<LostLinkData>;
  const stepMs = typeof rctx.data.stepMs === 'number' ? rctx.data.stepMs : FALLBACK_STEP_MS;

  const bySleep: Gate = () => rctx.sleep(stepMs);
  const byInput: Gate = async () => {
    try {
      await rctx.waitForInput();
    } catch {
      return false;
    }
    return !rctx.cancelled;
  };

  // 성한 사슬을 한 박자 보여 준 뒤에 손을 댄다. 무엇이 망가지는지 보이려면
  // 망가지기 전이 먼저 보여야 한다 (S-piece: 문제를 세운 뒤 장치를 넣는다).
  if (!(await rctx.sleep(stepMs))) return;
  if (!(await playScript(rctx, bySleep))) return;

  // 자동 재생이 끝났다. 여기서부터는 누르는 만큼만 나아간다.
  while (!rctx.cancelled) {
    try {
      await rctx.waitForInput();
    } catch {
      return;
    }
    if (rctx.cancelled) return;
    await rctx.emit({ type: 'rewind', payload: { textKey: 'caption.start' } });
    try {
      await rctx.waitForInput();
    } catch {
      return;
    }
    if (rctx.cancelled) return;
    if (!(await playScript(rctx, byInput))) return;
  }
};
