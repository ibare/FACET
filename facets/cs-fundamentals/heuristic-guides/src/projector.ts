/**
 * heuristicGuidesProjector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 `unknown` 이므로 여기서 좁혀 정형으로 만든 뒤 넘긴다 (C9).
 * 화면 문안은 키로만 다루고 `runtime.t` 로 해석한다 (C10) — 알고리즘은 사실만
 * 싣고, 무엇이라 말할지는 이 층이 고른다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type Cell = { col: number; row: number };
type Move = { cell: Cell; opened: Cell[]; count: number };

/** stage 계약. 없는 메서드는 호출하지 않는다 (C9). */
type Stage = {
  setCaption?: (text: string) => void;
  rewind?: () => void;
  seed?: (cells: Cell[]) => Promise<void> | void;
  spread?: (plain: Move | null, guided: Move | null) => Promise<void> | void;
  drawRoute?: (plain: Cell[], guided: Cell[], label: string) => Promise<void> | void;
};

function toCell(value: unknown): Cell | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as { col?: unknown; row?: unknown };
  if (typeof rec.col !== 'number' || typeof rec.row !== 'number') return null;
  return { col: rec.col, row: rec.row };
}

function toCells(value: unknown): Cell[] {
  if (!Array.isArray(value)) return [];
  const out: Cell[] = [];
  for (const item of value) {
    const cell = toCell(item);
    if (cell) out.push(cell);
  }
  return out;
}

function toMove(value: unknown): Move | null {
  if (!value || typeof value !== 'object') return null;
  const rec = value as { cell?: unknown; opened?: unknown; count?: unknown };
  const cell = toCell(rec.cell);
  if (!cell || typeof rec.count !== 'number') return null;
  return { cell, opened: toCells(rec.opened), count: rec.count };
}

export const heuristicGuidesProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(): void {
      stage?.rewind?.();
    },

    onReset(): void {
      stage?.rewind?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'search-begin': {
          const p = event.payload as { frontier?: unknown } | undefined;
          stage?.setCaption?.(
            tr('caption.begin', 'The same grid and the same question: from the dot to the target.'),
          );
          await stage?.seed?.(toCells(p?.frontier));
          return;
        }

        case 'frontier-spread': {
          const p = event.payload as
            | { plain?: unknown; guided?: unknown; guidedFinished?: unknown; plainFinished?: unknown }
            | undefined;
          const guidedDone = p?.guidedFinished === true;
          const plainDone = p?.plainFinished === true;
          stage?.setCaption?.(
            guidedDone && !plainDone
              ? tr('caption.arrived', 'The right one is there. The left one is still spreading.')
              : tr('caption.spread', 'The left spreads evenly; the right leans toward the target.'),
          );
          await stage?.spread?.(toMove(p?.plain), toMove(p?.guided));
          return;
        }

        case 'route-drawn': {
          const p = event.payload as { plain?: unknown; guided?: unknown; steps?: unknown } | undefined;
          const steps = typeof p?.steps === 'number' ? p.steps : 0;
          stage?.setCaption?.(
            tr(
              'caption.same',
              'Both routes are equally long. What differs is how many cells were opened.',
            ),
          );
          await stage?.drawRoute?.(
            toCells(p?.plain),
            toCells(p?.guided),
            tr('label.route', 'Route: {n} steps', { n: steps }),
          );
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        // 그 밖의 이벤트는 이 조각에 없다. 들어오면 조용히 흘린다 (C2).
        default:
          return;
      }
    },
  };
};
