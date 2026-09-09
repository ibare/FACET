/**
 * 되짚어 나오기 Projector — 걸음 이벤트를 무대 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁힌다. stage 는 이미 좁혀진 값만 받는다 (C9).
 * 문안은 키로만 다루고 실제 문장은 `facet.ts` 의 messages 에 있다 (C10).
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance, ProjectorRuntime, ProjectorViews } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

/** stage 가 노출하는 계약. 열린 타입을 좁히는 자리는 이 한 곳뿐이다 (C9). */
type DiveStage = {
  setGraph?: (graph: { vertices: string[]; edges: [string, string][]; start: string }) => void;
  setCaption?: (text: string) => void;
  enterRoot?: (node: string) => Promise<void>;
  descend?: (step: { from: string; to: string; depth: number }) => Promise<void>;
  markDeadEnd?: (node: string) => Promise<void>;
  retreat?: (step: { from: string; to: string; depth: number }) => Promise<void>;
  finish?: () => void;
  rewind?: () => void;
};

type MovePayload = { from: string; to: string; depth: number };

function readMove(payload: unknown): MovePayload | null {
  const p = payload as { from?: unknown; to?: unknown; depth?: unknown } | undefined;
  if (typeof p?.from !== 'string' || typeof p.to !== 'string' || typeof p.depth !== 'number') {
    return null;
  }
  return { from: p.from, to: p.to, depth: p.depth };
}

function readNode(payload: unknown): string | null {
  const p = payload as { node?: unknown } | undefined;
  return typeof p?.node === 'string' ? p.node : null;
}

function readTally(payload: unknown): { visited: number; backtracks: number } | null {
  const p = payload as { visited?: unknown; backtracks?: unknown } | undefined;
  if (typeof p?.visited !== 'number' || typeof p.backtracks !== 'number') return null;
  return { visited: p.visited, backtracks: p.backtracks };
}

function readGraph(
  data: unknown,
): { vertices: string[]; edges: [string, string][]; start: string } | null {
  const d = data as { vertices?: unknown; edges?: unknown; start?: unknown } | undefined;
  if (!Array.isArray(d?.vertices) || !Array.isArray(d.edges) || typeof d.start !== 'string') {
    return null;
  }
  const vertices = d.vertices.filter((v): v is string => typeof v === 'string');
  const edges: [string, string][] = [];
  for (const raw of d.edges) {
    if (!Array.isArray(raw) || raw.length < 2) continue;
    const [a, b] = raw;
    if (typeof a !== 'string' || typeof b !== 'string') continue;
    edges.push([a, b]);
  }
  return { vertices, edges, start: d.start };
}

export const diveThenBacktrackProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as DiveStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const graph = readGraph(initialData);
      if (graph) stage?.setGraph?.(graph);
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'enter-root': {
          const node = readNode(event.payload);
          if (!node) return;
          stage?.setCaption?.(tr('caption.start', 'Start at {node} and take one branch as far as it goes.', { node }));
          await stage?.enterRoot?.(node);
          return;
        }
        case 'descend': {
          const move = readMove(event.payload);
          if (!move) return;
          stage?.setCaption?.(tr('caption.dive', 'Dig one step deeper into {node}.', { node: move.to }));
          await stage?.descend?.(move);
          return;
        }
        case 'dead-end': {
          const node = readNode(event.payload);
          if (!node) return;
          stage?.setCaption?.(tr('caption.deadEnd', 'Nowhere left to go from {node}.', { node }));
          await stage?.markDeadEnd?.(node);
          return;
        }
        case 'retreat': {
          const move = readMove(event.payload);
          if (!move) return;
          stage?.setCaption?.(tr('caption.retreat', 'Back out to {node} along the way we came.', { node: move.to }));
          await stage?.retreat?.(move);
          return;
        }
        case 'done': {
          const tally = readTally(event.payload);
          if (!tally) return;
          stage?.finish?.();
          stage?.setCaption?.(
            tr(
              'caption.done',
              'All {visited} reached — and {backtracks} of the moves were retreats back up.',
              { visited: tally.visited, backtracks: tally.backtracks },
            ),
          );
          return;
        }
        case 'rewind': {
          stage?.rewind?.();
          return;
        }
        default:
          // 이 algorithm 은 위 여섯 가지만 발신한다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
