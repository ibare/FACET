/**
 * try-and-undo projector — 걸음 이벤트를 판의 동작으로 옮긴다.
 *
 * payload 는 열린 타입이므로 `event.payload` 를 그대로 넘기지 않고 여기서 좁혀
 * 정형 객체를 조립한다 (C9). 캡션 문안은 코드에 두지 않고 키로만 조회한다 (C10).
 */

import { makeTranslator } from '@ffacet/core/runtime';
import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
  Translate,
} from '@ffacet/core/runtime';

/** 이 projector 가 stage 에 요구하는 표면. */
type Board = {
  init?(spec: { size: number }): void;
  reset?(): void;
  setCaption?(text: string): void;
  dropIn?(spec: { row: number; col: number; forbidden: number[]; abandoned: number[] }): Promise<void>;
  showDeadEnd?(spec: { row: number; linkFrom: number[]; linkTo: number[] }): Promise<void>;
  takeBack?(spec: {
    row: number;
    col: number;
    remaining: number;
    forbidden: number[];
    abandoned: number[];
  }): Promise<void>;
  settle?(): Promise<void>;
};

const DEFAULT_BOARD_SIZE = 4;

function numberOf(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function cellsOf(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
}

export const tryAndUndoProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const board = views.stage as unknown as Board | undefined;

  // 러너 밖에서 마운트할 때를 위한 fallback. 러너가 붙는 경로에서는 언제나
  // runtime.t 가 이겨서 FacetJson.messages 저작 문안이 쓰인다 (C10).
  // 보간 규칙을 여기서 다시 짜지 않는다 — 프레임워크의 것이 바뀌면 갈린다.
  const tr: Translate = runtime?.t ?? makeTranslator();

  const startCaption = (): string =>
    tr('caption.start', 'An empty board. One piece per row, from the top down.');

  return {
    onInit(initialData: unknown): void {
      const data = initialData as { boardSize?: unknown } | undefined;
      board?.init?.({ size: numberOf(data?.boardSize, DEFAULT_BOARD_SIZE) });
      board?.setCaption?.(startCaption());
    },

    onReset(): void {
      board?.reset?.();
      board?.setCaption?.(startCaption());
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!board) return;

      switch (event.type) {
        case 'place': {
          const p = event.payload as
            | { row?: unknown; col?: unknown; forbidden?: unknown; abandoned?: unknown }
            | undefined;
          const row = numberOf(p?.row, 0);
          const col = numberOf(p?.col, 0);
          board?.setCaption?.(
            tr('caption.place', 'Row {row}: put a piece on column {col}.', { row, col }),
          );
          await board?.dropIn?.({
            row,
            col,
            forbidden: cellsOf(p?.forbidden),
            abandoned: cellsOf(p?.abandoned),
          });
          return;
        }

        case 'blocked': {
          const p = event.payload as
            | { row?: unknown; linkFrom?: unknown; linkTo?: unknown }
            | undefined;
          const row = numberOf(p?.row, 0);
          board?.setCaption?.(
            tr('caption.blocked', 'Row {row}: every square left is ruled out.', { row }),
          );
          await board?.showDeadEnd?.({
            row,
            linkFrom: cellsOf(p?.linkFrom),
            linkTo: cellsOf(p?.linkTo),
          });
          return;
        }

        case 'undo': {
          const p = event.payload as
            | {
                row?: unknown;
                col?: unknown;
                remaining?: unknown;
                forbidden?: unknown;
                abandoned?: unknown;
              }
            | undefined;
          const row = numberOf(p?.row, 0);
          const col = numberOf(p?.col, 0);
          const remaining = numberOf(p?.remaining, 0);
          // 첫 수까지 물린 순간은 이 화면의 큰 마디라 따로 말한다.
          board?.setCaption?.(
            remaining === 0
              ? tr(
                  'caption.undoRoot',
                  'Back past the very first move. The board is empty again.',
                )
              : tr(
                  'caption.undo',
                  'Take the row {row} piece back. Everything below it returns to what it was.',
                  { row },
                ),
          );
          await board?.takeBack?.({
            row,
            col,
            remaining,
            forbidden: cellsOf(p?.forbidden),
            abandoned: cellsOf(p?.abandoned),
          });
          return;
        }

        case 'done': {
          const p = event.payload as { placed?: unknown; undone?: unknown } | undefined;
          board?.setCaption?.(
            tr(
              'caption.solved',
              'All four stand — {placed} placements and {undone} take-backs.',
              { placed: numberOf(p?.placed, 0), undone: numberOf(p?.undone, 0) },
            ),
          );
          await board?.settle?.();
          return;
        }

        case 'rewind': {
          board?.reset?.();
          board?.setCaption?.(startCaption());
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각의 어휘가 아니다 — 조용히 버린다 (C2).
          return;
      }
    },
  };
};
