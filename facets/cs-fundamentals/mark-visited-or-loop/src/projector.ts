/**
 * mark-visited-or-loop Projector — 걸음 이벤트를 stage 의 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 만들고, 형이 맞지 않으면 그 이벤트를 버린다.
 * stage 는 좁혀진 값만 본다 (C9).
 *
 * 화면 문안은 전부 키로만 여기 있고 실제 문장은 `facet.ts` 의 `messages` 에 있다 (C10).
 */

import { makeTranslator, parseTarget } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage view 가 노출하는 계약. 러너가 주는 ViewInstance 는 열린 타입이라 좁혀 쓴다. */
type MarkVisitedStage = {
  setGraph?(spec: {
    nodes: string[];
    adjacency: Record<string, string[]>;
    start: string;
    maxSteps: number;
  }): void;
  reset?(): void;
  beginWalk?(o: { start: string }): void;
  markNode?(node: string): void;
  skipNeighbor?(o: { from: string; to: string }): Promise<void> | void;
  moveToken?(o: { from: string; to: string; revisit: boolean }): Promise<void> | void;
  finishWalk?(o: { escaped: boolean; missed: string[] }): void;
  setCaption?(text: string): void;
};

type BeginPayload = { marks: boolean; start: string };
type EdgePayload = { from: string; to: string };
type MovePayload = EdgePayload & { revisit: boolean };
type EndPayload = { steps: number; reached: string[]; missed: string[] };

function readBegin(payload: unknown): BeginPayload | null {
  const p = payload as { marks?: unknown; start?: unknown } | undefined;
  if (typeof p?.marks !== 'boolean' || typeof p.start !== 'string') return null;
  return { marks: p.marks, start: p.start };
}

function readEdge(payload: unknown): EdgePayload | null {
  const p = payload as { from?: unknown; to?: unknown } | undefined;
  if (typeof p?.from !== 'string' || typeof p.to !== 'string') return null;
  return { from: p.from, to: p.to };
}

function readMove(payload: unknown): MovePayload | null {
  const edge = readEdge(payload);
  if (!edge) return null;
  const p = payload as { revisit?: unknown };
  return { ...edge, revisit: p.revisit === true };
}

function readEnd(payload: unknown): EndPayload | null {
  const p = payload as { steps?: unknown; reached?: unknown; missed?: unknown } | undefined;
  if (typeof p?.steps !== 'number') return null;
  const reached = Array.isArray(p.reached)
    ? (p.reached as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  const missed = Array.isArray(p.missed)
    ? (p.missed as unknown[]).filter((v): v is string => typeof v === 'string')
    : [];
  return { steps: p.steps, reached, missed };
}

function readGraph(source: unknown): {
  nodes: string[];
  adjacency: Record<string, string[]>;
  start: string;
  maxSteps: number;
} | null {
  const d = source as
    | { nodes?: unknown; adjacency?: unknown; start?: unknown; maxSteps?: unknown }
    | undefined;
  if (!Array.isArray(d?.nodes) || typeof d.start !== 'string') return null;
  if (typeof d.maxSteps !== 'number' || d.maxSteps <= 0) return null;
  if (typeof d.adjacency !== 'object' || d.adjacency === null) return null;
  const nodes = (d.nodes as unknown[]).filter((v): v is string => typeof v === 'string');
  const adjacency: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(d.adjacency as Record<string, unknown>)) {
    adjacency[key] = Array.isArray(value)
      ? (value as unknown[]).filter((v): v is string => typeof v === 'string')
      : [];
  }
  return { nodes, adjacency, start: d.start, maxSteps: Math.floor(d.maxSteps) };
}

/** `node:<id>` 만 받는다. 다른 prefix 는 이 facet 의 어휘가 아니다 (C1). */
function readNodeTarget(target: FacetRuntimeEvent['target']): string | null {
  const one = Array.isArray(target) ? target[0] : target;
  if (typeof one !== 'string') return null;
  const parsed = parseTarget(one);
  if (parsed?.prefix !== 'node' || parsed.id === '') return null;
  return parsed.id;
}

export const markVisitedOrLoopProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as MarkVisitedStage | undefined;
  // 러너 밖 mount 를 위한 fallback. 러너가 주는 조회기에는 저작자 오버라이드가
  // 이미 얹혀 있다 (C10).
  const tr = runtime?.t ?? makeTranslator();

  /** `{name}` 자리 채우기는 조회기가 한다 — 이어붙이면 어순이 다른 말에서 깨진다. */
  const say = (key: string, source: string, vars?: Record<string, string | number>): void => {
    stage?.setCaption?.(tr(key, source, vars));
  };

  return {
    onInit(initialData: unknown): void {
      const graph = readGraph(initialData);
      if (graph) stage?.setGraph?.(graph);
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'walk-begin': {
          const p = readBegin(event.payload);
          if (!p) return;
          stage?.beginWalk?.({ start: p.start });
          if (p.marks) {
            say('caption.marksOn', 'Now every place visited leaves a mark.');
          } else {
            say('caption.noMarks', 'No marks. From each place, take the first neighbor.');
          }
          return;
        }

        case 'mark': {
          const node = readNodeTarget(event.target);
          if (node) stage?.markNode?.(node);
          return;
        }

        case 'skip-neighbor': {
          const p = readEdge(event.payload);
          if (!p) return;
          await stage?.skipNeighbor?.(p);
          say('caption.alreadyMarked', '{to} already carries a mark — skip it.', { to: p.to });
          return;
        }

        case 'step-move': {
          const p = readMove(event.payload);
          if (!p) return;
          await stage?.moveToken?.(p);
          return;
        }

        case 'walk-stalled': {
          const p = readEnd(event.payload);
          if (!p) return;
          stage?.finishWalk?.({ escaped: false, missed: p.missed });
          say(
            'caption.stillInside',
            '{steps} steps, only {reached} places. {missed} was never reached.',
            { steps: p.steps, reached: p.reached.length, missed: p.missed.join(', ') },
          );
          return;
        }

        case 'walk-escaped': {
          const p = readEnd(event.payload);
          if (!p) return;
          stage?.finishWalk?.({ escaped: true, missed: [] });
          say('caption.wentOut', '{steps} steps, all {reached} places. The walk went outside.', {
            steps: p.steps,
            reached: p.reached.length,
          });
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          return;
        }

        // 자동 재생의 끝. 마지막 캡션이 그대로 남아 있는 것이 완료 상태다.
        case 'done':
          return;

        // 이 알고리즘이 위 목록 밖의 이벤트를 발신하지 않는다. 들어오면 버린다 (C2).
        default:
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
    },
  };
};
