/**
 * yield-to-render 의 장면.
 *
 * 바탕(init 이 한 번 정하는 것) — 코드 다섯 줄, 전체/조각 행 수, 조각 하나의 ms,
 * 그리고 그로부터 정해지는 총 재생 ms 와 그 구간의 프레임 경계 눈금(축의 자리 —
 * 층위는 다르지만 stage 가 다시 셈하지 않게 여기서 한 번만 셈해 둔다).
 *
 * 자취(걸음이 쌓는 것) — 지금까지 실행된 조각들의 이력(`runs`), 아직 태스크
 * 줄에 선 다음 조각(`pending`), 지금까지 지난 경계의 수(`passedCount`), 지금까지의
 * 렌더 이력(`renders`).
 *
 * 이번 걸음(`step`) — 이 걸음이 무엇을 보였는지 (stage 의 캡션 자료).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { YieldToRenderFacetData } from './algorithm.js';

/** 한 프레임의 길이(ms). algorithm.ts 와 같은 상수를 각자 든다 — 축 눈금은 순수 배치 셈이다. */
const FRAME_MS = 1000 / 60;

export type YieldToRenderRun = { index: number; from: number; to: number; t: number };
export type YieldToRenderRenderMark = { t: number; screenRows: number; boundaries: readonly number[] };

export type YieldToRenderStep =
  | { kind: 'start' }
  | { kind: 'run'; name: string; from: number; to: number; domRows: number }
  | { kind: 'render'; screenRows: number; boundaries: readonly number[] };

export type YieldToRenderScene = {
  // 바탕
  code: readonly string[];
  totalRows: number;
  chunkRows: number;
  workMs: number;
  totalMs: number;
  boundaries: readonly number[];

  // 자취
  domRows: number;
  screenRows: number;
  t: number;
  runs: readonly YieldToRenderRun[];
  pending: { from: number; to: number } | null;
  passedCount: number;
  renders: readonly YieldToRenderRenderMark[];

  // 이번 걸음
  step: YieldToRenderStep;
};

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function readNumberArray(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const item of v) {
    if (!isFiniteNumber(item)) return null;
    out.push(item);
  }
  return out;
}

export const yieldToRenderScene: ScenePlan<YieldToRenderScene> = {
  initial(initialData: unknown): YieldToRenderScene {
    const data = initialData as YieldToRenderFacetData;
    const code = [...data.code];
    const { totalRows, chunkRows, workMs } = data;
    const chunkCount = Math.ceil(totalRows / chunkRows);
    const totalMs = chunkCount * workMs;
    const boundaries: number[] = [];
    for (let k = 1; k * FRAME_MS <= totalMs; k += 1) boundaries.push(k * FRAME_MS);

    return {
      code,
      totalRows,
      chunkRows,
      workMs,
      totalMs,
      boundaries,

      domRows: 0,
      screenRows: 0,
      t: 0,
      runs: [],
      pending: null,
      passedCount: 0,
      renders: [],

      step: { kind: 'start' },
    };
  },

  reduce(scene: YieldToRenderScene, event: FacetRuntimeEvent): YieldToRenderScene {
    if (event.type === 'task-run') {
      const p = event.payload;
      if (typeof p !== 'object' || p === null) return scene;
      const index = (p as { index?: unknown }).index;
      const from = (p as { from?: unknown }).from;
      const to = (p as { to?: unknown }).to;
      const t = (p as { t?: unknown }).t;
      if (!isFiniteNumber(index) || !isFiniteNumber(from) || !isFiniteNumber(to) || !isFiniteNumber(t)) return scene;

      const runs = [...scene.runs, { index, from, to, t }];
      const pending = to < scene.totalRows ? { from: to, to: Math.min(to + scene.chunkRows, scene.totalRows) } : null;
      return {
        ...scene,
        domRows: to,
        t,
        runs,
        pending,
        step: { kind: 'run', name: `chunk(${from})`, from, to, domRows: to },
      };
    }

    if (event.type === 'render') {
      const p = event.payload;
      if (typeof p !== 'object' || p === null) return scene;
      const t = (p as { t?: unknown }).t;
      const screenRows = (p as { screenRows?: unknown }).screenRows;
      const boundaries = readNumberArray((p as { boundaries?: unknown }).boundaries);
      if (!isFiniteNumber(t) || !isFiniteNumber(screenRows) || boundaries === null) return scene;

      const renders = [...scene.renders, { t, screenRows, boundaries }];
      return {
        ...scene,
        screenRows,
        t,
        renders,
        passedCount: scene.passedCount + boundaries.length,
        step: { kind: 'render', screenRows, boundaries },
      };
    }

    return scene;
  },
};
