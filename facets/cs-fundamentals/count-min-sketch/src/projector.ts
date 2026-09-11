/**
 * countMinSketchProjector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * 문안은 여기서 짓지 않는다. 키만 들고 `runtime.t` 로 조회하며 원본은
 * `facet.ts` 의 `messages` 에 있다 (C10). payload 는 열린 타입이므로 가드로 좁혀
 * 정형 객체만 stage 로 넘긴다 (C9).
 */

import { makeTranslator, type FacetRuntimeEvent, type ProjectorFactory } from '@ffacet/core/runtime';

type CellRef = { row: number; col: number };

/** stage 가 노출하는 메서드. 없는 메서드와도 견디도록 전부 optional 이다. */
type SketchStage = {
  initTable?(width: number, depth: number, keys: string[], scaleMax: number): void;
  setCellValue?(row: number, col: number, value: number): void;
  markCells?(refs: CellRef[], mark: string): void;
  clearMarks?(): void;
  setBar?(index: number, truth: number, read: number): void;
  setCaption?(value: string): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function cellRefs(value: unknown): CellRef[] {
  if (!Array.isArray(value)) return [];
  const out: CellRef[] = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (!rec) continue;
    const row = num(rec.row);
    const col = num(rec.col);
    if (row === null || col === null) continue;
    out.push({ row, col });
  }
  return out;
}

export const countMinSketchProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as SketchStage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  // table-init 이 알려 준 판의 모양. 뒤따르는 캡션들이 이것을 참조한다.
  let depth = 0;
  let total = 0;

  return {
    onInit() {
      // initialData 를 여기서 다시 좁혀 밀어 넣지 않는다 — 그것은 stage 의 mount 가
      // 이미 했다. 되돌린 직후에도 algorithm 이 곧바로 table-init 을 내보낸다.
      panel?.clearHighlight?.();
      stage?.clearMarks?.();
    },

    onReset() {
      panel?.clearHighlight?.();
    },

    onEvent(event: FacetRuntimeEvent) {
      const p = asRecord(event.payload);

      switch (event.type) {
        case 'phase': {
          const phase = str(p?.phase);
          panel?.highlightPhase?.(phase);
          return;
        }

        case 'table-init': {
          const w = num(p?.width);
          const d = num(p?.depth);
          const scaleMax = num(p?.scaleMax);
          const keys = Array.isArray(p?.keys)
            ? (p.keys as unknown[]).filter((k): k is string => typeof k === 'string')
            : [];
          if (w === null || d === null) return;
          depth = d;
          total = num(p?.total) ?? total;
          stage?.initTable?.(w, d, keys, scaleMax ?? 1);
          stage?.setCaption?.(
            tr('caption.start', 'Width {width} x depth {depth} = {cells} cells for {total} items.', {
              width: w,
              depth: d,
              cells: w * d,
              total,
            }),
          );
          return;
        }

        case 'key-hashed': {
          const key = str(p?.key);
          const count = num(p?.count);
          const cells = cellRefs(p?.cells);
          if (key === null || count === null) return;
          stage?.markCells?.(cells, 'hashed');
          stage?.setCaption?.(
            tr(
              'caption.count',
              'Counting "{key}" {count} times — one cell rises in each of {depth} rows.',
              { key, count, depth },
            ),
          );
          return;
        }

        case 'cell-bumped': {
          const row = num(p?.row);
          const col = num(p?.col);
          const value = num(p?.value);
          if (row === null || col === null || value === null) return;
          stage?.setCellValue?.(row, col, value);
          stage?.markCells?.([{ row, col }], 'bumped');
          return;
        }

        case 'key-probed': {
          const key = str(p?.key);
          const cells = cellRefs(p?.cells);
          if (key === null) return;
          stage?.markCells?.(cells, 'probed');
          stage?.setCaption?.(
            tr('caption.read', 'Reading "{key}" — one cell from each of {depth} rows.', {
              key,
              depth,
            }),
          );
          return;
        }

        case 'key-min': {
          const row = num(p?.row);
          const col = num(p?.col);
          const read = num(p?.read);
          if (row === null || col === null || read === null) return;
          stage?.markCells?.([{ row, col }], 'chosen');
          stage?.setCaption?.(
            tr('caption.min', 'The smallest of the {depth} readings is {read}.', { depth, read }),
          );
          return;
        }

        case 'key-answered': {
          const index = num(p?.index);
          const key = str(p?.key);
          const truth = num(p?.truth);
          const read = num(p?.read);
          if (index === null || key === null || truth === null || read === null) return;
          stage?.setBar?.(index, truth, read);
          stage?.setCaption?.(
            read === truth
              ? tr('caption.exact', '"{key}" reads {read} — exactly the true count.', { key, read })
              : tr(
                  'caption.inflated',
                  '"{key}" reads {read}, but the true count is {truth}. Shared cells puffed it up.',
                  { key, read, truth },
                ),
          );
          return;
        }

        case 'verdict': {
          const w = num(p?.width);
          const d = num(p?.depth);
          const cells = num(p?.cells);
          const errorSum = num(p?.errorSum);
          const exact = num(p?.exact);
          const keyCount = num(p?.keyCount);
          total = num(p?.total) ?? total;
          if (w === null || d === null || cells === null) return;
          if (errorSum === null || exact === null || keyCount === null) return;
          stage?.clearMarks?.();
          stage?.setCaption?.(
            tr(
              'caption.verdict',
              'Width {width} x depth {depth} = {cells} cells. Overshoot total {errorSum}; {exact} of {keyCount} keys read exactly.',
              { width: w, depth: d, cells, errorSum, exact, keyCount },
            ),
          );
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr('caption.waiting', 'Move width or depth to count the same {total} items again.', {
              total,
            }),
          );
          return;
        }

        default:
          // 그 밖의 어휘는 이 facet 이 내보내지 않는다. 와도 조용히 흘린다.
          return;
      }
    },
  };
};
