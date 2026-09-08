/**
 * 경로 압축(path compression) — 뿌리를 찾아 끝까지 오른 뒤, 그냥 답만 돌려주지
 * 않고 지나온 자리 전부를 뿌리에 곧장 다시 붙인다. 한 번의 수고가 그 길 위에
 * 있던 자리 전부를 싸게 만든다 — 물어본 자리 하나만이 아니다.
 *
 * 식별자: `node:<position>`
 *
 * 이벤트 (모두 facet 고유 확장 — 표준 어휘에 "부모 포인터를 타고 오른다" /
 * "지나온 경로를 한 번에 재배선한다" 에 대응하는 것이 없다):
 *   - query-begin  payload: { node: number }
 *       한 번의 물음이 시작된 자리. 커서가 그 자리로 옮겨간다 (점프, climb 아님).
 *   - climb        payload: { from: number; to: number }
 *       from 이 가리키는 곳(to, 부모)으로 한 칸 오른다.
 *   - root-found   payload: { root: number; queriedNode: number; hops: number; hopsBefore?: number }
 *       뿌리에 닿았다. hopsBefore 는 압축 후 같은 자리를 다시 물었을 때만 채워지며,
 *       압축 전 그 자리를 물었다면 몇 칸이었을지를 담는다 (비교의 근거).
 *   - compress     payload: { root: number; nodes: number[] }
 *       지나온 자리 전부(nodes)를 뿌리(root)에 한 번에 재배선한다. 집합 이벤트 —
 *       자리마다 순차 이벤트로 풀면 "한 번의 수고" 라는 단호함이 흩어진다.
 *   - done         payload: { totalBefore: number; totalAfter: number }
 *       네 자리를 압축 전/후 각각 물었다면 드는 총 칸 수의 합.
 *   - rewind       payload 없음
 *       자동 재생을 마친 뒤 다시 보기 시작. 화면을 초기 상태로 되돌리는 실제
 *       시각 변화이므로 silent 가 아니다.
 *
 * silent 는 전부 아니다 — 시각 변화가 없는 메타 이벤트가 없다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type PathCompressionData = {
  type: 'path-compression';
  /** parent[i] — i 의 부모. parent[i] === i 면 뿌리. */
  parent: number[];
  /** 처음 물어볼 자리. */
  query: number;
  /** 걸음 간격 (ms). 읽을 시간을 주는 저작 결정. */
  stepMs: number;
};

type ClimbStep = { kind: 'climb'; from: number; to: number };
type RootFoundStep = {
  kind: 'root-found';
  root: number;
  queriedNode: number;
  hops: number;
  hopsBefore?: number;
};
type QueryBeginStep = { kind: 'query-begin'; node: number };
type CompressStep = { kind: 'compress'; root: number; nodes: number[] };
type DoneStep = { kind: 'done'; totalBefore: number; totalAfter: number };

type Step = ClimbStep | RootFoundStep | QueryBeginStep | CompressStep | DoneStep;

/** 도메인 사실 → 리터럴 emit. 배열이 아니라 매 걸음 한 번씩 호출한다 (C2). */
async function emitStep(ctx: FacetContext<PathCompressionData>, step: Step): Promise<void> {
  switch (step.kind) {
    case 'query-begin':
      await ctx.emit({ type: 'query-begin', target: `node:${step.node}`, payload: { node: step.node } });
      return;
    case 'climb':
      await ctx.emit({
        type: 'climb',
        target: `node:${step.to}`,
        payload: { from: step.from, to: step.to },
      });
      return;
    case 'root-found':
      await ctx.emit({
        type: 'root-found',
        target: `node:${step.root}`,
        payload: {
          root: step.root,
          queriedNode: step.queriedNode,
          hops: step.hops,
          hopsBefore: step.hopsBefore,
        },
      });
      return;
    case 'compress':
      await ctx.emit({
        type: 'compress',
        target: `node:${step.root}`,
        payload: { root: step.root, nodes: step.nodes },
      });
      return;
    case 'done':
      await ctx.emit({
        type: 'done',
        payload: { totalBefore: step.totalBefore, totalAfter: step.totalAfter },
      });
      return;
  }
}

/**
 * start 에서 parent 포인터를 실제로 타고 뿌리까지 오른다. 자기 자신을 가리키면
 * 뿌리. 고리(순환) 데이터를 대비해 자리 수 + 1 을 넘으면 멈춘다 — 회전 연산이
 * 자기 참조 고리를 만들어 재귀가 끝나지 않은 사례가 있었다.
 */
function walkToRoot(parent: number[], start: number, cap: number): number[] {
  const path = [start];
  let cur = start;
  let guard = 0;
  while (parent[cur] !== cur) {
    cur = parent[cur];
    path.push(cur);
    guard += 1;
    if (guard > cap) break;
  }
  return path;
}

/** 취소 검사 + 걸음 사이 대기를 한데 묶은 문(gate). false 면 그 자리에서 멈춘다. */
async function pause(ctx: FacetContext<PathCompressionData>, ms: number): Promise<boolean> {
  const rctx = ctx as ReactiveContext<PathCompressionData>;
  if (ctx.cancelled) return false;
  return rctx.sleep(ms);
}

export async function pathCompressionAlgorithm(
  ctx: FacetContext<PathCompressionData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<PathCompressionData>;
  const { parent, query, stepMs } = ctx.data;
  const n = parent.length;
  const cap = n + 1;

  const history: Step[] = [];

  /** 걸음을 실제로 내보내고(emit), history 에 기록하고, 자동 재생 간격만큼 쉰다. */
  async function step(s: Step): Promise<boolean> {
    await emitStep(ctx, s);
    history.push(s);
    return pause(ctx, stepMs);
  }

  // ── Phase 1. 압축 전 — query 에서 뿌리까지 실제로 타고 오른다.
  if (ctx.cancelled) return;
  if (!(await step({ kind: 'query-begin', node: query }))) return;

  const beforePath = walkToRoot(parent, query, cap);
  const root = beforePath[beforePath.length - 1];

  for (let i = 1; i < beforePath.length; i++) {
    if (ctx.cancelled) return;
    if (!(await step({ kind: 'climb', from: beforePath[i - 1], to: beforePath[i] }))) return;
  }

  // 압축 전 이 경로 위 각 자리에서 뿌리까지 몇 칸이었는지 — 실제로 걸은 결과에서 그대로 얻는다.
  const hopsBefore = new Map<number, number>();
  for (let i = 0; i < beforePath.length; i++) {
    hopsBefore.set(beforePath[i], beforePath.length - 1 - i);
  }

  if (!(await step({ kind: 'root-found', root, queriedNode: query, hops: beforePath.length - 1 }))) {
    return;
  }

  // ── Phase 2. 접는다 — 지나온 자리 전부(뿌리 자신 제외)를 뿌리에 곧장 붙인다.
  const compressedNodes = beforePath.slice(0, -1);
  for (const node of compressedNodes) {
    parent[node] = root; // ctx.data.parent 를 실제로 갱신
  }
  if (!(await step({ kind: 'compress', root, nodes: [...compressedNodes] }))) return;

  // ── Phase 3. 압축 후 재질문 — 지나온 자리를 걸었던 순서 그대로 하나씩 다시 묻는다.
  let totalBefore = 0;
  let totalAfter = 0;
  for (const node of compressedNodes) {
    if (ctx.cancelled) return;
    if (!(await step({ kind: 'query-begin', node }))) return;

    const afterPath = walkToRoot(parent, node, cap);
    for (let i = 1; i < afterPath.length; i++) {
      if (ctx.cancelled) return;
      if (!(await step({ kind: 'climb', from: afterPath[i - 1], to: afterPath[i] }))) return;
    }

    const hops = afterPath.length - 1;
    const before = hopsBefore.get(node) ?? hops;
    totalBefore += before;
    totalAfter += hops;
    if (!(await step({ kind: 'root-found', root, queriedNode: node, hops, hopsBefore: before }))) {
      return;
    }
  }

  if (!(await step({ kind: 'done', totalBefore, totalAfter }))) return;

  // ── Phase 4. 자동 재생이 끝났다 — advance 로 처음부터 한 걸음씩 다시 짚어 본다.
  //    되감기 직후의 첫 걸음은 문(gate) 없이 바로 보여준다. 그 뒤로는 누를 때마다 한 걸음.
  let idx = 0;
  let skipGate = false;
  while (true) {
    if (ctx.cancelled) return;

    if (idx === 0) {
      let ev: ReactiveInputEvent;
      try {
        ev = await rctx.waitForInput();
      } catch {
        return;
      }
      if (ev.type !== 'advance') continue;
      await ctx.emit({ type: 'rewind' });
      skipGate = true;
    }

    if (!skipGate) {
      let ev: ReactiveInputEvent;
      try {
        ev = await rctx.waitForInput();
      } catch {
        return;
      }
      if (ev.type !== 'advance') continue;
    }
    skipGate = false;

    if (ctx.cancelled) return;
    await emitStep(ctx, history[idx]);
    idx = (idx + 1) % history.length;
  }
}
