/**
 * probeAFewCells 의 번역기 — 걸음 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다. stage 는 좁혀진 값만 받는다 (C9). 화면 문안은
 * 키로만 부르고 문장은 선언에 있다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type { ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 내주는 계약. 없는 메서드는 부르지 않는다. */
type ProbeStage = {
  setCaption?(text: string): void;
  showQuery?(): Promise<void> | void;
  splitCells?(p: { counts: number[] }): Promise<void> | void;
  measureCell?(p: { cell: number; dist: number }): Promise<void> | void;
  rankCells?(p: { order: number[]; near: number; far: number }): Promise<void> | void;
  openCell?(p: { cell: number; members: number[] }): Promise<void> | void;
  stopProbe?(): Promise<void> | void;
  rewind?(): void;
};

function numberOf(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function numbersOf(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

export const probeAFewCellsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as ProbeStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event) {
      // 단언 뒤에 필드마다 typeof 가 따르는 좁히개다 (C9).
      const p = (event.payload ?? {}) as Record<string, unknown>;

      switch (event.type) {
        case 'query-placed': {
          stage?.setCaption?.(
            tr('caption.query', 'A query lands on the plane. Points in all: {total}.', {
              total: numberOf(p.total),
            }),
          );
          await stage?.showQuery?.();
          break;
        }

        case 'cells-split': {
          const counts = numbersOf(p.counts);
          stage?.setCaption?.(
            tr(
              'caption.split',
              'The plane is already split into {cells} cells, each around one centroid.',
              { cells: counts.length },
            ),
          );
          await stage?.splitCells?.({ counts });
          break;
        }

        case 'centroid-measured': {
          const cell = numberOf(p.cell);
          const dist = numberOf(p.dist);
          stage?.setCaption?.(
            // 사람이 읽는 번호는 1 부터다. 아래 `measureCell` 로 가는 `cell` 은
            // 배열 색인이라 그대로 둔다 — 같은 값이 두 뜻으로 쓰이는 자리다.
            tr('caption.measure', 'Query to the centroid of cell {cell}: {dist}.', {
              cell: cell + 1,
              dist: dist.toFixed(2),
            }),
          );
          await stage?.measureCell?.({ cell, dist });
          break;
        }

        case 'order-ranked': {
          const order = numbersOf(p.order);
          stage?.setCaption?.(
            tr('caption.rank', 'All {cells} centroids sit in one thin ring. Nearest first: {order}.', {
              cells: order.length,
              // 차례에 실린 것도 칸 번호라 읽는 자리에서 1 부터로 민다. 아래
              // `rankCells` 로 가는 `order` 는 색인 그대로다.
              order: order.map((c) => c + 1).join(' → '),
            }),
          );
          await stage?.rankCells?.({
            order,
            near: numberOf(p.near),
            far: numberOf(p.far),
          });
          break;
        }

        case 'cell-opened': {
          const cell = numberOf(p.cell);
          stage?.setCaption?.(
            tr('caption.open', 'Cell {cell} opens. Points compared so far: {seen}.', {
              cell: cell + 1,
              seen: numberOf(p.seen),
            }),
          );
          await stage?.openCell?.({ cell, members: numbersOf(p.members) });
          break;
        }

        case 'probe-stopped': {
          stage?.setCaption?.(
            tr('caption.stop', 'Opened {opened} of {cells}. Compared: {seen}. Untouched: {untouched}.', {
              opened: numberOf(p.opened),
              cells: numberOf(p.cells),
              seen: numberOf(p.seen),
              untouched: numberOf(p.untouched),
            }),
          );
          await stage?.stopProbe?.();
          break;
        }

        case 'rewind': {
          stage?.rewind?.();
          break;
        }

        default:
          // 이 알고리즘은 위 일곱만 발신한다. 그 밖의 것은 조용히 흘린다 (C2).
          break;
      }
    },

    onReset() {
      stage?.rewind?.();
    },
  };
};
