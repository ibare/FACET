/**
 * fewer-hops-not-shorter projector — algorithm 의 이벤트를 무대 메서드 호출로
 * 옮긴다. payload 는 여기서 한 번 좁혀지고 (C9), 무대는 정형 인자만 받는다.
 *
 * 화면에 뜨는 문장은 전부 키로 조회한다 (C10). 길 이름 (`S→A→T`) 은 정점 라벨을
 * 이어 붙인 표식이므로 키를 만들지 않는다.
 */

import {
  makeTranslator,
  parseTarget,
} from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  Translate,
} from '@ffacet/core/runtime';

type RouteWire = { id: string; nodes: string[]; edgeIds: string[]; hops: number };

/** 무대가 노출하는 메서드. 없는 메서드는 호출하지 않는다. */
type Stage = {
  showRoutes?(input: {
    routes: RouteWire[];
    maxHops: number;
    maxTotalWeight: number;
  }): Promise<void>;
  showHops?(input: { routeId: string; label: string }): Promise<void>;
  weighEdge?(input: {
    routeId: string;
    edgeId: string;
    weight: number;
    totalLabel: string;
  }): Promise<void>;
  setVerdict?(routeId: string): Promise<void>;
  setCaption?(text: string): void;
  reset?(): void;
};

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** `edge:S-A` → `S-A`. 식별자 파싱은 언제나 parseTarget 경유 (C1). */
function edgeIdOf(target: unknown): string | undefined {
  if (typeof target !== 'string') return undefined;
  const parsed = parseTarget(target);
  return parsed && parsed.prefix === 'edge' && parsed.id.length > 0 ? parsed.id : undefined;
}

function readRoutes(value: unknown): RouteWire[] {
  if (!Array.isArray(value)) return [];
  const out: RouteWire[] = [];
  for (const raw of value) {
    const r = raw as { id?: unknown; nodes?: unknown; edgeIds?: unknown; hops?: unknown };
    const id = asText(r.id);
    const hops = asNumber(r.hops);
    if (id === undefined || hops === undefined) continue;
    if (!Array.isArray(r.nodes) || !Array.isArray(r.edgeIds)) continue;
    const nodes = r.nodes.filter((n): n is string => typeof n === 'string');
    const edgeIds: string[] = [];
    for (const t of r.edgeIds) {
      const edgeId = edgeIdOf(t);
      if (edgeId !== undefined) edgeIds.push(edgeId);
    }
    out.push({ id, nodes, edgeIds, hops });
  }
  return out;
}

export const fewerHopsNotShorterProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const t: Translate = runtime?.t ?? makeTranslator();

  /** 무대에 보낸 길의 그림자. 길 이름과 간선 수를 캡션에서 다시 쓴다. */
  let routes: RouteWire[] = [];

  const nameOf = (routeId: string | undefined): string => {
    const route = routes.find((r) => r.id === routeId);
    return route ? route.nodes.join('→') : '';
  };

  const hopLabel = (hops: number): string => t('label.hops', '{n} hops', { n: hops });
  const weightLabel = (total: number): string => t('label.weight', 'weight {w}', { w: total });

  return {
    onInit(): void {
      routes = [];
      stage?.reset?.();
    },

    onReset(): void {
      routes = [];
      stage?.reset?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const payload = event.payload as
        | {
            source?: unknown;
            target?: unknown;
            routes?: unknown;
            maxHops?: unknown;
            maxTotalWeight?: unknown;
            routeId?: unknown;
            hops?: unknown;
            rivalId?: unknown;
            rivalHops?: unknown;
            weight?: unknown;
            total?: unknown;
            rivalTotal?: unknown;
          }
        | undefined;

      switch (event.type) {
        case 'routes-found': {
          const parsed = readRoutes(payload?.routes);
          if (parsed.length === 0) return;
          routes = parsed;
          stage?.setCaption?.(
            t('caption.twoRoutes', 'Two routes lead from {source} to {target}.', {
              source: asText(payload?.source) ?? '',
              target: asText(payload?.target) ?? '',
            }),
          );
          await stage?.showRoutes?.({
            routes: parsed,
            maxHops: asNumber(payload?.maxHops) ?? 1,
            maxTotalWeight: asNumber(payload?.maxTotalWeight) ?? 1,
          });
          return;
        }

        case 'hops-counted': {
          const routeId = asText(payload?.routeId);
          const hops = asNumber(payload?.hops);
          if (routeId === undefined || hops === undefined) return;
          stage?.setCaption?.(
            t('caption.countHops', 'First, count only the edges each route crosses.'),
          );
          await stage?.showHops?.({ routeId, label: hopLabel(hops) });
          return;
        }

        case 'hops-verdict': {
          const routeId = asText(payload?.routeId);
          const hops = asNumber(payload?.hops);
          if (routeId === undefined || hops === undefined) return;
          stage?.setCaption?.(
            t('caption.fewerHops', 'Edges: {route} = {hops}, {rival} = {rivalHops}. Fewer here.', {
              route: nameOf(routeId),
              hops,
              rival: nameOf(asText(payload?.rivalId)),
              rivalHops: asNumber(payload?.rivalHops) ?? 0,
            }),
          );
          await stage?.setVerdict?.(routeId);
          return;
        }

        case 'edge-weighed': {
          const routeId = asText(payload?.routeId);
          const edgeId = edgeIdOf(Array.isArray(event.target) ? event.target[0] : event.target);
          const weight = asNumber(payload?.weight);
          const total = asNumber(payload?.total);
          if (routeId === undefined || edgeId === undefined) return;
          if (weight === undefined || total === undefined) return;
          stage?.setCaption?.(
            t('caption.weighing', 'Weighing {route}: {total} so far.', {
              route: nameOf(routeId),
              total,
            }),
          );
          await stage?.weighEdge?.({ routeId, edgeId, weight, totalLabel: weightLabel(total) });
          return;
        }

        case 'weight-verdict': {
          const routeId = asText(payload?.routeId);
          const total = asNumber(payload?.total);
          if (routeId === undefined || total === undefined) return;
          stage?.setCaption?.(
            t(
              'caption.reversed',
              'Weight: {route} = {total}, {rival} = {rivalTotal}. The order reverses.',
              {
                route: nameOf(routeId),
                total,
                rival: nameOf(asText(payload?.rivalId)),
                rivalTotal: asNumber(payload?.rivalTotal) ?? 0,
              },
            ),
          );
          await stage?.setVerdict?.(routeId);
          return;
        }

        case 'rewind': {
          routes = [];
          stage?.reset?.();
          return;
        }

        // 그 밖의 이벤트는 이 조각이 발신하지 않는다 — 조용히 흘려보낸다.
        default:
          return;
      }
    },
  };
};
