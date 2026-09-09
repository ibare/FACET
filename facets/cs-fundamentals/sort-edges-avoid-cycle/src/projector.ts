/**
 * sortEdgesAvoidCycleProjector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 한 번에 좁혀 정형 객체로 만들고, stage 는 필수 필드 타입으로만
 * 받는다 (C9). 화면 문안은 키로만 다루고 문장은 FacetJson.messages 에 있다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

type StageEdge = { id: string; u: string; v: string; weight: number };

type Stage = {
  setLayout?(nodes: string[], edges: StageEdge[]): void;
  setQueue?(order: StageEdge[]): Promise<void> | void;
  pickEdge?(pick: { id: string; u: string; v: string }): Promise<void> | void;
  keepEdge?(keep: {
    id: string;
    u: string;
    v: string;
    groupId: string;
    members: string[];
  }): Promise<void> | void;
  discardEdge?(discard: {
    id: string;
    u: string;
    v: string;
    cyclePath: string[];
  }): Promise<void> | void;
  setCaption?(text: string): void;
  rewind?(): void;
};

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function readEdge(value: unknown): StageEdge | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as { id?: unknown; u?: unknown; v?: unknown; weight?: unknown };
  const id = readString(raw.id);
  const u = readString(raw.u);
  const v = readString(raw.v);
  if (id === '' || u === '' || v === '') return null;
  return { id, u, v, weight: readNumber(raw.weight) };
}

function readEdgeList(value: unknown): StageEdge[] {
  if (!Array.isArray(value)) return [];
  const out: StageEdge[] = [];
  for (const item of value) {
    const edge = readEdge(item);
    if (edge) out.push(edge);
  }
  return out;
}

export const sortEdgesAvoidCycleProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      if (typeof initialData !== 'object' || initialData === null) return;
      const raw = initialData as { nodes?: unknown; edges?: unknown };
      stage?.setLayout?.(readStringList(raw.nodes), readEdgeList(raw.edges));
      stage?.setCaption?.('');
    },

    async onEvent(event): Promise<void> {
      const payload = event.payload as Record<string, unknown> | undefined;

      switch (event.type) {
        case 'queue-ordered': {
          stage?.setCaption?.(
            tr('caption.start', 'The edges stand in line, lightest first.'),
          );
          await stage?.setQueue?.(readEdgeList(payload?.order));
          return;
        }

        case 'edge-picked': {
          const edge = readEdge(payload);
          if (!edge) return;
          stage?.setCaption?.(
            tr('caption.pick', 'Pick up {u}–{v}, weight {weight}.', {
              u: edge.u,
              v: edge.v,
              weight: edge.weight,
            }),
          );
          await stage?.pickEdge?.({ id: edge.id, u: edge.u, v: edge.v });
          return;
        }

        case 'edge-kept': {
          const edge = readEdge(payload);
          if (!edge) return;
          stage?.setCaption?.(
            tr(
              'caption.keep',
              '{u} and {v} are in different groups — lay the edge down, the two groups become one.',
              { u: edge.u, v: edge.v },
            ),
          );
          await stage?.keepEdge?.({
            id: edge.id,
            u: edge.u,
            v: edge.v,
            groupId: readString(payload?.groupId),
            members: readStringList(payload?.members),
          });
          return;
        }

        case 'edge-discarded': {
          const edge = readEdge(payload);
          if (!edge) return;
          stage?.setCaption?.(
            tr(
              'caption.discard',
              '{u} and {v} are already in one group — this edge would close a loop, so it is dropped.',
              { u: edge.u, v: edge.v },
            ),
          );
          await stage?.discardEdge?.({
            id: edge.id,
            u: edge.u,
            v: edge.v,
            cyclePath: readStringList(payload?.cyclePath),
          });
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr(
              'caption.done',
              'Kept {kept}, dropped {discarded}. Total weight {total}.',
              {
                kept: readNumber(payload?.kept),
                discarded: readNumber(payload?.discarded),
                total: readNumber(payload?.totalWeight),
              },
            ),
          );
          return;
        }

        default:
          // 이 algorithm 이 내는 이벤트는 위가 전부다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
