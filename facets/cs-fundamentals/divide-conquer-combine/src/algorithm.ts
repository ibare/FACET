/**
 * divideConquerCombine — 분할 정복의 왕복.
 *
 * 이 조각이 답하는 질문:
 *   "쪼개는 것과 합치는 것이 어떻게 한 절차인가?"
 *
 * 운동은 왕복이다. 아래로 갈라져 내려가는 것은 절반일 뿐이고, 바닥에 닿아
 * 낱개가 되면 거기서부터 되짚어 오르며 두 답이 하나로 합쳐진다. 같은 자리를
 * 두 번 지나되 내려갈 때는 **문제**를, 올라올 때는 **답**을 들고 있다.
 *
 * ── 걸음 순서
 *
 * 내려감을 층 단위로 다 보인 뒤에 올라옴을 층 단위로 보인다. 실제 재귀는
 * 깊이 우선이라 왼쪽 가지가 끝까지 내려갔다 올라온 뒤에야 오른쪽이 시작되지만,
 * 그렇게 그리면 "내려가는 동안에는 아무 답도 없다" 는 이 조각의 주장이 무너진다
 * (오른쪽이 아직 쪼개지는 중에 왼쪽에는 이미 답이 있게 된다). 층 단위로 묶는
 * 것이 이 조각의 저작 결정이며, 그 전제는 description.ts 가 밝힌다 (S-piece).
 *
 * ── 이벤트 (전부 facet 고유 확장, silent 아님)
 *
 *   seed           target `node:<id>`   payload { nodeId: string; values: number[] }
 *                  뿌리에 문제 하나가 놓인다.
 *   split          target `node:<id>`   payload { nodeId: string; depth: number; order: number;
 *                                                 leftId: string; leftValues: number[];
 *                                                 rightId: string; rightValues: number[] }
 *                  한 자리가 절반씩 두 자리로 갈라져 내려간다. order 는 몇 번째 쪼갬인지.
 *   layer-settled  target `node:<id>[]` payload { depth: number; nodes: string[] }
 *                  그 층의 잎이 한꺼번에 답이 된다 (낱개는 이미 정렬된 것이므로).
 *                  C2 의 집합 이벤트 계열(`layer-*`)에 얹은 이름 — 한 층이 동시에
 *                  전이하는 장면을 낱개 emit 으로 풀면 동시성이 훼손된다.
 *   merge          target `node:<id>`   payload { nodeId: string; depth: number; order: number;
 *                                                 leftId: string; rightId: string;
 *                                                 values: number[];
 *                                                 fromSide: string[]; fromSlot: number[] }
 *                  두 답이 부모 자리로 되짚어 올라 하나가 된다. fromSide/fromSlot 은
 *                  values[k] 가 어느 자식의 몇 번 칸에서 왔는지 — 합침의 출처이며
 *                  화면에서 값이 엇갈려 오르는 경로가 된다.
 *   merge          (depth 0) 맨 처음 쪼갠 자리의 합침. 이 조각의 요점.
 *   rewind         payload 없음. 자동 재생이 끝난 뒤 advance 로 처음부터 되짚을 때.
 *   done           payload { splits: number; merges: number; values: number[] }
 *
 * 메트릭은 없다 — 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DivideConquerCombineData = {
  type: 'divide-conquer-combine';
  /** 쪼갤 값. 절반씩 갈라 내려가고 되짚어 오르며 합친다. */
  values: number[];
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이라 선언에 둔다 (S-piece). */
  stepMs: number;
};

/** 재귀 나무의 한 자리. 내려갈 때 problem 을, 올라올 때 answer 를 들고 있다. */
export type DcNode = {
  id: string;
  depth: number;
  /** 같은 깊이에서 왼쪽부터 센 자리 번호. */
  index: number;
  problem: number[];
  answer: number[];
  left: DcNode | null;
  right: DcNode | null;
};

export type DcSplitRecord = { id: string; from: number[]; left: number[]; right: number[] };
export type DcMergeRecord = { id: string; left: number[]; right: number[]; result: number[] };

export type DivideConquerPlan = {
  /** 내려가는 순서 (층 단위). */
  splits: DcSplitRecord[];
  /** 올라오는 순서 (깊은 층부터). */
  merges: DcMergeRecord[];
  result: number[];
};

const ROOT_ID = 'r';
const DEFAULT_STEP_MS = 750;

/** 줄 선 둘을 하나로. 어느 칸에서 왔는지도 함께 낸다 — 그것이 올라오는 경로다. */
function combine(
  left: number[],
  right: number[],
): { values: number[]; fromSide: string[]; fromSlot: number[] } {
  const values: number[] = [];
  const fromSide: string[] = [];
  const fromSlot: number[] = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] <= right[j]) {
      values.push(left[i]);
      fromSide.push('L');
      fromSlot.push(i);
      i += 1;
    } else {
      values.push(right[j]);
      fromSide.push('R');
      fromSlot.push(j);
      j += 1;
    }
  }
  while (i < left.length) {
    values.push(left[i]);
    fromSide.push('L');
    fromSlot.push(i);
    i += 1;
  }
  while (j < right.length) {
    values.push(right[j]);
    fromSide.push('R');
    fromSlot.push(j);
    j += 1;
  }
  return { values, fromSide, fromSlot };
}

/** 절반씩 갈라 나무를 세운다. 답은 올라오면서 정해지므로 자식 답의 합침이다. */
function buildTree(values: number[], id: string, depth: number, index: number): DcNode {
  if (values.length <= 1) {
    return {
      id,
      depth,
      index,
      problem: values.slice(),
      answer: values.slice(),
      left: null,
      right: null,
    };
  }
  const mid = Math.floor(values.length / 2);
  const left = buildTree(values.slice(0, mid), `${id}L`, depth + 1, index * 2);
  const right = buildTree(values.slice(mid), `${id}R`, depth + 1, index * 2 + 1);
  return {
    id,
    depth,
    index,
    problem: values.slice(),
    answer: combine(left.answer, right.answer).values,
    left,
    right,
  };
}

/** 층 순서로 훑는다 — 내려가는 순서가 곧 이것이다. */
function levelOrder(root: DcNode): DcNode[] {
  const out: DcNode[] = [];
  const queue: DcNode[] = [root];
  while (queue.length > 0) {
    const node = queue.shift();
    if (!node) break;
    out.push(node);
    if (node.left) queue.push(node.left);
    if (node.right) queue.push(node.right);
  }
  return out;
}

function isBranch(node: DcNode): boolean {
  return node.left !== null && node.right !== null;
}

/**
 * 실측 대조용 순수 함수.
 *
 * 화면에 뜨는 쪼갬/합침 횟수와 최종 배열은 전부 여기서 나온 것이지 손으로 적은
 * 값이 아니다 (S-piece "화면에 쓰는 값은 실측한다").
 */
export function computeDivideConquerCombinePlan(data: DivideConquerCombineData): DivideConquerPlan {
  const values = Array.isArray(data.values) ? data.values.slice() : [];
  const root = buildTree(values, ROOT_ID, 0, 0);
  const order = levelOrder(root);
  const branches = order.filter(isBranch);

  const splits: DcSplitRecord[] = [];
  for (const node of branches) {
    const left = node.left;
    const right = node.right;
    if (!left || !right) continue;
    splits.push({ id: node.id, from: node.problem, left: left.problem, right: right.problem });
  }

  // 올라오는 순서 — 깊은 층부터, 층 안에서는 왼쪽부터.
  const merges: DcMergeRecord[] = [];
  const maxBranchDepth = branches.reduce((acc, n) => Math.max(acc, n.depth), 0);
  for (let d = maxBranchDepth; d >= 0; d -= 1) {
    for (const node of branches) {
      if (node.depth !== d) continue;
      const left = node.left;
      const right = node.right;
      if (!left || !right) continue;
      merges.push({ id: node.id, left: left.answer, right: right.answer, result: node.answer });
    }
  }

  return { splits, merges, result: root.answer };
}

/** 한 걸음. emit 한 번이며 type 은 언제나 리터럴이다 (C2). */
type Step = () => Promise<void>;

/**
 * 걸음표를 손으로 적지 않는다 — 아래 배열은 나무를 층 순서로 훑은 결과이고,
 * 앞뒤의 seed / done 만 이 절차의 처음과 끝이라 한 번씩 놓인다 (S-piece).
 */
function buildSteps(ctx: FacetContext<DivideConquerCombineData>, root: DcNode): Step[] {
  const steps: Step[] = [];
  const order = levelOrder(root);
  const branches = order.filter(isBranch);
  const leaves = order.filter((n) => !isBranch(n));

  steps.push(async () => {
    await ctx.emit({
      type: 'seed',
      target: `node:${root.id}`,
      payload: { nodeId: root.id, values: root.problem.slice() },
    });
  });

  // 내려감 — 층 순서 그대로.
  let splitOrder = 0;
  for (const node of branches) {
    const left = node.left;
    const right = node.right;
    if (!left || !right) continue;
    splitOrder += 1;
    const at = splitOrder;
    steps.push(async () => {
      await ctx.emit({
        type: 'split',
        target: `node:${node.id}`,
        payload: {
          nodeId: node.id,
          depth: node.depth,
          order: at,
          leftId: left.id,
          leftValues: left.problem.slice(),
          rightId: right.id,
          rightValues: right.problem.slice(),
        },
      });
    });
  }

  // 바닥 — 낱개는 이미 답이다. 여기서 방향이 바뀐다.
  const leafDepths = [...new Set(leaves.map((n) => n.depth))].sort((a, b) => b - a);
  for (const depth of leafDepths) {
    const ids = leaves.filter((n) => n.depth === depth).map((n) => n.id);
    steps.push(async () => {
      await ctx.emit({
        type: 'layer-settled',
        target: ids.map((id) => `node:${id}`),
        payload: { depth, nodes: ids },
      });
    });
  }

  // 올라옴 — 깊은 층부터. 맨 처음 쪼갠 자리가 맨 마지막이다.
  const maxBranchDepth = branches.reduce((acc, n) => Math.max(acc, n.depth), 0);
  let mergeOrder = 0;
  for (let d = maxBranchDepth; d >= 0; d -= 1) {
    for (const node of branches) {
      if (node.depth !== d) continue;
      const left = node.left;
      const right = node.right;
      if (!left || !right) continue;
      mergeOrder += 1;
      const at = mergeOrder;
      const combined = combine(left.answer, right.answer);
      steps.push(async () => {
        await ctx.emit({
          type: 'merge',
          target: `node:${node.id}`,
          payload: {
            nodeId: node.id,
            depth: node.depth,
            order: at,
            leftId: left.id,
            rightId: right.id,
            values: combined.values,
            fromSide: combined.fromSide,
            fromSlot: combined.fromSlot,
          },
        });
      });
    }
  }

  const splitCount = splitOrder;
  const mergeCount = mergeOrder;
  steps.push(async () => {
    await ctx.emit({
      type: 'done',
      target: `node:${root.id}`,
      payload: { splits: splitCount, merges: mergeCount, values: root.answer.slice() },
    });
  });

  return steps;
}

export const divideConquerCombineAlgorithm = async (
  base: FacetContext<DivideConquerCombineData>,
): Promise<void> => {
  const ctx = base as ReactiveContext<DivideConquerCombineData>;
  const values = Array.isArray(ctx.data.values) ? ctx.data.values.slice() : [];
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;
  if (values.length === 0) return;

  const root = buildTree(values, ROOT_ID, 0, 0);
  const steps = buildSteps(ctx, root);

  // 스스로 시작해 끝까지 간다. 누르지 않아도 화면은 할 말을 마친다 (S-piece).
  for (const step of steps) {
    if (ctx.cancelled) return;
    await step();
    if (!(await ctx.sleep(stepMs))) return;
  }

  // 다 보인 뒤에는 advance 로 한 걸음씩 곱씹는다. 끝난 상태에서 처음 누르면
  // 되감고 첫 걸음까지 보인다 — 되감기만 하면 반응이 없는 것으로 읽힌다.
  let cursor = steps.length;
  for (;;) {
    const input = await ctx.waitForInput();
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;
    if (cursor >= steps.length) {
      await ctx.emit({ type: 'rewind' });
      cursor = 0;
    }
    const step = steps[cursor];
    cursor += 1;
    await step();
  }
};
