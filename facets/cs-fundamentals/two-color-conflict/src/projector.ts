/**
 * twoColorConflictProjector — 답사 이벤트를 stage 의 그림 동작으로 옮긴다.
 *
 * algorithm 은 정점 이름과 색 번호만 보내고, 무엇이라 말할지는 여기서 정한다
 * (C10 — 문안은 키로 조회하고 en 원본만 호출부에 남긴다).
 * payload 는 전부 좁힌 뒤 stage 로 넘긴다 (C9).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, ProjectorFactory, Translate } from '@ffacet/core/runtime';

type RingSpec = { nodes: string[]; edges: { a: string; b: string }[] };
type PaintStep = { node: string; prev: string | null; edge: string | null; color: number };
type CloseStep = { a: string; b: string; same: boolean };
type ConflictMark = { a: string; b: string };

type TwoColorStage = {
  setRing?(spec: RingSpec): void;
  setCaption?(text: string, alert?: boolean): void;
  paintStep?(step: PaintStep): Promise<void> | void;
  closeStep?(step: CloseStep): Promise<void> | void;
  markConflict?(mark: ConflictMark): Promise<void> | void;
  rewind?(): void;
};

function readRing(data: unknown): RingSpec | null {
  const d = data as { nodes?: unknown; edges?: unknown } | undefined;
  if (!Array.isArray(d?.nodes) || !Array.isArray(d?.edges)) return null;
  const nodes: string[] = [];
  for (const n of d.nodes) if (typeof n === 'string') nodes.push(n);
  const edges: { a: string; b: string }[] = [];
  for (const e of d.edges) {
    const pair = e as { a?: unknown; b?: unknown };
    if (typeof pair?.a === 'string' && typeof pair?.b === 'string') {
      edges.push({ a: pair.a, b: pair.b });
    }
  }
  if (nodes.length === 0 || edges.length === 0) return null;
  return { nodes, edges };
}

function readPaintStep(payload: unknown): PaintStep | null {
  const p = payload as
    | { node?: unknown; prev?: unknown; edge?: unknown; color?: unknown }
    | undefined;
  if (typeof p?.node !== 'string' || typeof p?.color !== 'number') return null;
  return {
    node: p.node,
    prev: typeof p.prev === 'string' ? p.prev : null,
    edge: typeof p.edge === 'string' ? p.edge : null,
    color: p.color,
  };
}

function readCloseStep(payload: unknown): CloseStep | null {
  const p = payload as { a?: unknown; b?: unknown; same?: unknown } | undefined;
  if (typeof p?.a !== 'string' || typeof p?.b !== 'string') return null;
  return { a: p.a, b: p.b, same: p.same === true };
}

function readDone(
  payload: unknown,
): { a: string; b: string; ringLength: number; odd: boolean } | null {
  const p = payload as
    | { a?: unknown; b?: unknown; ringLength?: unknown; odd?: unknown }
    | undefined;
  if (typeof p?.a !== 'string' || typeof p?.b !== 'string') return null;
  if (typeof p?.ringLength !== 'number') return null;
  return { a: p.a, b: p.b, ringLength: p.ringLength, odd: p.odd === true };
}

export const twoColorConflictProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as TwoColorStage | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();

  const openingCaption = (): void => {
    stage?.setCaption?.(
      tr('caption.start', 'A ring of vertices, none of them painted yet.'),
    );
  };

  return {
    onInit(initialData: unknown): void {
      const ring = readRing(initialData);
      if (ring) stage?.setRing?.(ring);
      openingCaption();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'walk-step': {
          const step = readPaintStep(event.payload);
          if (!step) return;
          if (step.prev === null) {
            stage?.setCaption?.(
              tr('caption.first', 'Start at {node} with the first color.', { node: step.node }),
            );
          } else {
            stage?.setCaption?.(
              tr('caption.alternate', '{prev} to {node} — neighbors differ, so the color flips.', {
                prev: step.prev,
                node: step.node,
              }),
            );
          }
          await stage?.paintStep?.(step);
          return;
        }

        case 'close-edge': {
          const step = readCloseStep(event.payload);
          if (!step) return;
          stage?.setCaption?.(
            tr('caption.lastEdge', 'One edge is left: {a}-{b}.', { a: step.a, b: step.b }),
          );
          await stage?.closeStep?.(step);
          if (step.same) {
            stage?.setCaption?.(
              tr('caption.collide', '{a} and {b} meet in the same color. This edge cannot hold.', {
                a: step.a,
                b: step.b,
              }),
              true,
            );
          }
          return;
        }

        case 'done': {
          const result = readDone(event.payload);
          if (!result) return;
          if (result.odd) {
            // 문안을 먼저 얹고 두드린다 — 판정과 자국이 같은 순간에 오도록.
            stage?.setCaption?.(
              tr(
                'caption.odd',
                'A ring of {n} is odd, so the alternation never closes.',
                { n: result.ringLength },
              ),
              true,
            );
            await stage?.markConflict?.({ a: result.a, b: result.b });
          } else {
            stage?.setCaption?.(
              tr('caption.even', 'A ring of {n} is even, so the two colors close the ring.', {
                n: result.ringLength,
              }),
            );
          }
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          openingCaption();
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각이 발신하지 않는다 — 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
      openingCaption();
    },
  };
};
