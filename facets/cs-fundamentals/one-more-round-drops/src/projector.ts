/**
 * one-more-round-drops 의 projector — algorithm 이벤트를 stage 메서드로 옮긴다.
 *
 * payload 는 `unknown` 이므로 여기서 한 번에 좁힌다 (C9). stage 는 좁혀진 값만
 * 받고, 캡션 문안은 여기서 키로 조회한다 (C10) — algorithm 은 문안을 모른다.
 */

import { makeTranslator, parseTarget } from '@ffacet/core/runtime';
import type {
  FacetEventTarget,
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type Entry = { node: string; value: number | null; delta: number | null };
type EdgeSpec = { from: string; to: string; w: number };

/** stage 의 계약. optional 로 두고 `?.()` 로 부른다 (C9). */
type OneMoreRoundDropsStage = {
  showGraph?(spec: {
    nodes: string[];
    edges: EdgeSpec[];
    source: string;
    entries: Entry[];
    vMax: number;
    vMin: number;
  }): void;
  applyRound?(spec: {
    round: number;
    beyond: boolean;
    entries: Entry[];
    relaxed: string[];
  }): void | Promise<void>;
  markFloor?(spec: { entries: Entry[] }): void;
  markKeepsFalling?(spec: { cycle: string[] }): void | Promise<void>;
  setCaption?(text: string): void;
  resetScene?(): void;
};

function readEntries(raw: unknown): Entry[] {
  if (!Array.isArray(raw)) return [];
  const out: Entry[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as { node?: unknown; value?: unknown; delta?: unknown };
    if (typeof row.node !== 'string') continue;
    out.push({
      node: row.node,
      value: typeof row.value === 'number' ? row.value : null,
      delta: typeof row.delta === 'number' ? row.delta : null,
    });
  }
  return out;
}

function readEdges(raw: unknown): EdgeSpec[] {
  if (!Array.isArray(raw)) return [];
  const out: EdgeSpec[] = [];
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const row = item as { from?: unknown; to?: unknown; w?: unknown };
    if (typeof row.from !== 'string' || typeof row.to !== 'string') continue;
    out.push({ from: row.from, to: row.to, w: typeof row.w === 'number' ? row.w : 0 });
  }
  return out;
}

function readNames(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
}

function readNumber(raw: unknown, fallback: number): number {
  return typeof raw === 'number' ? raw : fallback;
}

/** `edge:A-B` 목록에서 간선 키만 꺼낸다. 파싱은 parseTarget 경유다 (C1). */
function readEdgeKeys(target: FacetEventTarget | undefined): string[] {
  if (target === undefined) return [];
  const list = Array.isArray(target) ? target : [target];
  const out: string[] = [];
  for (const item of list) {
    if (typeof item !== 'string') continue;
    const parsed = parseTarget(item);
    if (parsed?.prefix !== 'edge' || parsed.id === '') continue;
    out.push(parsed.id);
  }
  return out;
}

export const oneMoreRoundDropsProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as OneMoreRoundDropsStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onReset(): void {
      stage.resetScene?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const payload = event.payload as
        | {
            nodes?: unknown;
            edges?: unknown;
            source?: unknown;
            entries?: unknown;
            vMax?: unknown;
            vMin?: unknown;
            round?: unknown;
            beyond?: unknown;
          }
        | undefined;

      switch (event.type) {
        case 'graph-ready': {
          stage.showGraph?.({
            nodes: readNames(payload?.nodes),
            edges: readEdges(payload?.edges),
            source: typeof payload?.source === 'string' ? payload.source : '',
            entries: readEntries(payload?.entries),
            vMax: readNumber(payload?.vMax, 0),
            vMin: readNumber(payload?.vMin, 0),
          });
          stage.setCaption?.(
            tr('caption.start', 'Only the start is 0. The rest are still unknown.'),
          );
          return;
        }

        case 'round-dropped': {
          const round = readNumber(payload?.round, 0);
          const beyond = payload?.beyond === true;
          stage.setCaption?.(
            beyond
              ? tr('caption.beyond', 'Round {n}: they fall through the floor.', { n: round })
              : tr('caption.round', 'Round {n}: the numbers drop.', { n: round }),
          );
          await stage.applyRound?.({
            round,
            beyond,
            entries: readEntries(payload?.entries),
            relaxed: readEdgeKeys(event.target),
          });
          return;
        }

        case 'bound-marked': {
          const round = readNumber(payload?.round, 0);
          stage.markFloor?.({ entries: readEntries(payload?.entries) });
          stage.setCaption?.(
            tr('caption.floor', 'Round {n} is over. This is where they should stop.', {
              n: round,
            }),
          );
          return;
        }

        case 'keeps-falling': {
          stage.setCaption?.(
            tr('caption.never', 'Every round, the same drop. It never stops.'),
          );
          await stage.markKeepsFalling?.({ cycle: readEdgeKeys(event.target) });
          return;
        }

        case 'rewind': {
          stage.resetScene?.();
          return;
        }

        default:
          // 이 조각이 내보내는 이벤트는 위가 전부다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },
  };
};
