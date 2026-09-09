/**
 * grow-one-tree projector — algorithm 이 발신한 걸음을 stage 의 메서드로 옮긴다.
 *
 * payload 는 여기서 좁힌다 (C9). stage 는 좁혀진 값만 받고, 화면 문안은 여기서
 * 키로 조회한다 (C10) — algorithm 은 문안을 모른다.
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';

type StageEdge = { id: string; u: string; v: string; w: number };

type Stage = {
  setGraph(graph: { nodes: string[]; edges: StageEdge[] }): void;
  setCaption(text: string): void;
  seed(node: string): Promise<void>;
  showFrontier(candidates: string[]): Promise<void>;
  grow(edgeId: string, from: string, to: string): Promise<void>;
  markDone(): Promise<void>;
  reset(): void;
};

function readGraph(initialData: unknown): { nodes: string[]; edges: StageEdge[] } {
  const data = initialData as { nodes?: unknown; edges?: unknown } | undefined;
  const nodes: string[] = [];
  if (Array.isArray(data?.nodes)) {
    for (const n of data.nodes) if (typeof n === 'string') nodes.push(n);
  }
  const edges: StageEdge[] = [];
  if (Array.isArray(data?.edges)) {
    for (const raw of data.edges) {
      const e = raw as { id?: unknown; u?: unknown; v?: unknown; w?: unknown };
      if (
        typeof e?.id !== 'string' ||
        typeof e.u !== 'string' ||
        typeof e.v !== 'string' ||
        typeof e.w !== 'number'
      ) {
        continue;
      }
      edges.push({ id: e.id, u: e.u, v: e.v, w: e.w });
    }
  }
  return { nodes, edges };
}

export const growOneTreeProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** ctx.data 의 그림자. 화면에 쓸 간선 이름을 짓는 데만 쓴다. */
  const known = new Map<string, StageEdge>();

  /** 화면에 보이는 간선 이름. 데이터의 id 가 아니라 두 끝으로 짓는다. */
  const nameOf = (id: string): string => {
    const e = known.get(id);
    return e ? `${e.u}–${e.v}` : id;
  };

  return {
    onInit(initialData: unknown): void {
      const graph = readGraph(initialData);
      known.clear();
      for (const e of graph.edges) known.set(e.id, e);
      stage?.setGraph(graph);
    },

    onReset(): void {
      stage?.reset();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'tree-seeded': {
          const p = event.payload as { node?: unknown } | undefined;
          if (typeof p?.node !== 'string') return;
          stage?.setCaption(
            tr('caption.seed', 'Start with {node} alone — that is the whole tree.', {
              node: p.node,
            }),
          );
          await stage?.seed(p.node);
          return;
        }

        case 'frontier-shown': {
          const p = event.payload as { candidates?: unknown } | undefined;
          if (!Array.isArray(p?.candidates)) return;
          const ids = p.candidates.filter((id): id is string => typeof id === 'string');
          stage?.setCaption(
            tr('caption.frontier', 'Only the {count} edges leading out of the tree can be picked.', {
              count: ids.length,
            }),
          );
          await stage?.showFrontier(ids);
          return;
        }

        case 'edge-chosen': {
          const p = event.payload as
            | {
                edgeId?: unknown;
                from?: unknown;
                to?: unknown;
                weight?: unknown;
                blockedEdge?: unknown;
                blockedWeight?: unknown;
              }
            | undefined;
          if (
            typeof p?.edgeId !== 'string' ||
            typeof p.from !== 'string' ||
            typeof p.to !== 'string' ||
            typeof p.weight !== 'number'
          ) {
            return;
          }
          const blocked =
            typeof p.blockedEdge === 'string' && typeof p.blockedWeight === 'number'
              ? { edge: nameOf(p.blockedEdge), weight: p.blockedWeight }
              : undefined;
          stage?.setCaption(
            blocked === undefined
              ? tr('caption.pick', 'The lightest of them is {weight} — {node} joins the tree.', {
                  weight: p.weight,
                  node: p.to,
                })
              : tr(
                  'caption.pickBlocked',
                  'The lightest of them is {weight} — {node} joins the tree.\n{edge} weighs only {blocked}, but it does not touch the tree yet.',
                  {
                    weight: p.weight,
                    node: p.to,
                    edge: blocked.edge,
                    blocked: blocked.weight,
                  },
                ),
          );
          await stage?.grow(p.edgeId, p.from, p.to);
          return;
        }

        case 'rewind': {
          stage?.reset();
          return;
        }

        case 'done': {
          const p = event.payload as { edgeCount?: unknown; total?: unknown } | undefined;
          if (typeof p?.edgeCount !== 'number' || typeof p.total !== 'number') return;
          stage?.setCaption(
            tr('caption.done', 'The tree is full — {count} edges, total weight {total}.', {
              count: p.edgeCount,
              total: p.total,
            }),
          );
          await stage?.markDone();
          return;
        }

        default:
          // 이 facet 의 algorithm 은 위 다섯만 발신한다. 그 밖의 이벤트는 조용히 버린다 (C2).
          return;
      }
    },
  };
};
