/**
 * find-root — 자리(인덱스)가 자기 자신을 가리킬 때까지 parent 포인터를 따라
 * 올라간다. 닿은 자리가 뿌리이고, 그 인덱스가 이 무리의 이름이다. 서로 다른
 * 자리에서 올라가 같은 이름에 닿으면 한 무리, 다른 이름이면 남남이다.
 *
 * 이벤트 어휘 (전부 facet 고유 확장, kebab-case, StandardEventType 아님):
 *
 *   walk-start    payload: { node: number }
 *                 새 질의 시작 — 시작 자리에 마커를 놓는다.
 *   hop           payload: { from: number; to: number }
 *                 자리 from 이 가리키는 자리 to 로 마커가 오른다 (한 걸음).
 *   root-reached  payload: { start: number; node: number; groupIndex: number }
 *                 자기 자신을 가리키는 자리에 닿았다 — 뿌리. start 는 이 걸음이
 *                 출발한 자리, node 는 뿌리(=이름), groupIndex 는 뿌리가 처음
 *                 발견된 순서(0, 1, ...)로 시각적 색 배정에만 쓰인다.
 *   compare       payload: { a: number; b: number; same: boolean }
 *                 앞선 질의들의 뿌리를 첫 질의의 뿌리와 비교 — 같은 이름에
 *                 닿았으면 한 무리, 다르면 남남.
 *   rewind        payload 없음. 자동 재생이 끝난 뒤 첫 advance 입력에서, 걸음을
 *                 처음부터 다시 보여주기 전에 화면을 지운다.
 *
 * silent 인 이벤트는 없다 — 다섯 다 화면이 바뀌는 step boundary.
 * `done` 을 쓰지 않는다 — ReactiveMechanism 이 완료를 훅(onComplete)으로
 * 관리하고, 조각은 대신 마지막 compare 로 화면의 결론 문장을 마친다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type FindRootData = {
  type: 'findRoot';
  /** 자리마다 가리키는 자리. parent[i] === i 면 자기 자신 — 뿌리. */
  parent: number[];
  /** 차례로 올라가 볼 시작 자리들. */
  queries: number[];
  /** 걸음 사이 대기(ms). */
  stepMs: number;
};

type Step =
  | { kind: 'walk-start'; node: number }
  | { kind: 'hop'; from: number; to: number }
  | { kind: 'root-reached'; start: number; node: number; groupIndex: number }
  | { kind: 'compare'; a: number; b: number; same: boolean };

/** 가리킴을 따라가는 루프의 상한 — 데이터에 고리가 있어도 여기서 멈춘다. */
const MAX_HOPS_GUARD = 64;

/**
 * queries 를 하나씩 실제로 타고 올라가며 걸음을 만든다. 손으로 적은 배열이
 * 아니라 data.parent 를 실제로 순회한 결과다 (S-piece).
 */
function buildSteps(data: FindRootData): Step[] {
  const steps: Step[] = [];
  const groupIndexOfRoot = new Map<number, number>();
  const rootOfStart = new Map<number, number>();

  for (const start of data.queries) {
    steps.push({ kind: 'walk-start', node: start });
    let cur = start;
    let guard = 0;
    while (data.parent[cur] !== cur) {
      const next = data.parent[cur];
      steps.push({ kind: 'hop', from: cur, to: next });
      cur = next;
      guard += 1;
      if (guard > MAX_HOPS_GUARD) break; // 고리 방지 — 여기까지 왔으면 데이터 이상.
    }
    if (!groupIndexOfRoot.has(cur)) groupIndexOfRoot.set(cur, groupIndexOfRoot.size);
    steps.push({ kind: 'root-reached', start, node: cur, groupIndex: groupIndexOfRoot.get(cur)! });
    rootOfStart.set(start, cur);
  }

  // 첫 질의를 기준으로 나머지 질의들과 비교 — 사양의 "3과 6", "3과 2" 비교와 동형.
  const anchor = data.queries[0];
  const anchorRoot = anchor === undefined ? undefined : rootOfStart.get(anchor);
  if (anchor !== undefined && anchorRoot !== undefined) {
    for (let i = 1; i < data.queries.length; i += 1) {
      const b = data.queries[i];
      const bRoot = rootOfStart.get(b);
      steps.push({ kind: 'compare', a: anchor, b, same: bRoot === anchorRoot });
    }
  }

  return steps;
}

/** 취소 검사와 ctx.sleep 을 묶는다 (S-piece 권고). */
async function pause(ctx: ReactiveContext<FindRootData>, ms: number): Promise<boolean> {
  if (ctx.cancelled) return false;
  return ctx.sleep(ms);
}

async function applyStep(ctx: ReactiveContext<FindRootData>, step: Step): Promise<boolean> {
  if (ctx.cancelled) return false;
  switch (step.kind) {
    case 'walk-start':
      await ctx.emit({ type: 'walk-start', payload: { node: step.node } });
      break;
    case 'hop':
      await ctx.emit({ type: 'hop', payload: { from: step.from, to: step.to } });
      break;
    case 'root-reached':
      await ctx.emit({
        type: 'root-reached',
        payload: { start: step.start, node: step.node, groupIndex: step.groupIndex },
      });
      break;
    case 'compare':
      await ctx.emit({ type: 'compare', payload: { a: step.a, b: step.b, same: step.same } });
      break;
  }
  return !ctx.cancelled;
}

export async function findRootAlgorithm(ctxIn: FacetContext<FindRootData>): Promise<void> {
  const ctx = ctxIn as ReactiveContext<FindRootData>;
  const data = ctx.data;
  const steps = buildSteps(data);

  // 자동 재생 — 걸음마다 emit 하고 stepMs 만큼 읽을 시간을 준다.
  for (let i = 0; i < steps.length; i += 1) {
    if (ctx.cancelled) return;
    const ok = await applyStep(ctx, steps[i]);
    if (!ok) return;
    if (i < steps.length - 1) {
      const slept = await pause(ctx, data.stepMs);
      if (!slept) return;
    }
  }

  // 자동 재생 종료 — advance 입력을 기다려 한 걸음씩 다시 짚어 본다.
  // 자동 재생이 끝난 뒤 처음 누르는 advance 는 되감고 첫 걸음까지 보인다 (S-piece).
  let manualIdx = 0;
  while (!ctx.cancelled) {
    let input: { type: string };
    try {
      input = await ctx.waitForInput();
    } catch {
      return; // cancelled 로 reject 됨.
    }
    if (input.type !== 'advance') continue;

    if (manualIdx === 0 || manualIdx >= steps.length) {
      await ctx.emit({ type: 'rewind' });
      if (ctx.cancelled) return;
      const ok = await applyStep(ctx, steps[0]);
      if (!ok) return;
      manualIdx = 1;
      continue;
    }

    const ok = await applyStep(ctx, steps[manualIdx]);
    if (!ok) return;
    manualIdx += 1;
  }
}
