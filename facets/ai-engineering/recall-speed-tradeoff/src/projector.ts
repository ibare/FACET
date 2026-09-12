/**
 * 덜 뒤지면 놓친다 — 조각의 projector.
 *
 * payload 를 좁혀 stage 로 넘긴다 (C9). event.payload 를 그대로 전달하지 않는다.
 * 문안은 여기서 tr 로 해석해 넘기고, 코드에는 키와 en 원본만 남는다 (C10).
 *
 * 캡션이 말하는 "빠진 것" 의 수는 payload 를 다시 세지 않고 **stage 가 그릴 바로
 * 그 배열**에서 센다. 두 곳에서 따로 셈하면 화면과 말이 갈릴 수 있다.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type SeatView = { ox: number; oy: number; ix: number; iy: number; held: boolean };

type RecallStage = {
  showTruth?(seats: { x: number; y: number }[], caption: string): Promise<void> | void;
  showAnswer?(next: {
    seats: SeatView[];
    recall: number;
    probe: string;
    caption: string;
  }): Promise<void> | void;
  showCaption?(caption: string): void;
  clear?(): void;
};

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** 단언 뒤에 검사가 따르는 좁히개다 (C9). */
function readSeats(value: unknown): SeatView[] {
  if (!Array.isArray(value)) return [];
  const out: SeatView[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const seat = raw as Record<string, unknown>;
    const ox = readNumber(seat.ox);
    const oy = readNumber(seat.oy);
    const ix = readNumber(seat.ix);
    const iy = readNumber(seat.iy);
    if (ox === null || oy === null || ix === null || iy === null) continue;
    out.push({ ox, oy, ix, iy, held: seat.held === true });
  }
  return out;
}

function readPoints(value: unknown): { x: number; y: number }[] {
  if (!Array.isArray(value)) return [];
  const out: { x: number; y: number }[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) continue;
    const point = raw as Record<string, unknown>;
    const x = readNumber(point.x);
    const y = readNumber(point.y);
    if (x === null || y === null) continue;
    out.push({ x, y });
  }
  return out;
}

export const recallSpeedTradeoffProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const tr = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as RecallStage;

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const payload = (event.payload ?? {}) as Record<string, unknown>;

      switch (event.type) {
        case 'truth-fixed': {
          await stage.showTruth?.(
            readPoints(payload.seats),
            tr('caption.truth', 'The five truly nearest are fixed — the answer should be exactly these.'),
          );
          return;
        }

        case 'answer-recomputed': {
          const seats = readSeats(payload.seats);
          const recall = readNumber(payload.recall) ?? 0;
          const seen = readNumber(payload.seen) ?? 0;
          const total = readNumber(payload.total) ?? 0;
          const opened = readNumber(payload.opened) ?? 0;
          const cells = readNumber(payload.cells) ?? 0;
          // 화면에 유령으로 설 자리의 수 그대로다.
          const missed = seats.filter((seat) => !seat.held).length;
          await stage.showAnswer?.({
            seats,
            recall,
            probe: tr('label.probe', 'Cells opened {opened}/{cells} · points seen {seen}/{total}', {
              opened,
              cells,
              seen,
              total,
            }),
            caption:
              missed === 0
                ? tr('caption.full', 'Points seen: {seen}. Nothing is missing. Recall: {recall}%.', {
                    seen,
                    recall,
                  })
                : tr(
                    'caption.miss',
                    'Points seen: {seen}. Missing from the true nearest: {missed}. Recall: {recall}%.',
                    { seen, missed, recall },
                  ),
          });
          return;
        }

        case 'rewind': {
          stage.clear?.();
          return;
        }

        case 'done': {
          stage.showCaption?.(
            tr('caption.done', 'Search less and you miss more — a farther point takes the empty seat.'),
          );
          return;
        }

        default:
          // 이 알고리즘이 내는 것은 위 넷뿐이다. 그 밖은 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.clear?.();
    },
  };
};
