/**
 * indegree-zero-first projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁힌다. stage 는 이미 정형화된 값만 받는다 (C9).
 * 화면 문안은 키로만 들고 있고 문장은 `facet.ts` 의 messages 가 정본이다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type Stage = {
  setGraph(graph: { nodes: string[]; edges: { from: string; to: string }[] }): void;
  showCounts(counts: { id: string; count: number }[]): Promise<void>;
  markReady(ids: string[]): Promise<void>;
  takeVertex(id: string, slot: number): Promise<void>;
  dropArrows(from: string, drops: { to: string; was: number; now: number }[]): Promise<void>;
  finish(order: string[]): Promise<void>;
  rewind(): void;
  setCaption(text: string): void;
};

type CountPayload = { counts?: unknown };
type LayerPayload = { distance?: unknown; nodes?: unknown };
type DequeuePayload = { id?: unknown; slot?: unknown };
type DropPayload = { from?: unknown; drops?: unknown };
type DonePayload = { order?: unknown };

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

function asCounts(value: unknown): { id: string; count: number }[] {
  if (!Array.isArray(value)) return [];
  const out: { id: string; count: number }[] = [];
  for (const item of value) {
    const entry = item as { id?: unknown; count?: unknown } | null;
    if (!entry || typeof entry.id !== 'string' || typeof entry.count !== 'number') continue;
    out.push({ id: entry.id, count: entry.count });
  }
  return out;
}

function asDrops(value: unknown): { to: string; was: number; now: number }[] {
  if (!Array.isArray(value)) return [];
  const out: { to: string; was: number; now: number }[] = [];
  for (const item of value) {
    const entry = item as { to?: unknown; was?: unknown; now?: unknown } | null;
    if (
      !entry ||
      typeof entry.to !== 'string' ||
      typeof entry.was !== 'number' ||
      typeof entry.now !== 'number'
    ) {
      continue;
    }
    out.push({ to: entry.to, was: entry.was, now: entry.now });
  }
  return out;
}

function asGraph(value: unknown): { nodes: string[]; edges: { from: string; to: string }[] } {
  const data = value as { nodes?: unknown; edges?: unknown } | null;
  const nodes = asStringList(data?.nodes);
  const edges: { from: string; to: string }[] = [];
  if (Array.isArray(data?.edges)) {
    for (const item of data.edges) {
      const edge = item as { from?: unknown; to?: unknown } | null;
      if (!edge || typeof edge.from !== 'string' || typeof edge.to !== 'string') continue;
      edges.push({ from: edge.from, to: edge.to });
    }
  }
  return { nodes, edges };
}

export const indegreeZeroFirstProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const joinIds = (ids: string[]): string => ids.join(', ');
  const joinOrder = (ids: string[]): string => ids.join(' → ');
  const joinDrops = (drops: { to: string; was: number; now: number }[]): string =>
    drops.map((d) => `${d.to} ${d.was}→${d.now}`).join(', ');

  return {
    onInit(initialData: unknown): void {
      stage?.setGraph(asGraph(initialData));
      stage?.setCaption('');
    },

    onReset(): void {
      stage?.rewind();
      stage?.setCaption('');
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;

      switch (event.type) {
        case 'indegrees-counted': {
          const p = event.payload as CountPayload | undefined;
          stage.setCaption(tr('caption.count', 'Count the arrows coming into each vertex.'));
          await stage.showCounts(asCounts(p?.counts));
          return;
        }

        case 'layer-discovered': {
          const p = event.payload as LayerPayload | undefined;
          const ids = asStringList(p?.nodes);
          if (ids.length === 0) return;
          const atStart = typeof p?.distance === 'number' && p.distance === 0;
          stage.setCaption(
            atStart
              ? tr('caption.startReady', '{ids} carry nothing — only these can be taken now.', {
                  ids: joinIds(ids),
                })
              : tr('caption.newReady', '{ids} just reached 0 — they fall next.', {
                  ids: joinIds(ids),
                }),
          );
          await stage.markReady(ids);
          return;
        }

        case 'dequeue': {
          const p = event.payload as DequeuePayload | undefined;
          if (typeof p?.id !== 'string' || typeof p.slot !== 'number') return;
          stage.setCaption(tr('caption.take', 'Take {id} — it carries 0.', { id: p.id }));
          await stage.takeVertex(p.id, p.slot);
          return;
        }

        case 'arrows-dropped': {
          const p = event.payload as DropPayload | undefined;
          if (typeof p?.from !== 'string') return;
          const drops = asDrops(p.drops);
          if (drops.length === 0) return;
          stage.setCaption(
            tr('caption.drop', '{id} is gone, so the arrows it held fall off: {drops}', {
              id: p.from,
              drops: joinDrops(drops),
            }),
          );
          await stage.dropArrows(p.from, drops);
          return;
        }

        case 'rewind': {
          stage.rewind();
          stage.setCaption('');
          return;
        }

        case 'done': {
          const p = event.payload as DonePayload | undefined;
          const order = asStringList(p?.order);
          stage.setCaption(tr('caption.done', 'Order: {order}', { order: joinOrder(order) }));
          await stage.finish(order);
          return;
        }

        default:
          // 이 facet 의 algorithm 은 위 여섯 가지만 발신한다. 그 밖은 조용히 버린다.
          return;
      }
    },
  };
};
