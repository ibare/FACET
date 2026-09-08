/**
 * recolor-then-rotate — 레드-블랙 트리에 20, 10, 30, 5, 3 을 순서대로 넣으며
 * "빨강 아래 빨강" 위반을 두 번 겪는다. 첫 번째는 옆자리(부모의 형제, 즉
 * 삼촌)가 빨강이라 색칠만으로 풀리고, 두 번째는 옆자리가 검정이라 돌려야
 * 풀린다. 이 판정은 진짜 레드-블랙 트리 삽입+수선 알고리즘이 매 삽입마다
 * 삼촌의 색을 검사해서 내리는 결정이며, 표에서 베껴 오지 않는다.
 *
 * 확장 이벤트 (C2 — 표준 어휘에 이 개념에 맞는 타입이 없어 확장했다):
 *
 *   insert-node  { id, value, color, parentId, side }
 *     새 노드가 트리에 붙는다. `parentId === null` 이면 뿌리이고, 뿌리는
 *     생성 즉시 검정이다 — 그 외에는 언제나 빨강으로 들어온다.
 *
 *   violation-found  { childId, parentId, grandparentId, uncleId, uncleSide, uncleColor }
 *     빨강 아래 빨강이 걸렸다. `uncleId` 는 그 자리가 비어 있으면 `null` 이고,
 *     그때 `uncleColor` 는 관례대로 `'black'` 이다 (빈 자리는 검정으로 친다).
 *
 *   recolor  { changes: Array<{ id, color }>, reason }
 *     색만 바꿔 위반을 푼다(또는 뿌리 불변식을 되돌린다). `reason` 별로
 *     `changes` 의 순서가 고정된다 — projector 가 캡션에 쓸 역할을 이 순서로
 *     읽는다.
 *       'siblingRecolor' → changes = [parent, uncle, grandparent] (위반의 부모/삼촌을
 *                           검정으로, 조부모를 빨강으로 — 사례 1)
 *       'rootFix'        → changes = [root] 단일 원소 (뿌리는 항상 검정이라는
 *                           불변식을 되돌림)
 *       'rotationSwap'   → changes = [riser, sunk] — 회전 뒤 두 노드의 색을
 *                           맞바꾼다 (riser 는 회전으로 위로 올라온 노드,
 *                           sunk 는 그 자리에서 내려간 옛 축)
 *
 *   rotate  { pivot, edges: Array<{ id, parentId, side }> }
 *     `pivot` 을 축으로 회전한다. `edges` 는 부모/자식 관계가 실제로 바뀐
 *     노드만 담는다 — `edges[0]` 이 항상 riser(위로 올라오는 노드)다.
 *
 *   rewind  {}
 *     대화형 재현을 새로 시작할 때 화면을 비운다.
 *
 * `done` 은 쓰지 않는다 — 완료 표시는 control-bar 의 onComplete 훅이 이미
 * 처리하고, 이 조각은 자동 재생이 끝나면 곧장 대화형 재현으로 넘어가
 * "끝났다" 는 상태를 화면에 별도로 표시하지 않는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RecolorThenRotateData = {
  type: 'recolor-then-rotate';
  values: number[];
  stepMs: number;
};

type Color = 'red' | 'black';
type Side = 'L' | 'R' | null;

class RBNode {
  readonly id: string;
  readonly value: number;
  color: Color = 'red';
  parent: RBNode | null = null;
  left: RBNode | null = null;
  right: RBNode | null = null;

  constructor(value: number) {
    this.value = value;
    this.id = String(value);
  }
}

class RBTree {
  root: RBNode | null = null;
}

function sideOf(n: RBNode): Side {
  if (!n.parent) return null;
  return n.parent.left === n ? 'L' : 'R';
}

/** 값 비교로 내려가 이진 탐색 트리 자리에 새 노드를 붙인다. 뿌리는 검정, 그 외는 빨강. */
function bstInsert(tree: RBTree, value: number): RBNode {
  const node = new RBNode(value);
  if (!tree.root) {
    node.color = 'black';
    tree.root = node;
    return node;
  }
  node.color = 'red';
  let cur = tree.root;
  for (;;) {
    if (value < cur.value) {
      if (!cur.left) {
        cur.left = node;
        node.parent = cur;
        return node;
      }
      cur = cur.left;
    } else {
      if (!cur.right) {
        cur.right = node;
        node.parent = cur;
        return node;
      }
      cur = cur.right;
    }
  }
}

/** 왼쪽 자식 x 를 부모 y 자리로 올리는 오른쪽 회전. y.left 가 x 여야 한다. */
function rotateRight(tree: RBTree, y: RBNode): { pivot: RBNode; riser: RBNode } {
  const x = y.left as RBNode;
  y.left = x.right;
  if (x.right) x.right.parent = y;
  x.parent = y.parent;
  if (!y.parent) tree.root = x;
  else if (y.parent.left === y) y.parent.left = x;
  else y.parent.right = x;
  x.right = y;
  y.parent = x;
  return { pivot: y, riser: x };
}

/** 오른쪽 자식 x 를 부모 y 자리로 올리는 왼쪽 회전. y.right 가 x 여야 한다. */
function rotateLeft(tree: RBTree, y: RBNode): { pivot: RBNode; riser: RBNode } {
  const x = y.right as RBNode;
  y.right = x.left;
  if (x.left) x.left.parent = y;
  x.parent = y.parent;
  if (!y.parent) tree.root = x;
  else if (y.parent.left === y) y.parent.left = x;
  else y.parent.right = x;
  x.left = y;
  y.parent = x;
  return { pivot: y, riser: x };
}

/** 회전 뒤 부모/자식이 바뀐 노드만 골라 rotate 이벤트의 edges 로 만든다. riser 가 [0]. */
function edgesAfterRotation(riser: RBNode, pivot: RBNode, movedChild: RBNode | null) {
  const edges: { id: string; parentId: string | null; side: Side }[] = [
    { id: riser.id, parentId: riser.parent?.id ?? null, side: sideOf(riser) },
    { id: pivot.id, parentId: pivot.parent?.id ?? null, side: sideOf(pivot) },
  ];
  if (movedChild) edges.push({ id: movedChild.id, parentId: movedChild.parent?.id ?? null, side: sideOf(movedChild) });
  return edges;
}

/**
 * 취소 검사 + 걸음 지연. 자동 재생 구간에서만 쓴다.
 *
 * `false` 는 "취소됐으니 더 나아가지 말라" 는 뜻이다. 이것을 버리면 reset /
 * destroy 뒤에도 남은 삽입이 지연 없이 연달아 emit 된다 (C8).
 */
async function pause(rctx: ReactiveContext<RecolorThenRotateData>): Promise<boolean> {
  if (rctx.cancelled) return false;
  await rctx.sleep(rctx.data.stepMs);
  return !rctx.cancelled;
}

/**
 * 한 값을 넣고 위반이 있으면 수선한다. `gate` 가 각 이벤트를 몇 초 만에 보여줄지
 * (자동 재생) 아니면 사용자의 다음 `advance` 입력을 기다릴지 (대화형 재현) 를
 * 정한다 — 두 모드가 같은 알고리즘 코드를 공유하는 이유다.
 */
async function insertAndFix(
  rctx: ReactiveContext<RecolorThenRotateData>,
  tree: RBTree,
  value: number,
  gate: Gate,
): Promise<boolean> {
  if (!(await gate())) return false;
  const node = bstInsert(tree, value);
  await rctx.emit({
    type: 'insert-node',
    target: `node:${node.id}`,
    payload: { id: node.id, value: node.value, color: node.color, parentId: node.parent?.id ?? null, side: sideOf(node) },
  });

  let z = node;
  while (z.parent && z.parent.color === 'red') {
    if (rctx.cancelled) return false;
    const parent = z.parent;
    const grandparent = parent.parent as RBNode; // 부모가 빨강이면 뿌리가 아니므로 조부모가 있다.
    const parentSide = sideOf(parent);
    const uncle = parentSide === 'L' ? grandparent.right : grandparent.left;
    const uncleColor: Color = uncle ? uncle.color : 'black';
    const uncleSide: Side = parentSide === 'L' ? 'R' : 'L';

    if (!(await gate())) return false;
    await rctx.emit({
      type: 'violation-found',
      target: [`node:${z.id}`, `node:${parent.id}`],
      payload: {
        childId: z.id,
        parentId: parent.id,
        grandparentId: grandparent.id,
        uncleId: uncle?.id ?? null,
        uncleSide,
        uncleColor,
      },
    });

    if (uncleColor === 'red') {
      // 사례 1 — 옆자리(삼촌)도 빨강. 색만 바꿔 두 겹 빨강을 없앤다.
      parent.color = 'black';
      uncle!.color = 'black';
      grandparent.color = 'red';
      if (!(await gate())) return false;
      await rctx.emit({
        type: 'recolor',
        target: [`node:${parent.id}`, `node:${uncle!.id}`, `node:${grandparent.id}`],
        payload: {
          changes: [
            { id: parent.id, color: 'black' },
            { id: uncle!.id, color: 'black' },
            { id: grandparent.id, color: 'red' },
          ],
          reason: 'siblingRecolor',
        },
      });
      z = grandparent;
      continue;
    }

    // 사례 2/3 — 옆자리가 비어 있거나 검정. 색칠로는 안 풀리니 돈다.
    let riser: RBNode;
    let pivot: RBNode;
    if (parentSide === 'L') {
      if (sideOf(z) === 'R') {
        const step = rotateLeft(tree, parent);
        z = step.pivot; // 꺾인 경우 축을 옛 부모로 옮겨 다음 회전을 곧은 모양으로 만든다.
      }
      const p = z.parent as RBNode;
      const g = p.parent as RBNode;
      p.color = 'black';
      g.color = 'red';
      const result = rotateRight(tree, g);
      riser = result.riser;
      pivot = result.pivot;
    } else {
      if (sideOf(z) === 'L') {
        const step = rotateRight(tree, parent);
        z = step.pivot;
      }
      const p = z.parent as RBNode;
      const g = p.parent as RBNode;
      p.color = 'black';
      g.color = 'red';
      const result = rotateLeft(tree, g);
      riser = result.riser;
      pivot = result.pivot;
    }
    // 회전 직후 riser 가 남긴 자리(T2 서브트리)만 pivot 쪽에 옮겨 붙는다.
    // 오른쪽 회전이면 pivot.left, 왼쪽 회전이면 pivot.right 가 그 자리다.
    const movedChild = parentSide === 'L' ? pivot.left : pivot.right;
    if (!(await gate())) return false;
    await rctx.emit({
      type: 'rotate',
      target: `node:${pivot.id}`,
      payload: { pivot: pivot.id, edges: edgesAfterRotation(riser, pivot, movedChild) },
    });
    if (!(await gate())) return false;
    await rctx.emit({
      type: 'recolor',
      target: [`node:${riser.id}`, `node:${pivot.id}`],
      payload: {
        changes: [
          { id: riser.id, color: riser.color },
          { id: pivot.id, color: pivot.color },
        ],
        reason: 'rotationSwap',
      },
    });
    break;
  }

  if (tree.root && tree.root.color !== 'black') {
    tree.root.color = 'black';
    if (!(await gate())) return false;
    await rctx.emit({
      type: 'recolor',
      target: `node:${tree.root.id}`,
      payload: { changes: [{ id: tree.root.id, color: 'black' }], reason: 'rootFix' },
    });
  }

  return true;
}

/** 걸음과 걸음 사이의 문. `false` 면 취소된 것이다. */
type Gate = () => Promise<boolean>;

/** gate 의 첫 호출은 공짜로 통과시킨다 — 그 몫은 이미 바깥에서 지불됐다. */
function makeGate(rctx: ReactiveContext<RecolorThenRotateData>, boundary: () => Promise<boolean>): Gate {
  let first = true;
  return async () => {
    if (first) {
      first = false;
      return !rctx.cancelled;
    }
    return boundary();
  };
}

export async function recolorThenRotate(ctx: FacetContext<RecolorThenRotateData>): Promise<void> {
  const rctx = ctx as ReactiveContext<RecolorThenRotateData>;
  const { values } = rctx.data;

  // 자동 재생 — 걸음마다 stepMs 만큼 쉰다.
  const autoTree = new RBTree();
  const autoGate = makeGate(rctx, () => pause(rctx));
  for (const v of values) {
    if (rctx.cancelled) return;
    if (!(await insertAndFix(rctx, autoTree, v, autoGate))) return;
  }

  // 대화형 재현 — 처음 누르는 advance 가 되감고 첫 걸음까지 보인다. 그 뒤로는
  // 누를 때마다 한 이벤트씩 나아가고, 마지막 이벤트 다음 누름은 새로 되감는다.
  while (!rctx.cancelled) {
    await rctx.waitForInput();
    await rctx.emit({ type: 'rewind' });
    const tree = new RBTree();
    const gate = makeGate(rctx, async () => {
      await rctx.waitForInput();
      return !rctx.cancelled;
    });
    for (const v of values) {
      if (rctx.cancelled) return;
      if (!(await insertAndFix(rctx, tree, v, gate))) return;
    }
  }
}
