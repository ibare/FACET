/**
 * in-place-vs-extra Projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 열린 타입이므로 여기서 좁혀 정형 객체로 조립해 넘긴다 (C9).
 * 화면 문안은 코드에 담지 않고 키로 조회해 stage 에 문자열로 건넨다 (C10) —
 * stage 는 자기 라벨(띠 이름·게이지 숫자)만 직접 조회하고, 걸음마다 달라지는
 * 캡션은 이 층이 정한다.
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';

type StageRound = {
  round: number;
  liftFrom: number;
  shiftFrom: number;
  dropTo: number;
  takeFrom: number;
  takenValue: number;
  outSlot: number;
  inPlaceExtra: number;
  extraExtra: number;
  caption: string;
};

type StageDone = {
  inPlaceExtra: number;
  extraExtra: number;
  caption: string;
};

type InPlaceVsExtraStage = {
  init?(data: { values: number[] }): void;
  showBegin?(caption: string): void;
  playRound?(round: StageRound): void | Promise<void>;
  showDone?(data: StageDone): void;
  rewind?(): void;
};

/** payload 에서 숫자 하나를 꺼낸다. 없거나 숫자가 아니면 기본값. */
function num(source: Record<string, unknown> | undefined, key: string, fallback = 0): number {
  const v = source?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function numbers(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const v of value as unknown[]) if (typeof v === 'number') out.push(v);
  return out;
}

export const inPlaceVsExtraProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as InPlaceVsExtraStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const data = initialData as { values?: unknown } | undefined;
      stage?.init?.({ values: numbers(data?.values) });
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = event.payload as { round?: unknown; inPlace?: unknown; extra?: unknown; inPlaceSlots?: unknown; extraSlots?: unknown } | undefined;

      switch (event.type) {
        case 'begin':
          stage?.showBegin?.(
            tr(
              'caption.begin',
              'The same values, sorted two ways — one keeps to its own cells, the other copies them out.',
            ),
          );
          return;

        case 'round': {
          const round = num(p, 'round');
          const extraExtra = num(p, 'extraExtra');
          const caption =
            round === 0
              ? tr(
                  'caption.claim',
                  'Each side takes the room it needs: one slot to hold a value, one cell to write the first result.',
                )
              : tr(
                  'caption.reuseVsGrow',
                  'The held slot is used again. Copying needs one more cell — {n} of them now.',
                  { n: extraExtra },
                );
          await stage?.playRound?.({
            round,
            liftFrom: num(p, 'liftFrom'),
            shiftFrom: num(p, 'shiftFrom'),
            dropTo: num(p, 'dropTo'),
            takeFrom: num(p, 'takeFrom'),
            takenValue: num(p, 'takenValue'),
            outSlot: num(p, 'outSlot'),
            inPlaceExtra: num(p, 'inPlaceExtra'),
            extraExtra,
            caption,
          });
          return;
        }

        case 'done': {
          const inPlaceExtra = num(p, 'inPlaceExtra');
          const extraExtra = num(p, 'extraExtra');
          stage?.showDone?.({
            inPlaceExtra,
            extraExtra,
            caption: tr(
              'caption.done',
              'Same order, different room: {a} extra cell against {b} — one for every value.',
              { a: inPlaceExtra, b: extraExtra },
            ),
          });
          return;
        }

        case 'rewind':
          stage?.rewind?.();
          return;

        default:
          // 이 algorithm 은 위 넷만 발신한다. 그 밖의 것은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
