/**
 * adjacencyListVsMatrixProjector — algorithm 의 확장 이벤트를 stage view 호출로
 * 번역한다 (알고리즘 이벤트 어휘는 algorithm.ts 상단 주석 참조, C2).
 *
 * `event.payload` / `initialData` 는 전부 `typeof` / `Array.isArray` 가드로
 * 좁힌 뒤에만 stage 로 넘긴다 (C9). stage 의 실제 메서드 모양은
 * `adjacency-list-vs-matrix-stage.ts` 가 정본이며, 여기서는 그 계약을
 * 소비하기 위한 cast 타입만 선언한다.
 */

import type { ProjectorFactory, ViewInstance } from '@ffacet/core/runtime';
import type {
  AdjacencyResultArgs,
  AdjacencyScanArgs,
  AdjacencyStageData,
} from './adjacency-list-vs-matrix-stage.js';

type Stage = ViewInstance & {
  init(data: AdjacencyStageData): void;
  addEdge(a: string, b: string, aIndex: number, bIndex: number): Promise<void>;
  setQuestion(question: 1 | 2): void;
  scanCell(args: AdjacencyScanArgs): Promise<void>;
  showResult(args: AdjacencyResultArgs): void;
  resetView(): void;
};

function narrowInitialData(data: unknown): AdjacencyStageData | null {
  if (typeof data !== 'object' || data === null) return null;
  const o = data as Record<string, unknown>;
  if (!Array.isArray(o.vertices) || !o.vertices.every((v) => typeof v === 'string')) return null;
  if (!Array.isArray(o.edges)) return null;
  const edges: [string, string][] = [];
  for (const e of o.edges) {
    if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string' || typeof e[1] !== 'string') {
      return null;
    }
    edges.push([e[0], e[1]]);
  }
  return { vertices: o.vertices as string[], edges };
}

function narrowEdgeAdded(
  payload: unknown,
): { a: string; b: string; aIndex: number; bIndex: number } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.a === 'string' &&
    typeof p.b === 'string' &&
    typeof p.aIndex === 'number' &&
    typeof p.bIndex === 'number'
  ) {
    return { a: p.a, b: p.b, aIndex: p.aIndex, bIndex: p.bIndex };
  }
  return null;
}

function narrowQuestion(payload: unknown): { question: 1 | 2 } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (p.question === 1 || p.question === 2) return { question: p.question };
  return null;
}

function narrowScan(payload: unknown): AdjacencyScanArgs | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (
    (p.side === 'list' || p.side === 'matrix') &&
    typeof p.cellIndex === 'number' &&
    typeof p.cellVertex === 'string' &&
    typeof p.count === 'number' &&
    typeof p.matched === 'boolean'
  ) {
    return {
      side: p.side,
      cellIndex: p.cellIndex,
      cellVertex: p.cellVertex,
      count: p.count,
      matched: p.matched,
    };
  }
  return null;
}

function narrowResult(payload: unknown): AdjacencyResultArgs | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (
    (p.question === 1 || p.question === 2) &&
    typeof p.listCost === 'number' &&
    typeof p.matrixCost === 'number'
  ) {
    return { question: p.question, listCost: p.listCost, matrixCost: p.matrixCost };
  }
  return null;
}

export const adjacencyListVsMatrixProjector: ProjectorFactory = (views) => {
  const stage = views.stage as unknown as Stage;

  return {
    onInit(initialData) {
      const data = narrowInitialData(initialData);
      if (data) stage.init(data);
    },

    async onEvent(event) {
      switch (event.type) {
        case 'edge-added': {
          const p = narrowEdgeAdded(event.payload);
          if (p) await stage.addEdge(p.a, p.b, p.aIndex, p.bIndex);
          return;
        }
        case 'query-begin': {
          const p = narrowQuestion(event.payload);
          if (p) stage.setQuestion(p.question);
          return;
        }
        case 'scan-step': {
          const p = narrowScan(event.payload);
          if (p) await stage.scanCell(p);
          return;
        }
        case 'query-done': {
          const p = narrowResult(event.payload);
          if (p) stage.showResult(p);
          return;
        }
        case 'rewind':
          stage.resetView();
          return;
        default:
          // algorithm.ts 가 발신하는 어휘는 위 다섯이 전부다 — 그 외는 silently drop.
          return;
      }
    },

    onReset() {
      stage.resetView();
    },
  };
};
