/**
 * bottleneckSetsFlow projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 `unknown` 이므로 여기서 가드로 좁힌 뒤 정형 객체만 stage 로 넘긴다
 * (C9). 화면 문안은 키로만 들고 `runtime.t` 로 해석한다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type StagePipe = { id: string; from: string; to: string; capacity: number };

type Stage = {
  setNetwork?(net: { nodes: string[]; edges: StagePipe[]; source: string; sink: string }): void;
  reset?(): void;
  showPath?(p: { edges: string[] }): Promise<void> | void;
  markNarrowest?(p: {
    edges: string[];
    rooms: number[];
    narrowest: string[];
  }): Promise<void> | void;
  pushFlow?(p: {
    edges: string[];
    flows: number[];
    total: number;
    full: string[];
  }): Promise<void> | void;
  showBlocked?(p: { edges: string[] }): Promise<void> | void;
  showDone?(): Promise<void> | void;
  setCaption?(text: string): void;
};

const asStrings = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

const asNumbers = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];

const asNumber = (v: unknown): number => (typeof v === 'number' ? v : 0);

function asPipe(v: unknown): StagePipe | null {
  const e = v as { id?: unknown; from?: unknown; to?: unknown; capacity?: unknown } | undefined;
  if (typeof e?.id !== 'string') return null;
  if (typeof e.from !== 'string' || typeof e.to !== 'string') return null;
  if (typeof e.capacity !== 'number') return null;
  return { id: e.id, from: e.from, to: e.to, capacity: e.capacity };
}

export const bottleneckSetsFlowProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const d = initialData as
        | { nodes?: unknown; edges?: unknown; source?: unknown; sink?: unknown }
        | undefined;
      const nodes = asStrings(d?.nodes);
      const edges = Array.isArray(d?.edges)
        ? d.edges.map(asPipe).filter((p): p is StagePipe => p !== null)
        : [];
      const source = typeof d?.source === 'string' ? d.source : '';
      const sink = typeof d?.sink === 'string' ? d.sink : '';
      if (nodes.length === 0 || edges.length === 0) return;
      stage?.setNetwork?.({ nodes, edges, source, sink });
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = event.payload as
        | {
            nodes?: unknown;
            edges?: unknown;
            rooms?: unknown;
            narrowest?: unknown;
            flows?: unknown;
            full?: unknown;
            amount?: unknown;
            total?: unknown;
          }
        | undefined;

      switch (event.type) {
        case 'rewind': {
          stage?.reset?.();
          return;
        }

        case 'path-found': {
          const route = asStrings(p?.nodes).join(' → ');
          stage?.setCaption?.(
            tr('caption.pathFound', 'Found a route that still has room: {route}', { route }),
          );
          await stage?.showPath?.({ edges: asStrings(p?.edges) });
          return;
        }

        case 'narrowest-marked': {
          stage?.setCaption?.(
            tr(
              'caption.narrowest',
              'The narrowest pipe on this route has room for {amount} — that is all this route can take',
              { amount: asNumber(p?.amount) },
            ),
          );
          await stage?.markNarrowest?.({
            edges: asStrings(p?.edges),
            rooms: asNumbers(p?.rooms),
            narrowest: asStrings(p?.narrowest),
          });
          return;
        }

        case 'flow-pushed': {
          stage?.setCaption?.(
            tr('caption.pushed', 'Sent {amount} through. {total} has arrived so far', {
              amount: asNumber(p?.amount),
              total: asNumber(p?.total),
            }),
          );
          await stage?.pushFlow?.({
            edges: asStrings(p?.edges),
            flows: asNumbers(p?.flows),
            total: asNumber(p?.total),
            full: asStrings(p?.full),
          });
          return;
        }

        case 'no-more-room': {
          stage?.setCaption?.(
            tr(
              'caption.noMoreRoom',
              'Every pipe leaving the source is full — there is no route left',
            ),
          );
          await stage?.showBlocked?.({ edges: asStrings(p?.edges) });
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr('caption.done', '{total} in total — nothing more can get through', {
              total: asNumber(p?.total),
            }),
          );
          await stage?.showDone?.();
          return;
        }

        // 이 facet 이 내보내는 이벤트는 위가 전부다. 다른 것이 오면 조용히 버린다 (C2).
        default:
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
    },
  };
};
