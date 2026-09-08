/**
 * adjacencyListVsMatrixAlgorithm — 조각(piece) 알고리즘.
 *
 * 답하는 질문: "이웃을 목록으로 두는가, 표로 두는가?" 같은 다섯 간선을 두
 * 그릇(인접 리스트 / 인접 행렬)에 동시에 담고, 두 가지 물음의 비용을 실제로
 * 세어 어느 쪽이 싼지가 뒤바뀌는 것을 보인다.
 *
 * `ctx.data.vertices` / `ctx.data.edges` 를 실제로 순회해 인접 리스트
 * (Map<string, string[]>) 와 인접 행렬 (number[][]) 을 이 함수 안에서 채우고,
 * 두 물음(이웃 여부 / 이웃 전체)의 비용도 그 자료구조를 실제로 훑어 센다 —
 * 화면에 뜨는 수는 전부 이 계산에서 나온다 (지어내지 않는다).
 *
 * ── 확장 이벤트 어휘 (facet 고유, C2) ──────────────────────────────────
 *
 * `edge-added`   — 간선 하나가 두 그릇에 동시에 놓인다.
 *   payload: { a: string; b: string; aIndex: number; bIndex: number }
 *   target:  [`node:${a}`, `node:${b}`]
 *   silent:  false — 두 패널이 실제로 자라고/채워지는 시각 변화가 있다.
 *
 * `query-begin`  — 새 물음이 시작된다 (캡션 전환).
 *   payload: { question: 1 | 2 }
 *   silent:  false — 캡션이 바뀐다.
 *
 * `scan-step`    — 물음에 답하려고 칸 하나를 짚는다 (커서 이동 + 카운트 증가).
 *   payload: {
 *     question: 1 | 2;
 *     side: 'list' | 'matrix';
 *     cellIndex: number;      // list: 그 정점 목록 안의 위치. matrix: 열 위치.
 *     cellVertex: string;     // 이 칸이 가리키는 이웃 후보 정점.
 *     count: number;          // 이 물음에서 지금까지 짚은 칸 수 (1부터).
 *     matched: boolean;       // 이 칸이 실제로 이웃(값 1)인가.
 *   }
 *   target:  `node:${cellVertex}`
 *   silent:  false — 커서가 실제로 움직인다.
 *
 * `query-done`   — 물음 하나가 끝나고 두 비용을 나란히 보인다.
 *   payload: {
 *     question: 1 | 2;
 *     listCost: number;
 *     matrixCost: number;
 *     foundNeighbor: boolean;
 *     neighbors: string[];
 *   }
 *   silent:  false — 결과 배지가 새로 그려진다.
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

type EdgeStep = {
  kind: 'edge';
  a: string;
  b: string;
  aIndex: number;
  bIndex: number;
};

type QueryBeginStep = {
  kind: 'query-begin';
  question: 1 | 2;
};

type ScanStep = {
  kind: 'scan';
  question: 1 | 2;
  side: 'list' | 'matrix';
  cellIndex: number;
  cellVertex: string;
  count: number;
  matched: boolean;
};

type QueryDoneStep = {
  kind: 'query-done';
  question: 1 | 2;
  listCost: number;
  matrixCost: number;
  foundNeighbor: boolean;
  neighbors: string[];
};

type Step = EdgeStep | QueryBeginStep | ScanStep | QueryDoneStep;

/**
 * ctx.data 를 실제로 읽어 인접 리스트 / 인접 행렬을 채우고, 두 물음의 비용을
 * 실제로 세어 걸음(Step) 목록을 만든다. 이 배열은 사람이 적은 대본이 아니라
 * 자료구조를 순회한 결과다 — emitStep 의 switch 만 리터럴 type 을 쓴다 (C2).
 */
function buildSteps(data: AdjacencyListVsMatrixData): Step[] {
  const { vertices, edges } = data;
  const indexOf = new Map(vertices.map((v, i) => [v, i]));
  const adjacencyList = new Map<string, string[]>();
  for (const v of vertices) adjacencyList.set(v, []);
  const matrix: number[][] = vertices.map(() => vertices.map(() => 0));

  const steps: Step[] = [];

  // ── 두 그릇에 같은 간선을 동시에 담는다.
  for (const [a, b] of edges) {
    const aList = adjacencyList.get(a);
    const bList = adjacencyList.get(b);
    if (!aList || !bList) continue;
    aList.push(b);
    bList.push(a);
    const ai = indexOf.get(a);
    const bi = indexOf.get(b);
    if (ai === undefined || bi === undefined) continue;
    const aRow = matrix[ai];
    const bRow = matrix[bi];
    if (aRow) aRow[bi] = 1;
    if (bRow) bRow[ai] = 1;
    steps.push({ kind: 'edge', a, b, aIndex: aList.length - 1, bIndex: bList.length - 1 });
  }

  const queryVertex = vertices[0];
  const targetVertex = vertices[vertices.length - 1];
  if (queryVertex === undefined || targetVertex === undefined) return steps;
  const queryIndex = indexOf.get(queryVertex);
  const targetIndex = indexOf.get(targetVertex);
  if (queryIndex === undefined || targetIndex === undefined) return steps;
  const queryList = adjacencyList.get(queryVertex) ?? [];
  const queryRow = matrix[queryIndex] ?? [];

  // ── 물음 1: queryVertex 와 targetVertex 는 이웃인가?
  steps.push({ kind: 'query-begin', question: 1 });
  for (let i = 0; i < queryList.length; i++) {
    const cellVertex = queryList[i];
    if (cellVertex === undefined) continue;
    steps.push({
      kind: 'scan',
      question: 1,
      side: 'list',
      cellIndex: i,
      cellVertex,
      count: i + 1,
      matched: cellVertex === targetVertex,
    });
  }
  const matrixHit1 = queryRow[targetIndex] === 1;
  steps.push({
    kind: 'scan',
    question: 1,
    side: 'matrix',
    cellIndex: targetIndex,
    cellVertex: targetVertex,
    count: 1,
    matched: matrixHit1,
  });
  steps.push({
    kind: 'query-done',
    question: 1,
    listCost: queryList.length,
    matrixCost: 1,
    foundNeighbor: matrixHit1,
    neighbors: [],
  });

  // ── 물음 2: queryVertex 의 이웃을 모두 대라.
  steps.push({ kind: 'query-begin', question: 2 });
  for (let i = 0; i < queryList.length; i++) {
    const cellVertex = queryList[i];
    if (cellVertex === undefined) continue;
    steps.push({
      kind: 'scan',
      question: 2,
      side: 'list',
      cellIndex: i,
      cellVertex,
      count: i + 1,
      matched: true,
    });
  }
  let matrixHits2 = 0;
  for (let col = 0; col < vertices.length; col++) {
    const cellVertex = vertices[col];
    if (cellVertex === undefined) continue;
    const hit = queryRow[col] === 1;
    if (hit) matrixHits2 += 1;
    steps.push({
      kind: 'scan',
      question: 2,
      side: 'matrix',
      cellIndex: col,
      cellVertex,
      count: col + 1,
      matched: hit,
    });
  }
  steps.push({
    kind: 'query-done',
    question: 2,
    listCost: queryList.length,
    matrixCost: vertices.length,
    foundNeighbor: matrixHits2 > 0,
    neighbors: [...queryList],
  });

  return steps;
}

/** 도메인 사실(Step) 하나를 리터럴 type 의 emit 으로 옮긴다 (C2). */
async function emitStep(ctx: FacetContext<AdjacencyListVsMatrixData>, step: Step): Promise<void> {
  switch (step.kind) {
    case 'edge':
      await ctx.emit({
        type: 'edge-added',
        target: [`node:${step.a}`, `node:${step.b}`],
        payload: { a: step.a, b: step.b, aIndex: step.aIndex, bIndex: step.bIndex },
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
        payload: {
          question: step.question,
          side: step.side,
          cellIndex: step.cellIndex,
          cellVertex: step.cellVertex,
          count: step.count,
          matched: step.matched,
        },
      });
      return;
    case 'query-done':
      await ctx.emit({
        type: 'query-done',
        payload: {
          question: step.question,
          listCost: step.listCost,
          matrixCost: step.matrixCost,
          foundNeighbor: step.foundNeighbor,
          neighbors: step.neighbors,
        },
      });
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
