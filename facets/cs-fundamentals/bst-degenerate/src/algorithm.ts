/**
 * bst-degenerate — 편향 트리 조각(piece) algorithm.
 *
 * 같은 값 여섯 개를 두 순서로 실제 BST 삽입 규칙(작으면 왼쪽, 크면 오른쪽)에
 * 따라 넣어 두 나무를 기른다. `orderA` 는 오름차순이라 매번 지금 노드보다
 * 커서 오른쪽으로만 내려가고, `orderB` 는 좌우를 번갈아 골라 옆으로 퍼진다.
 * 두 나무를 다 기른 뒤에는 같은 값(`searchValue`)을 실제로 찾아 내려가며
 * 비교 횟수를 세어, 모양 차이가 곧 탐색 비용 차이로 이어짐을 보인다.
 *
 * 전체 이벤트 시퀀스는 `buildPlan()` 이 데이터를 순회해 계산한 결과다 —
 * 사람이 걸음을 배열로 적어 두른 것이 아니다 (S-piece). `emitStep()` 은 그
 * 계획의 각 항목마다 리터럴 `type` 으로 `ctx.emit` 을 한 번씩 호출한다 (C2).
 *
 * ── 확장 이벤트 (C2) ─────────────────────────────────────────────────
 *
 * `tree-insert`
 *   payload: { tree: 'a'|'b'; id: string; value: number;
 *              parentId: string | null; side: 'left'|'right'|null; depth: number }
 *   새 노드가 자리를 얻는다. `parentId` 가 null 이면 그 나무의 뿌리.
 *
 * `tree-compare`
 *   payload: { tree: 'a'|'b'; nodeId: string; nodeValue: number;
 *              incoming: number; direction: 'left'|'right' }
 *   삽입 중 커서가 `nodeId` 에서 `incoming` 값과 비교해 `direction` 으로 내려간다.
 *
 * `tree-search-compare`
 *   payload: { tree: 'a'|'b'; nodeId: string; nodeValue: number;
 *              target: number; direction: 'left'|'right'|'match' }
 *   완성된 나무에서 `target`(searchValue)을 찾는 커서 이동. `'match'` 면 발견.
 *
 * `tree-search-done`
 *   payload: { tree: 'a'|'b'; comparisons: number; height: number }
 *   해당 나무의 탐색이 끝났다. `comparisons`·`height` 는 이번 실행에서 실제로
 *   센 값 — 화면에 쓰는 수는 지어내지 않는다 (S-piece).
 *
 * `tree-conclusion`
 *   payload: {}
 *   두 나무를 다 기르고 찾아본 뒤 마무리 캡션으로 넘어가라는 신호.
 *
 * `rewind`
 *   payload: {}
 *   자동 재생이 끝난 뒤 첫 `advance` 입력에서, 처음으로 되감을 때 발신한다
 *   (S-piece 관례). silent 아님 — 화면이 실제로 비워지는 시각 변화이기 때문.
 *
 * 표준 `done` 은 쓰지 않는다 — 이 조각에는 컨트롤바의 `setComplete` 로 이어질
 * "완주" 개념이 없다. 자동 재생이 끝난 뒤에도 `advance` 로 계속 다시 짚어볼 수
 * 있어 "끝"이 고정된 종점이 아니기 때문이다. 마무리는 `tree-conclusion` 하나로
 * 충분하다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BstDegenerateData = {
  type: 'bst-degenerate';
  /** 오름차순으로 넣는 순서 — 항상 오른쪽으로만 뻗어 사슬이 된다. */
  orderA: number[];
  /** 좌우를 번갈아 골라 옆으로 퍼지는 순서. */
  orderB: number[];
  /** 두 나무에서 공통으로 찾아볼 값. */
  searchValue: number;
  /** 걸음 사이 대기 시간(ms). */
  stepMs: number;
};

type TreeId = 'a' | 'b';
type Side = 'left' | 'right';

type NodeRec = {
  id: string;
  value: number;
  left: string | null;
  right: string | null;
  depth: number;
};

type PlanStep =
  | { kind: 'insert'; tree: TreeId; id: string; value: number; parentId: string | null; side: Side | null; depth: number }
  | { kind: 'compare'; tree: TreeId; nodeId: string; nodeValue: number; incoming: number; direction: Side }
  | { kind: 'search-compare'; tree: TreeId; nodeId: string; nodeValue: number; target: number; direction: Side | 'match' }
  | { kind: 'search-done'; tree: TreeId; comparisons: number; height: number }
  | { kind: 'conclusion' };

/**
 * 한 값을 BST 삽입 규칙으로 내려보내며, 지나친 비교와 최종 삽입을 계획 항목
 * 으로 쌓는다. `nodes` 를 in-place 로 갱신한다 (실제 삽입 수행).
 */
function insertOne(tree: TreeId, value: number, nodes: Map<string, NodeRec>, rootId: string | null): {
  steps: PlanStep[];
  rootId: string;
} {
  const id = `${tree}-${value}`;
  const steps: PlanStep[] = [];

  if (rootId === null) {
    nodes.set(id, { id, value, left: null, right: null, depth: 0 });
    steps.push({ kind: 'insert', tree, id, value, parentId: null, side: null, depth: 0 });
    return { steps, rootId: id };
  }

  let curId = rootId;
  for (;;) {
    const cur = nodes.get(curId);
    if (!cur) break;
    const side: Side = value > cur.value ? 'right' : 'left';
    steps.push({ kind: 'compare', tree, nodeId: cur.id, nodeValue: cur.value, incoming: value, direction: side });
    const nextId = side === 'right' ? cur.right : cur.left;
    if (nextId === null) {
      const depth = cur.depth + 1;
      nodes.set(id, { id, value, left: null, right: null, depth });
      if (side === 'right') cur.right = id;
      else cur.left = id;
      steps.push({ kind: 'insert', tree, id, value, parentId: cur.id, side, depth });
      break;
    }
    curId = nextId;
  }
  return { steps, rootId };
}

/** order 를 순서대로 삽입하며, 값 하나당 계획 항목 묶음(compare* + insert)을 낸다. */
function buildInsertGroups(tree: TreeId, order: number[], nodes: Map<string, NodeRec>): PlanStep[][] {
  const groups: PlanStep[][] = [];
  let rootId: string | null = null;
  for (const value of order) {
    const result = insertOne(tree, value, nodes, rootId);
    rootId = result.rootId;
    groups.push(result.steps);
  }
  return groups;
}

/** 두 나무의 값별 삽입 묶음을 값 순서 기준으로 번갈아 이어 붙인다 — 두 나무가 동시에 자라는 것을 보인다. */
function interleaveGroups(a: PlanStep[][], b: PlanStep[][]): PlanStep[] {
  const out: PlanStep[] = [];
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i]) out.push(...a[i]);
    if (b[i]) out.push(...b[i]);
  }
  return out;
}

/** 완성된 나무에서 target 을 실제로 찾아 내려가며 비교 횟수를 센다. */
function buildSearchSteps(tree: TreeId, target: number, nodes: Map<string, NodeRec>, rootId: string): PlanStep[] {
  const steps: PlanStep[] = [];
  let comparisons = 0;
  let curId: string | null = rootId;
  while (curId !== null) {
    const cur = nodes.get(curId);
    if (!cur) break;
    comparisons += 1;
    if (cur.value === target) {
      steps.push({ kind: 'search-compare', tree, nodeId: cur.id, nodeValue: cur.value, target, direction: 'match' });
      curId = null;
      break;
    }
    const direction: Side = target > cur.value ? 'right' : 'left';
    steps.push({ kind: 'search-compare', tree, nodeId: cur.id, nodeValue: cur.value, target, direction });
    curId = direction === 'right' ? cur.right : cur.left;
  }
  let height = 0;
  for (const n of nodes.values()) height = Math.max(height, n.depth + 1);
  steps.push({ kind: 'search-done', tree, comparisons, height });
  return steps;
}

/** 전체 계획 — 데이터 순회의 결과이므로 배열로 두어도 무방하다 (S-piece). */
function buildPlan(data: BstDegenerateData): PlanStep[] {
  const nodesA = new Map<string, NodeRec>();
  const nodesB = new Map<string, NodeRec>();
  const groupsA = buildInsertGroups('a', data.orderA, nodesA);
  const groupsB = buildInsertGroups('b', data.orderB, nodesB);
  const growSteps = interleaveGroups(groupsA, groupsB);

  const firstA = groupsA[0]?.[0];
  const firstB = groupsB[0]?.[0];
  if (!firstA || firstA.kind !== 'insert' || !firstB || firstB.kind !== 'insert') return growSteps;

  const searchA = buildSearchSteps('a', data.searchValue, nodesA, firstA.id);
  const searchB = buildSearchSteps('b', data.searchValue, nodesB, firstB.id);

  return [...growSteps, ...searchA, ...searchB, { kind: 'conclusion' }];
}

/** 계획 한 항목을 리터럴 `type` 의 `ctx.emit` 호출로 옮긴다 (C2). */
async function emitStep(ctx: ReactiveContext<BstDegenerateData>, step: PlanStep): Promise<void> {
  switch (step.kind) {
    case 'insert':
      await ctx.emit({
        type: 'tree-insert',
        target: `node:${step.id}`,
        payload: {
          tree: step.tree,
          id: step.id,
          value: step.value,
          parentId: step.parentId,
          side: step.side,
          depth: step.depth,
        },
      });
      return;
    case 'compare':
      await ctx.emit({
        type: 'tree-compare',
        target: `node:${step.nodeId}`,
        payload: {
          tree: step.tree,
          nodeId: step.nodeId,
          nodeValue: step.nodeValue,
          incoming: step.incoming,
          direction: step.direction,
        },
      });
      return;
    case 'search-compare':
      await ctx.emit({
        type: 'tree-search-compare',
        target: `node:${step.nodeId}`,
        payload: {
          tree: step.tree,
          nodeId: step.nodeId,
          nodeValue: step.nodeValue,
          target: step.target,
          direction: step.direction,
        },
      });
      return;
    case 'search-done':
      await ctx.emit({
        type: 'tree-search-done',
        payload: { tree: step.tree, comparisons: step.comparisons, height: step.height },
      });
      return;
    case 'conclusion':
      await ctx.emit({ type: 'tree-conclusion', payload: {} });
      return;
  }
}

/** 취소 검사와 `ctx.sleep` 을 한데 묶는다 (S-piece). */
async function pause(ctx: ReactiveContext<BstDegenerateData>, ms: number): Promise<boolean> {
  if (ctx.cancelled) return false;
  return ctx.sleep(ms);
}

export async function bstDegenerate(ctx: FacetContext<BstDegenerateData>): Promise<void> {
  const rctx = ctx as ReactiveContext<BstDegenerateData>;
  const plan = buildPlan(rctx.data);
  const stepMs = rctx.data.stepMs;

  // 자동 재생 — 계획을 순서대로 한 걸음씩 보인다.
  for (const step of plan) {
    if (rctx.cancelled) return;
    await emitStep(rctx, step);
    if (!(await pause(rctx, stepMs))) return;
  }

  // 자동 재생이 끝난 뒤 — advance 로 한 걸음씩 다시 짚어본다. 매 바퀴의
  // 첫 걸음 전에는 되감아(rewind) 처음 상태부터 보인다.
  let index = 0;
  for (;;) {
    if (rctx.cancelled) return;
    const input = await rctx.waitForInput();
    if (rctx.cancelled) return;
    if (input.type !== 'advance') continue;
    if (index === 0) {
      await rctx.emit({ type: 'rewind', payload: {} });
      if (rctx.cancelled) return;
    }
    await emitStep(rctx, plan[index]);
    index = (index + 1) % plan.length;
  }
}
