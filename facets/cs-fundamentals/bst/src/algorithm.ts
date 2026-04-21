/**
 * BST (이진 탐색 트리) 알고리즘 — "매 비교마다 세계의 절반을 포기" 하는
 * 단호한 탐색. 표준 `fold` 이벤트로 패배 서브트리 전체를 한 프레임에
 * 접고, `unfold` 로 연산 끝에서 해제한다.
 *
 * 식별자:
 *   - 노드: `node:<id>`  (id = 'n' + 단조 카운터)
 *   - 간선: `edge:<parent>-><child>`
 *
 * 이벤트 (표준):
 *   - phase (kind: 'compare-node' | 'descend-left' | 'descend-right' |
 *            'reach-leaf-miss' | 'hit' | 'insert-new' |
 *            'delete-start' | 'delete-leaf' | 'delete-one-child' |
 *            'delete-successor-descend' | 'delete-value-move', silent)
 *   - mark     target: node  payload: { kind: 'cursor' | 'aux-cursor' |
 *                                       'cursor-clear' | 'aux-cursor-clear' |
 *                                       'matched' }
 *   - state-changed target: node payload: { state: 'visited' | 'default' }
 *   - fold     target: node   payload: { rootId, side, nodes[] }
 *   - unfold   target: node   payload: { rootId, side? }
 *   - append   target: node   payload: { parentId, side: 'L'|'R', id, value }
 *   - highlight target: edge  payload: { from, to }
 *   - done
 *
 * 이벤트 (facet-local, 본 파일 JSDoc 에만 정의):
 *   - compare       silent:false  payload: { key, nodeId, nodeValue, result: '<'|'>'|'=' }
 *                   HUD 에 `[키] ? [값]` → `<`/`>` 로 갱신.
 *   - probe         silent:false  payload: { parentId, side: 'L'|'R', key }
 *                   miss 시 빈 자식 자리에 유령 원 표시.
 *   - clear-probe   silent:true   유령 원 소거.
 *   - value-move    silent:false  payload: { fromId, toId, value }
 *                   두 자식 삭제 시 후계자 값이 대상 노드로 이사.
 *   - remove-node   silent:true   payload: { id, replacedBy: id | null }
 *                   구조적 제거 — replacedBy null 이면 슬롯 비움, 있으면 자식 승격.
 *   - op-reset      silent:true   연산 끝 — projector 가 폴드/커서/방문 상태 초기화.
 *
 * 메트릭:
 *   'compare-count' | 'insert-count' | 'search-hit-count' |
 *   'search-miss-count' | 'delete-count' | 'rejected-duplicate'
 */

import type { FacetContext } from '@facet/core/runtime';

export type BstOperation =
  | { op: 'search'; value: number }
  | { op: 'insert'; value: number }
  | { op: 'delete'; value: number };

export type BstInitialData = {
  type: 'bst';
  initialValues: number[];
  scenario: BstOperation[];
};

type BstNode = {
  id: string;
  value: number;
  left: BstNode | null;
  right: BstNode | null;
};

type FoldSide = 'L' | 'R';

function edgeKey(p: string, c: string): string {
  return `${p}->${c}`;
}

function collectIds(n: BstNode): string[] {
  const out: string[] = [];
  (function walk(m: BstNode) {
    out.push(m.id);
    if (m.left) walk(m.left);
    if (m.right) walk(m.right);
  })(n);
  return out;
}

/**
 * 순수 삽입 — id 카운터를 받아 새 노드 id 를 결정적으로 발급.
 * 중복 값은 reject 하고 insertedId=null 반환.
 */
function pureInsert(
  root: BstNode | null,
  value: number,
  nextId: number,
): { newRoot: BstNode; insertedId: string | null; parentId: string | null; side: FoldSide | null; nextId: number } {
  const makeNode = (): BstNode => ({ id: `n${nextId}`, value, left: null, right: null });
  if (!root) {
    const nn = makeNode();
    return { newRoot: nn, insertedId: nn.id, parentId: null, side: null, nextId: nextId + 1 };
  }
  let cur = root;
  while (true) {
    if (value === cur.value) {
      return { newRoot: root, insertedId: null, parentId: cur.id, side: null, nextId };
    }
    if (value < cur.value) {
      if (!cur.left) {
        cur.left = makeNode();
        return { newRoot: root, insertedId: cur.left.id, parentId: cur.id, side: 'L', nextId: nextId + 1 };
      }
      cur = cur.left;
    } else {
      if (!cur.right) {
        cur.right = makeNode();
        return { newRoot: root, insertedId: cur.right.id, parentId: cur.id, side: 'R', nextId: nextId + 1 };
      }
      cur = cur.right;
    }
  }
}

/** 초기 트리를 결정적으로 구축 (projector 와 algorithm 이 동일하게 사용). */
export function computeInitialBst(initialValues: number[]): {
  root: BstNode | null;
  nextId: number;
} {
  let root: BstNode | null = null;
  let nextId = 0;
  for (const v of initialValues) {
    const r = pureInsert(root, v, nextId);
    root = r.newRoot;
    nextId = r.nextId;
  }
  return { root, nextId };
}

/** leaf → 0 자식, one-child → 남은 자식, two-child → 두 자식 보유. */
function childrenCount(n: BstNode): 0 | 1 | 2 {
  const c = (n.left ? 1 : 0) + (n.right ? 1 : 0);
  return c as 0 | 1 | 2;
}

/** 우측 서브트리에서 최소 노드 (후계자) 를 찾는 순수 경로 — id 경로를 반환. */
function findSuccessorPath(rightChild: BstNode): BstNode[] {
  const path: BstNode[] = [];
  let cur: BstNode | null = rightChild;
  while (cur) {
    path.push(cur);
    cur = cur.left;
  }
  return path;
}

/**
 * 알고리즘 본체 — 시나리오 전체를 순서대로 실행.
 * 각 op 끝에서 `op-reset` 으로 projector 가 누적 상태를 정리하게 한다.
 */
export async function bst(ctx: FacetContext<BstInitialData>): Promise<void> {
  const { scenario } = ctx.data;
  const init = computeInitialBst(ctx.data.initialValues);
  let root: BstNode | null = init.root;
  let nextId = init.nextId;

  for (const op of scenario) {
    if (ctx.cancelled) return;

    if (op.op === 'search') {
      await runSearch(ctx, root, op.value);
    } else if (op.op === 'insert') {
      const after = await runInsert(ctx, root, op.value, nextId);
      root = after.root;
      nextId = after.nextId;
    } else if (op.op === 'delete') {
      const after = await runDelete(ctx, root, op.value);
      root = after.root;
    }

    if (ctx.cancelled) return;
    await ctx.emit({ type: 'op-reset', silent: true });
  }

  if (ctx.cancelled) return;
  await ctx.emit({ type: 'done' });
}

async function runSearch(
  ctx: FacetContext<BstInitialData>,
  root: BstNode | null,
  key: number,
): Promise<void> {
  if (!root) {
    ctx.metric('search-miss-count', 'inc');
    return;
  }
  let cur: BstNode | null = root;
  while (cur) {
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'phase', payload: { phase: 'compare-node' }, silent: true });
    await ctx.emit({ type: 'mark', target: `node:${cur.id}`, payload: { kind: 'cursor' } });

    const result: '<' | '>' | '=' = key < cur.value ? '<' : key > cur.value ? '>' : '=';
    await ctx.emit({
      type: 'compare',
      payload: { key: String(key), nodeId: cur.id, nodeValue: String(cur.value), result },
    });
    ctx.metric('compare-count', 'inc');

    if (result === '=') {
      await ctx.emit({ type: 'phase', payload: { phase: 'hit' }, silent: true });
      await ctx.emit({ type: 'mark', target: `node:${cur.id}`, payload: { kind: 'matched' } });
      ctx.metric('search-hit-count', 'inc');
      return;
    }

    const winSide: FoldSide = result === '<' ? 'L' : 'R';
    const loseSide: FoldSide = result === '<' ? 'R' : 'L';
    const loseChild = loseSide === 'L' ? cur.left : cur.right;
    if (loseChild) {
      await ctx.emit({
        type: 'fold',
        target: `node:${cur.id}`,
        payload: { rootId: cur.id, side: loseSide, nodes: collectIds(loseChild) },
      });
    }

    await ctx.emit({
      type: 'phase',
      payload: { phase: winSide === 'L' ? 'descend-left' : 'descend-right' },
      silent: true,
    });
    await ctx.emit({
      type: 'state-changed',
      target: `node:${cur.id}`,
      payload: { state: 'visited' },
    });

    const nextNode: BstNode | null = winSide === 'L' ? cur.left : cur.right;
    if (!nextNode) {
      await ctx.emit({ type: 'phase', payload: { phase: 'reach-leaf-miss' }, silent: true });
      await ctx.emit({
        type: 'probe',
        payload: { parentId: cur.id, side: winSide, key: String(key) },
      });
      ctx.metric('search-miss-count', 'inc');
      await ctx.emit({ type: 'clear-probe', silent: true });
      return;
    }

    await ctx.emit({
      type: 'highlight',
      target: `edge:${edgeKey(cur.id, nextNode.id)}`,
      payload: { from: cur.id, to: nextNode.id },
    });
    cur = nextNode;
  }
}

async function runInsert(
  ctx: FacetContext<BstInitialData>,
  root: BstNode | null,
  key: number,
  nextId: number,
): Promise<{ root: BstNode | null; nextId: number }> {
  if (!root) {
    const newNode: BstNode = { id: `n${nextId}`, value: key, left: null, right: null };
    await ctx.emit({ type: 'phase', payload: { phase: 'insert-new' }, silent: true });
    await ctx.emit({
      type: 'append',
      target: `node:${newNode.id}`,
      payload: { parentId: null, side: null, id: newNode.id, value: key },
    });
    ctx.metric('insert-count', 'inc');
    return { root: newNode, nextId: nextId + 1 };
  }

  let cur: BstNode = root;
  while (true) {
    if (ctx.cancelled) return { root, nextId };
    await ctx.emit({ type: 'phase', payload: { phase: 'compare-node' }, silent: true });
    await ctx.emit({ type: 'mark', target: `node:${cur.id}`, payload: { kind: 'cursor' } });

    if (key === cur.value) {
      await ctx.emit({
        type: 'compare',
        payload: { key: String(key), nodeId: cur.id, nodeValue: String(cur.value), result: '=' },
      });
      ctx.metric('compare-count', 'inc');
      ctx.metric('rejected-duplicate', 'inc');
      return { root, nextId };
    }

    const result: '<' | '>' = key < cur.value ? '<' : '>';
    await ctx.emit({
      type: 'compare',
      payload: { key: String(key), nodeId: cur.id, nodeValue: String(cur.value), result },
    });
    ctx.metric('compare-count', 'inc');

    const winSide: FoldSide = result === '<' ? 'L' : 'R';
    const loseSide: FoldSide = result === '<' ? 'R' : 'L';
    const loseChild = loseSide === 'L' ? cur.left : cur.right;
    if (loseChild) {
      await ctx.emit({
        type: 'fold',
        target: `node:${cur.id}`,
        payload: { rootId: cur.id, side: loseSide, nodes: collectIds(loseChild) },
      });
    }
    await ctx.emit({
      type: 'phase',
      payload: { phase: winSide === 'L' ? 'descend-left' : 'descend-right' },
      silent: true,
    });
    await ctx.emit({
      type: 'state-changed',
      target: `node:${cur.id}`,
      payload: { state: 'visited' },
    });

    const nextNode = winSide === 'L' ? cur.left : cur.right;
    if (!nextNode) {
      await ctx.emit({ type: 'phase', payload: { phase: 'reach-leaf-miss' }, silent: true });
      await ctx.emit({
        type: 'probe',
        payload: { parentId: cur.id, side: winSide, key: String(key) },
      });
      const newNode: BstNode = { id: `n${nextId}`, value: key, left: null, right: null };
      if (winSide === 'L') cur.left = newNode;
      else cur.right = newNode;
      await ctx.emit({ type: 'phase', payload: { phase: 'insert-new' }, silent: true });
      await ctx.emit({
        type: 'append',
        target: `node:${newNode.id}`,
        payload: { parentId: cur.id, side: winSide, id: newNode.id, value: key },
      });
      ctx.metric('insert-count', 'inc');
      return { root, nextId: nextId + 1 };
    }

    await ctx.emit({
      type: 'highlight',
      target: `edge:${edgeKey(cur.id, nextNode.id)}`,
      payload: { from: cur.id, to: nextNode.id },
    });
    cur = nextNode;
  }
}

async function runDelete(
  ctx: FacetContext<BstInitialData>,
  root: BstNode | null,
  key: number,
): Promise<{ root: BstNode | null }> {
  if (!root) return { root };

  // 1. 대상 노드를 찾아가며 비교/폴드 (search 와 동일한 리듬).
  let parent: BstNode | null = null;
  let parentSide: FoldSide | null = null;
  let cur: BstNode | null = root;
  while (cur && cur.value !== key) {
    if (ctx.cancelled) return { root };
    await ctx.emit({ type: 'phase', payload: { phase: 'compare-node' }, silent: true });
    await ctx.emit({ type: 'mark', target: `node:${cur.id}`, payload: { kind: 'cursor' } });

    const result: '<' | '>' = key < cur.value ? '<' : '>';
    await ctx.emit({
      type: 'compare',
      payload: { key: String(key), nodeId: cur.id, nodeValue: String(cur.value), result },
    });
    ctx.metric('compare-count', 'inc');

    const winSide: FoldSide = result === '<' ? 'L' : 'R';
    const loseSide: FoldSide = result === '<' ? 'R' : 'L';
    const loseChild = loseSide === 'L' ? cur.left : cur.right;
    if (loseChild) {
      await ctx.emit({
        type: 'fold',
        target: `node:${cur.id}`,
        payload: { rootId: cur.id, side: loseSide, nodes: collectIds(loseChild) },
      });
    }
    await ctx.emit({
      type: 'phase',
      payload: { phase: winSide === 'L' ? 'descend-left' : 'descend-right' },
      silent: true,
    });
    await ctx.emit({
      type: 'state-changed',
      target: `node:${cur.id}`,
      payload: { state: 'visited' },
    });

    const nextNode: BstNode | null = winSide === 'L' ? cur.left : cur.right;
    if (!nextNode) return { root }; // not found — no-op
    await ctx.emit({
      type: 'highlight',
      target: `edge:${edgeKey(cur.id, nextNode.id)}`,
      payload: { from: cur.id, to: nextNode.id },
    });
    parent = cur;
    parentSide = winSide;
    cur = nextNode;
  }

  if (!cur) return { root };

  // 2. 대상 cur 에 도달. 비교 = 감지.
  await ctx.emit({ type: 'phase', payload: { phase: 'compare-node' }, silent: true });
  await ctx.emit({ type: 'mark', target: `node:${cur.id}`, payload: { kind: 'cursor' } });
  await ctx.emit({
    type: 'compare',
    payload: { key: String(key), nodeId: cur.id, nodeValue: String(cur.value), result: '=' },
  });
  ctx.metric('compare-count', 'inc');
  await ctx.emit({ type: 'phase', payload: { phase: 'delete-start' }, silent: true });

  const cc = childrenCount(cur);

  const detachFromParent = (replace: BstNode | null) => {
    if (!parent) return; // caller adjusts root
    if (parentSide === 'L') parent.left = replace;
    else parent.right = replace;
  };

  if (cc === 0) {
    // leaf 삭제.
    await ctx.emit({ type: 'phase', payload: { phase: 'delete-leaf' }, silent: true });
    await ctx.emit({
      type: 'remove-node',
      target: `node:${cur.id}`,
      silent: true,
      payload: { id: cur.id, replacedBy: null },
    });
    if (parent) detachFromParent(null);
    else root = null;
    ctx.metric('delete-count', 'inc');
    return { root };
  }

  if (cc === 1) {
    // 자식 1개 — 남은 자식 승격.
    const only = cur.left ?? cur.right!;
    await ctx.emit({ type: 'phase', payload: { phase: 'delete-one-child' }, silent: true });
    await ctx.emit({
      type: 'remove-node',
      target: `node:${cur.id}`,
      silent: true,
      payload: { id: cur.id, replacedBy: only.id },
    });
    if (parent) detachFromParent(only);
    else root = only;
    ctx.metric('delete-count', 'inc');
    return { root };
  }

  // cc === 2: 후계자 서브루틴.
  const rightChild = cur.right!;
  const succPath = findSuccessorPath(rightChild);
  // succPath[0] = rightChild, succPath[last] = 후계자 (최좌).
  await ctx.emit({ type: 'phase', payload: { phase: 'delete-successor-descend' }, silent: true });
  for (const sn of succPath) {
    if (ctx.cancelled) return { root };
    await ctx.emit({ type: 'mark', target: `node:${sn.id}`, payload: { kind: 'aux-cursor' } });
  }
  const succ = succPath[succPath.length - 1];

  // 값 이사.
  const targetId = cur.id;
  const succValue = succ.value;
  await ctx.emit({ type: 'phase', payload: { phase: 'delete-value-move' }, silent: true });
  await ctx.emit({
    type: 'value-move',
    payload: { fromId: succ.id, toId: targetId, value: String(succValue) },
  });
  cur.value = succValue;

  // 후계자 제거 (0 또는 1 자식 — left 는 항상 null).
  // 후계자의 부모 찾기.
  let sParent: BstNode = cur;
  let sSide: FoldSide = 'R';
  if (succPath.length === 1) {
    sParent = cur;
    sSide = 'R';
  } else {
    sParent = succPath[succPath.length - 2];
    sSide = 'L';
  }
  const succRight = succ.right; // 0 또는 1 자식
  if (succRight) {
    await ctx.emit({ type: 'phase', payload: { phase: 'delete-one-child' }, silent: true });
    await ctx.emit({
      type: 'remove-node',
      target: `node:${succ.id}`,
      silent: true,
      payload: { id: succ.id, replacedBy: succRight.id },
    });
    if (sSide === 'L') sParent.left = succRight;
    else sParent.right = succRight;
  } else {
    await ctx.emit({ type: 'phase', payload: { phase: 'delete-leaf' }, silent: true });
    await ctx.emit({
      type: 'remove-node',
      target: `node:${succ.id}`,
      silent: true,
      payload: { id: succ.id, replacedBy: null },
    });
    if (sSide === 'L') sParent.left = null;
    else sParent.right = null;
  }
  ctx.metric('delete-count', 'inc');
  return { root };
}

/**
 * 알고리즘과 별개로 "최종 트리 상태" 를 즉시 계산 — 테스트가 참조 가능.
 * 시나리오를 끝까지 결정적으로 실행한 결과.
 */
export function computeBstResult(initialData: BstInitialData): {
  type: 'bst-result';
  finalSize: number;
  rejectedDuplicates: number;
} {
  let { root, nextId } = computeInitialBst(initialData.initialValues);
  let rejected = 0;
  for (const op of initialData.scenario) {
    if (op.op === 'search') {
      // side effect 없음
    } else if (op.op === 'insert') {
      const r = pureInsert(root, op.value, nextId);
      if (r.insertedId === null) rejected += 1;
      root = r.newRoot;
      nextId = r.nextId;
    } else if (op.op === 'delete') {
      root = pureDelete(root, op.value);
    }
  }
  return { type: 'bst-result', finalSize: sizeOf(root), rejectedDuplicates: rejected };
}

function sizeOf(n: BstNode | null): number {
  if (!n) return 0;
  return 1 + sizeOf(n.left) + sizeOf(n.right);
}

function pureDelete(root: BstNode | null, key: number): BstNode | null {
  if (!root) return null;
  if (key < root.value) {
    root.left = pureDelete(root.left, key);
    return root;
  }
  if (key > root.value) {
    root.right = pureDelete(root.right, key);
    return root;
  }
  // match
  if (!root.left) return root.right;
  if (!root.right) return root.left;
  let s = root.right;
  while (s.left) s = s.left;
  root.value = s.value;
  root.right = pureDelete(root.right, s.value);
  return root;
}
