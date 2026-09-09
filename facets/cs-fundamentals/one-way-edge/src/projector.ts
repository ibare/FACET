/**
 * one-way-edge projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 오픈 타입이므로 여기서 한 번 좁히고, stage 에는 좁혀진 값만
 * 넘긴다 (C9). 화면에 뜨는 문안은 전부 키로 조회하며 (C10) 문안 자체는
 * `facet.ts` 의 messages 에 있다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory } from '@ffacet/core/runtime';

type StageEdge = { u: string; v: string; dir: 'uv' | 'vu' };
type StageGraph = { nodes: string[]; edges: StageEdge[]; source: string };

/** stage 가 노출하는 계약. 구조적 타입이므로 한곳에 모아 둔다 (C9). */
type OneWayEdgeStage = {
  setGraph?(spec: StageGraph): void;
  reset?(): void;
  setCaption?(text: string): void;
  setMode?(mode: 'undirected' | 'directed', source: string): Promise<void> | void;
  walk?(from: string, to: string): Promise<void> | void;
  blocked?(node: string, from: string[]): Promise<void> | void;
  pushOut?(node: string): Promise<void> | void;
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function edgeList(v: unknown): StageEdge[] {
  if (!Array.isArray(v)) return [];
  const out: StageEdge[] = [];
  for (const item of v) {
    if (typeof item !== 'object' || item === null) continue;
    const e = item as { u?: unknown; v?: unknown; dir?: unknown };
    if (typeof e.u !== 'string' || typeof e.v !== 'string') continue;
    if (e.dir !== 'uv' && e.dir !== 'vu') continue;
    out.push({ u: e.u, v: e.v, dir: e.dir });
  }
  return out;
}

export const oneWayEdgeProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as OneWayEdgeStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { nodes?: unknown; edges?: unknown; source?: unknown } | undefined;
      stage?.setGraph?.({
        nodes: strList(d?.nodes),
        edges: edgeList(d?.edges),
        source: str(d?.source),
      });
    },

    onReset(): void {
      stage?.reset?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'mode-changed': {
          const p = event.payload as { mode?: unknown; source?: unknown; lines?: unknown } | undefined;
          const mode = p?.mode === 'directed' ? 'directed' : 'undirected';
          const source = str(p?.source);
          stage?.setCaption?.(
            mode === 'undirected'
              ? tr('caption.undirected', 'No arrows yet — every line runs both ways.')
              : tr('caption.directed', 'The same {lines} lines take arrows. Each keeps one way only.', {
                  lines: num(p?.lines),
                }),
          );
          await stage?.setMode?.(mode, source);
          return;
        }

        case 'walk-step': {
          const p = event.payload as { from?: unknown; to?: unknown } | undefined;
          await stage?.walk?.(str(p?.from), str(p?.to));
          return;
        }

        case 'walk-done': {
          const p = event.payload as
            | { source?: unknown; reached?: unknown; total?: unknown }
            | undefined;
          stage?.setCaption?.(
            tr('caption.openReach', 'From {source}, every one of the {total} vertices is reachable.', {
              source: str(p?.source),
              total: num(p?.total),
            }),
          );
          return;
        }

        case 'walk-blocked': {
          const p = event.payload as { node?: unknown; from?: unknown } | undefined;
          const node = str(p?.node);
          stage?.setCaption?.(
            tr('caption.blocked', 'Every line at {node} points away — nothing arrives.', { node }),
          );
          await stage?.blocked?.(node, strList(p?.from));
          return;
        }

        case 'push-out': {
          const p = event.payload as { node?: unknown } | undefined;
          await stage?.pushOut?.(str(p?.node));
          return;
        }

        case 'done': {
          const p = event.payload as
            | { source?: unknown; reached?: unknown; total?: unknown; stranded?: unknown }
            | undefined;
          stage?.setCaption?.(
            tr('caption.stranded', 'From {source}: {reached} of {total}. {nodes} is out of reach.', {
              source: str(p?.source),
              reached: num(p?.reached),
              total: num(p?.total),
              nodes: strList(p?.stranded).join(', '),
            }),
          );
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          return;
        }

        default:
          // 이 알고리즘이 보내는 이벤트는 위가 전부다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },
  };
};
