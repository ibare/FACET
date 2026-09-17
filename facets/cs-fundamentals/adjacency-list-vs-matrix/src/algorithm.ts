/**
 * adjacencyListVsMatrixAlgorithm — 조각(piece) 알고리즘.
 *
 * 답하는 질문: "이웃을 목록으로 두는가, 표로 두는가?" 같은 다섯 간선을 두
 * 그릇(인접 리스트 / 인접 행렬)에 동시에 담고, 두 가지 물음의 비용을 실제로
 * 세어 어느 쪽이 싼지가 뒤바뀌는 것을 보인다.
 *
 * `ctx.data.vertices` / `ctx.data.edges` 를 실제로 순회해 인접 리스트를 채우고,
 * 두 물음이 **어느 칸을 짚는지**를 그 자료구조에서 낸다. 짚은 칸이 몇인가 —
 * 곧 물음의 비용 — 는 여기서 세지 않는다. 그것은 화면에 남는 자취 그 자체이고,
 * 장면이 그 자취를 세어 낸다. 같은 수를 두 자리에서 세면 언젠가 갈린다.
 *
 * ── 확장 이벤트 어휘 (facet 고유, C2) ──────────────────────────────────
 *
 * `edge-added`   — 간선 하나가 두 그릇에 동시에 놓인다.
 *   payload: { a: string; b: string }
 *   target:  [`node:${a}`, `node:${b}`]
 *   silent:  false — 두 패널이 실제로 자라고/채워지는 시각 변화가 있다.
 *
 *   목록 안에서 몇 번째 칸인가는 싣지 않는다 — 간선이 놓인 차례가 곧 목록의
 *   차례라 장면이 `placed` 를 훑어 셀 수 있다.
 *
 * `query-begin`  — 새 물음이 시작된다.
 *   payload: { question: 1 | 2 }
 *   silent:  false — 캡션이 바뀌고 앞 물음의 자취가 걷힌다.
 *
 *   어느 물음을 던지는가는 걸음의 판정이라 싣는다.
 *
 * `scan-step`    — 물음에 답하려고 칸 하나를 짚는다.
 *   payload: { side: 'list' | 'matrix'; cellIndex: number }
 *   target:  `node:${cellVertex}`
 *   silent:  false — 커서가 실제로 움직이고 짚음의 표식이 하나 남는다.
 *
 *   어느 그릇의 몇 번째 칸을 짚는가만 싣는다. 그 칸이 가리키는 정점 · 지금까지
 *   짚은 수 · 그 칸이 이웃인가는 전부 구조에서 나오므로 장면이 낸다.
 *
 * `query-done`   — 물음 하나가 끝난다. 그 물음의 자취가 결과 줄로 굳는다.
 *   payload: 없음. silent: false — 결과 줄이 새로 앉는다.
 *
 *   두 비용을 싣지 않는다 — 그것이 이 조각의 결론이고, 결론은 화면의 자취와
 *   같은 자료에서 나와야 한다.
 *
 * `rewind`       — 자동 재생을 마친 뒤 `advance` 를 처음 누르면, 화면을
 *   초기 상태로 되돌리고 곧바로 첫 걸음을 보인다 (S-piece).
 *   payload: 없음. silent: false — 두 패널이 실제로 빈 상태로 돌아간다.
 *
 * `done` 은 쓰지 않는다 — 조각은 재생이 끝나도 완료를 알리는 별도 신호가
 * 필요 없다. 마지막 `query-done` 자체가 결말이다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type AdjacencyListVsMatrixData = {
  type: 'adjacency-list-vs-matrix';
  /** 정점 이름. 순서가 인접 행렬의 행/열 순서다. */
  vertices: string[];
  /** 방향 없는 간선. [a, b] 는 a-b 를 잇는다. */
  edges: [string, string][];
  stepMs: number;
};

/**
 * 간선 목록을 인접 리스트로 옮긴다.
 *
 * 이 조각이 견주는 두 그릇 중 하나이고, 화면도 이것으로 그린다. 그래서
 * 장면이 같은 함수를 부른다 (`scene.ts`) — 목록을 두 자리에서 만들면 걸음이
 * 짚는 칸과 화면에 선 칸이 언젠가 갈린다. 인접 행렬도 같은 사실을 담으므로
 * 장면은 이 목록으로 표의 켜진 칸까지 낸다.
 *
 * 그 함수만 떼어 내도 "물음마다 어느 그릇이 싼가" 는 남는다 — 알고리즘 자체가
 * 아니라 그릇을 짓는 일이므로 내준다.
 */
export function adjacencyOf(
  vertices: readonly string[],
  edges: readonly (readonly [string, string])[],
): Map<string, string[]> {
  const lists = new Map<string, string[]>();
  for (const v of vertices) lists.set(v, []);
  for (const [a, b] of edges) {
    const aList = lists.get(a);
    const bList = lists.get(b);
    if (!aList || !bList) continue;
    aList.push(b);
    bList.push(a);
  }
  return lists;
}

/** 두 물음이 모두 물어보는 정점. 선언의 첫 정점이다. */
export function queryVertexOf(vertices: readonly string[]): string {
  return vertices[0] ?? '';
}

/** 물음 1 이 "이웃인가" 를 묻는 상대. 선언의 마지막 정점이다. */
export function targetVertexOf(vertices: readonly string[]): string {
  return vertices[vertices.length - 1] ?? '';
}

type EdgeStep = {
  kind: 'edge';
  a: string;
  b: string;
};

type QueryBeginStep = {
  kind: 'query-begin';
  question: 1 | 2;
};

type ScanStep = {
  kind: 'scan';
  side: 'list' | 'matrix';
  cellIndex: number;
  /** 이 칸이 가리키는 정점. payload 가 아니라 `target` 을 짓는 데만 쓴다 (C1). */
  cellVertex: string;
};

type QueryDoneStep = {
  kind: 'query-done';
};

type Step = EdgeStep | QueryBeginStep | ScanStep | QueryDoneStep;

/**
 * ctx.data 를 실제로 읽어 인접 리스트를 채우고, 두 물음이 어느 칸을 짚는지를
 * 그 자료구조에서 낸다. 이 배열은 사람이 적은 대본이 아니라 자료구조를 순회한
 * 결과다 — emitStep 의 switch 만 리터럴 type 을 쓴다 (C2).
 */
function buildSteps(data: AdjacencyListVsMatrixData): Step[] {
  const { vertices, edges } = data;
  const steps: Step[] = [];

  // ── 두 그릇에 같은 간선을 동시에 담는다. 놓인 차례가 곧 목록의 차례다.
  const placed: [string, string][] = [];
  const known = new Set(vertices);
  for (const [a, b] of edges) {
    if (!known.has(a) || !known.has(b)) continue;
    placed.push([a, b]);
    steps.push({ kind: 'edge', a, b });
  }

  const queryVertex = queryVertexOf(vertices);
  const targetVertex = targetVertexOf(vertices);
  if (queryVertex === '' || targetVertex === '') return steps;
  const targetIndex = vertices.indexOf(targetVertex);
  if (targetIndex < 0) return steps;
  const queryList = adjacencyOf(vertices, placed).get(queryVertex) ?? [];

  // ── 물음 1: queryVertex 와 targetVertex 는 이웃인가?
  //    목록은 처음부터 훑어야 하고, 표는 한 칸만 보면 끝난다.
  steps.push({ kind: 'query-begin', question: 1 });
  for (let i = 0; i < queryList.length; i++) {
    const cellVertex = queryList[i];
    if (cellVertex === undefined) continue;
    steps.push({ kind: 'scan', side: 'list', cellIndex: i, cellVertex });
  }
  steps.push({ kind: 'scan', side: 'matrix', cellIndex: targetIndex, cellVertex: targetVertex });
  steps.push({ kind: 'query-done' });

  // ── 물음 2: queryVertex 의 이웃을 모두 대라.
  //    목록은 모아 둔 것을 그대로 읽고, 표는 그 행을 통째로 훑어야 한다.
  steps.push({ kind: 'query-begin', question: 2 });
  for (let i = 0; i < queryList.length; i++) {
    const cellVertex = queryList[i];
    if (cellVertex === undefined) continue;
    steps.push({ kind: 'scan', side: 'list', cellIndex: i, cellVertex });
  }
  for (let col = 0; col < vertices.length; col++) {
    const cellVertex = vertices[col];
    if (cellVertex === undefined) continue;
    steps.push({ kind: 'scan', side: 'matrix', cellIndex: col, cellVertex });
  }
  steps.push({ kind: 'query-done' });

  return steps;
}

/** 도메인 사실(Step) 하나를 리터럴 type 의 emit 으로 옮긴다 (C2). */
async function emitStep(ctx: FacetContext<AdjacencyListVsMatrixData>, step: Step): Promise<void> {
  switch (step.kind) {
    case 'edge':
      await ctx.emit({
        type: 'edge-added',
        target: [`node:${step.a}`, `node:${step.b}`],
        payload: { a: step.a, b: step.b },
      });
      return;
    case 'query-begin':
      await ctx.emit({
        type: 'query-begin',
        payload: { question: step.question },
      });
      return;
    case 'scan':
      await ctx.emit({
        type: 'scan-step',
        target: `node:${step.cellVertex}`,
        payload: { side: step.side, cellIndex: step.cellIndex },
      });
      return;
    case 'query-done':
      await ctx.emit({ type: 'query-done' });
      return;
  }
}

/** 걸음을 처음부터 끝까지 자동 재생. 취소되면 false. */
async function playAll(
  ctx: ReactiveContext<AdjacencyListVsMatrixData>,
  steps: Step[],
  stepMs: number,
): Promise<boolean> {
  for (const step of steps) {
    if (ctx.cancelled) return false;
    await emitStep(ctx, step);
    if (ctx.cancelled) return false;
    const ok = await ctx.sleep(stepMs);
    if (!ok) return false;
  }
  return true;
}

/**
 * 자동 재생이 끝난 뒤: `advance` 입력마다 한 걸음씩 보인다. 처음 누르는
 * `advance` 는 되감고(`rewind`) 그 문(gate)을 그냥 통과시켜 첫 걸음까지
 * 보인다 (S-piece) — 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다.
 */
async function advanceLoop(
  ctx: ReactiveContext<AdjacencyListVsMatrixData>,
  steps: Step[],
): Promise<void> {
  let idx = 0;
  for (;;) {
    if (ctx.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await ctx.waitForInput();
    } catch {
      return;
    }
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;

    if (idx === 0 || idx >= steps.length) {
      idx = 0;
      await ctx.emit({ type: 'rewind' });
      if (ctx.cancelled) return;
    }
    const step = steps[idx];
    if (step) await emitStep(ctx, step);
    idx += 1;
  }
}

export async function adjacencyListVsMatrixAlgorithm(
  ctx: FacetContext<AdjacencyListVsMatrixData>,
): Promise<void> {
  const reactiveCtx = ctx as ReactiveContext<AdjacencyListVsMatrixData>;
  const steps = buildSteps(ctx.data);
  const finishedAutoplay = await playAll(reactiveCtx, steps, ctx.data.stepMs);
  if (!finishedAutoplay) return;
  await advanceLoop(reactiveCtx, steps);
}
