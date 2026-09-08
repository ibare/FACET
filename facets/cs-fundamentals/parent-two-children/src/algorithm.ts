/**
 * parent-two-children — 이진 트리 조각(piece) 알고리즘.
 *
 * 답하는 질문 하나: **한 자리에서 아래로 무엇이 몇 개 뻗는가.**
 * 자리 하나에서 아래로 최대 둘이 뻗고, 그 둘은 이름이 달라 자리를 바꿀 수 없다.
 * 자식이 하나뿐이어도 그것이 왼쪽인지 오른쪽인지가 정해져 있다.
 *
 * ── 걸음 (자동 재생 · 걸음 간격은 initialData.stepMs)
 *   1. 뿌리 자리 하나가 놓인다
 *   2. 뿌리가 갈라진다 — 왼쪽과 오른쪽
 *   3. 갈라져 나온 왼쪽 자리가 같은 방식으로 다시 갈라진다
 *   4. 오른쪽 자리는 자식이 하나뿐 — 나머지 한 자리는 빈 채로 열린다
 *   5. 그 하나뿐인 자식을 빈 자리로 옮겨 보고, 되돌아온다
 *
 *   자동 재생을 마치면 `advance` 입력을 기다린다. 누르면 `rewind` 로 처음으로
 *   돌아가 같은 순서를 한 걸음씩 짚는다 (S-piece).
 *
 * ── 식별자
 *   node:<id>   트리의 한 자리 (A~F)
 *
 * ── 이벤트 (전부 이 facet 고유 확장 · silent 없음)
 *   | type          | target          | payload                                              |
 *   |---------------|-----------------|------------------------------------------------------|
 *   | `root-placed` | `node:<id>`     | `{ id: string }`                                     |
 *   | `split`       | `node:<parent>` | `{ parent: string; left: string \| null; right: string \| null }` |
 *   | `sides-fixed` | `node:<child>`  | `{ child: string; parent: string }`                  |
 *   | `rewind`      | 없음            | 없음                                                  |
 *
 *   `split` 의 `left` / `right` 가 null 이면 그 쪽 자리는 비어 있다 — 화면에서
 *   빈 자리로 열리며, 그것이 이 조각이 하려는 말이다.
 *   `sides-fixed` 는 하나뿐인 자식을 반대쪽 빈 자리로 옮겨 보고 되돌리는 마지막
 *   걸음이다. 문안은 payload 에 담지 않는다 — 캡션은 projector 가 정한다 (C10).
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 한 자리와 그 아래 두 자리의 이음. null 은 그 쪽이 비어 있다는 뜻. */
export type BinaryTreeLink = {
  id: string;
  left: string | null;
  right: string | null;
};

export type ParentTwoChildrenData = {
  type: 'binary-tree';
  /** 뿌리 자리의 id. */
  root: string;
  nodes: BinaryTreeLink[];
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

const FALLBACK_STEP_MS = 640;

/**
 * 걸음 사이의 문. 자동 재생이면 stepMs 만큼 쉬고, 한 걸음씩이면 누를 때까지
 * 기다린다. false 를 돌려주면 그 자리에서 멈춘다 (취소).
 */
type Gate = () => Promise<boolean>;

export const parentTwoChildren = async (
  ctx: FacetContext<ParentTwoChildrenData>,
): Promise<void> => {
  const rc = ctx as ReactiveContext<ParentTwoChildrenData>;
  const data = rc.data;
  const stepMs = typeof data.stepMs === 'number' && data.stepMs > 0 ? data.stepMs : FALLBACK_STEP_MS;

  const linkOf = (id: string): BinaryTreeLink =>
    data.nodes.find((n) => n.id === id) ?? { id, left: null, right: null };

  const rootId = data.root;
  const rootLink = linkOf(rootId);

  /**
   * 한 벌의 걸음. 자동 재생과 한 걸음씩이 같은 순서를 지나므로 문(gate) 만
   * 갈아 끼운다. 걸음은 배열로 순회하지 않고 한 줄씩 편다 (C2 · S-piece).
   */
  const play = async (gate: Gate): Promise<boolean> => {
    // 1. 자리 하나.
    await rc.emit({ type: 'root-placed', target: `node:${rootId}`, payload: { id: rootId } });
    if (!(await gate())) return false;

    // 2. 그 자리가 아래로 둘로 갈라진다.
    await rc.emit({
      type: 'split',
      target: `node:${rootId}`,
      payload: { parent: rootId, left: rootLink.left, right: rootLink.right },
    });
    if (!(await gate())) return false;

    // 3. 갈라져 나온 왼쪽 자리도 같은 방식으로 갈라진다.
    const leftLink = rootLink.left === null ? null : linkOf(rootLink.left);
    if (leftLink !== null) {
      await rc.emit({
        type: 'split',
        target: `node:${leftLink.id}`,
        payload: { parent: leftLink.id, left: leftLink.left, right: leftLink.right },
      });
      if (!(await gate())) return false;
    }

    // 4. 오른쪽 자리는 자식이 하나뿐이다. 나머지 한 자리는 빈 채로 열린다.
    const rightLink = rootLink.right === null ? null : linkOf(rootLink.right);
    if (rightLink !== null) {
      await rc.emit({
        type: 'split',
        target: `node:${rightLink.id}`,
        payload: { parent: rightLink.id, left: rightLink.left, right: rightLink.right },
      });
      if (!(await gate())) return false;
    }

    // 5. 하나뿐인 그 자식을 빈 자리로 옮겨 본다 — 되돌아온다.
    const lone =
      rightLink !== null && (rightLink.left === null) !== (rightLink.right === null)
        ? (rightLink.right ?? rightLink.left)
        : null;
    if (lone !== null && rightLink !== null) {
      await rc.emit({
        type: 'sides-fixed',
        target: `node:${lone}`,
        payload: { child: lone, parent: rightLink.id },
      });
    }
    return true;
  };

  // 자동 재생 — mount 즉시 스스로 시작한다 (reactive).
  if (!(await play(async () => rc.sleep(stepMs)))) return;

  // 자동 재생을 마친 뒤에는 누르는 만큼 한 걸음씩. 처음으로 돌아갈 때 rewind.
  for (;;) {
    await rc.waitForInput();
    if (rc.cancelled) return;
    await rc.emit({ type: 'rewind' });
    const walked = await play(async () => {
      await rc.waitForInput();
      return !rc.cancelled;
    });
    if (!walked) return;
  }
};
