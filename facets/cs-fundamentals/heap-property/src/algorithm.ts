/**
 * heapProperty 조각 알고리즘 — "부모가 자식보다 앞선다" 를 부모-자식 짝만
 * 짝지어 견주는 걸음으로 보인다.
 *
 * 데이터는 배열 기반 최소 힙(`nodes[i]`)이다. 부모 인덱스는 `floor((i-1)/2)`.
 * 걸음은 이 배열을 실제로 순회하며 매 부모-자식 쌍의 값을 `<` 로 비교한다 —
 * 판정(✓/✗)을 미리 적어 두지 않고 그 자리에서 계산한다. 같은 부모를 둔
 * 형제 쌍도 같은 방식으로 구조에서 뽑아내되, 값은 비교하지 않는다 — 그것이
 * 힙이 정렬과 갈리는 자리다.
 *
 * ## 이벤트 어휘 (C2)
 *
 * | type                 | silent | payload                                                                 |
 * | -------------------- | ------ | ------------------------------------------------------------------------ |
 * | `rewind`             | false  | 없음. `advance` 로 처음부터 다시 짚기 직전, 화면을 pristine 으로 되돌린다. |
 * | `heap-pair-check`    | false  | `{ parentId, childId, parentValue, childValue, holds }` — 부모-자식 짝 하나를 비교. `holds` 는 `parentValue < childValue` 를 그 자리에서 계산한 값. |
 * | `heap-sibling-skip`  | false  | `{ aId, bId, aValue, bValue }` — 같은 부모를 둔 형제 짝. 힙은 이 짝을 한 번도 견주지 않는다. |
 * | `heap-confirmed`     | false  | `{ rootId, rootValue }` — 모든 부모-자식 짝이 성립해 힙임이 확인됐다.       |
 *
 * 표준 `done` 은 쓰지 않는다 — 이 조각은 자동 재생이 끝난 뒤 `advance` 로 같은
 * 걸음을 처음부터 다시 짚어 보는 반복 구조라 1회성 종점이 없다. 확인은
 * `heap-confirmed` 가 대신한다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type HeapNode = { id: string; value: number };

export type HeapPropertyData = {
  type: 'heap-property';
  /** 배열 기반 힙. nodes[i] 의 부모는 nodes[Math.floor((i-1)/2)] (i>=1). */
  nodes: HeapNode[];
  /** 걸음 간격(ms). 자동 재생에서 각 emit 전에 이만큼 기다린다. */
  stepMs: number;
};

type ParentChildPair = {
  parentId: string;
  childId: string;
  parentValue: number;
  childValue: number;
};

type SiblingPair = { aId: string; bId: string; aValue: number; bValue: number };

/** nodes[1..] 을 훑어 부모-자식 짝을 뽑는다. BFS(위→아래, 좌→우) 순서와 같다. */
function collectParentChildPairs(nodes: HeapNode[]): ParentChildPair[] {
  const pairs: ParentChildPair[] = [];
  for (let i = 1; i < nodes.length; i += 1) {
    const parent = nodes[Math.floor((i - 1) / 2)];
    const child = nodes[i];
    if (!parent || !child) continue;
    pairs.push({
      parentId: parent.id,
      childId: child.id,
      parentValue: parent.value,
      childValue: child.value,
    });
  }
  return pairs;
}

/** 같은 부모를 둔 자식 두 짝을 뽑는다. 힙은 이 짝을 견주지 않는다. */
function collectSiblingPairs(nodes: HeapNode[]): SiblingPair[] {
  const pairs: SiblingPair[] = [];
  for (let p = 0; 2 * p + 1 < nodes.length; p += 1) {
    const left = nodes[2 * p + 1];
    const right = nodes[2 * p + 2];
    if (!left || !right) continue;
    pairs.push({ aId: left.id, bId: right.id, aValue: left.value, bValue: right.value });
  }
  return pairs;
}

type GateState = { mode: 'auto' | 'advance'; skipNext: boolean };

/**
 * 걸음 사이의 문(gate). 취소되면 false.
 * - auto: stepMs 만큼 잔다.
 * - advance: 다음 입력을 기다린다 — 단 skipNext 가 서 있으면 그 한 번만
 *   그냥 통과시킨다 (되감기 직후 첫 걸음이 바로 보이게 하는 장치).
 */
async function passGate(
  rctx: ReactiveContext<HeapPropertyData>,
  stepMs: number,
  gate: GateState,
): Promise<boolean> {
  if (rctx.cancelled) return false;
  if (gate.mode === 'auto') {
    return rctx.sleep(stepMs);
  }
  if (gate.skipNext) {
    gate.skipNext = false;
    return true;
  }
  try {
    await rctx.waitForInput();
  } catch {
    return false;
  }
  return !rctx.cancelled;
}

async function runSequence(
  rctx: ReactiveContext<HeapPropertyData>,
  pairs: ParentChildPair[],
  siblingPairs: SiblingPair[],
  rootId: string,
  rootValue: number,
  stepMs: number,
  gate: GateState,
): Promise<boolean> {
  for (const pair of pairs) {
    if (!(await passGate(rctx, stepMs, gate))) return false;
    if (rctx.cancelled) return false;
    await rctx.emit({
      type: 'heap-pair-check',
      target: [`node:${pair.parentId}`, `node:${pair.childId}`],
      payload: {
        parentId: pair.parentId,
        childId: pair.childId,
        parentValue: pair.parentValue,
        childValue: pair.childValue,
        holds: pair.parentValue < pair.childValue,
      },
    });
  }

  for (const sib of siblingPairs) {
    if (!(await passGate(rctx, stepMs, gate))) return false;
    if (rctx.cancelled) return false;
    await rctx.emit({
      type: 'heap-sibling-skip',
      target: [`node:${sib.aId}`, `node:${sib.bId}`],
      payload: { aId: sib.aId, bId: sib.bId, aValue: sib.aValue, bValue: sib.bValue },
    });
  }

  if (!(await passGate(rctx, stepMs, gate))) return false;
  if (rctx.cancelled) return false;
  await rctx.emit({
    type: 'heap-confirmed',
    target: `node:${rootId}`,
    payload: { rootId, rootValue },
  });
  return true;
}

export async function heapPropertyAlgorithm(ctx: FacetContext<HeapPropertyData>): Promise<void> {
  // ReactiveMechanism 이 waitForInput/sleep 을 얹은 확장 컨텍스트를 주입한다.
  // registerAlgorithm 시그니처는 FacetContext 그대로이므로 여기서 단언한다.
  const rctx = ctx as ReactiveContext<HeapPropertyData>;
  const { nodes, stepMs } = rctx.data;
  const pairs = collectParentChildPairs(nodes);
  const siblingPairs = collectSiblingPairs(nodes);
  const root = nodes[0];
  if (!root) return;

  const gate: GateState = { mode: 'auto', skipNext: false };

  const autoOk = await runSequence(rctx, pairs, siblingPairs, root.id, root.value, stepMs, gate);
  if (!autoOk) return;

  gate.mode = 'advance';
  while (!rctx.cancelled) {
    let input: ReactiveInputEvent;
    try {
      input = await rctx.waitForInput();
    } catch {
      return;
    }
    if (input.type !== 'advance') continue;

    gate.skipNext = true;
    if (rctx.cancelled) return;
    await rctx.emit({ type: 'rewind' });
    const ok = await runSequence(rctx, pairs, siblingPairs, root.id, root.value, stepMs, gate);
    if (!ok) return;
  }
}
