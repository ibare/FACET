/**
 * digit-by-digit projector — 걸음 이벤트를 stage 호출로 옮긴다.
 *
 * payload 는 `unknown` 이라 여기서 한 번 좁혀 정형 객체로 만들어 넘긴다 (C9).
 * 화면 문안은 코드에 키와 en 원본만 두고 문안 자체는 `facet.ts` 의 messages 에
 * 있다 (C10) — algorithm 은 문안을 모른다.
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage 계약. 열린 ViewInstance 를 이 형태로 한 번만 좁힌다 (C9). */
type DigitStage = {
  setup?: (values: number[]) => void;
  setCaption?: (text: string) => void;
  focusPlace?: (p: { column: number; caption: string }) => Promise<void> | void;
  scatter?: (p: {
    ids: number[];
    bins: number[];
    slots: number[];
    caption: string;
  }) => Promise<void> | void;
  gather?: (p: {
    ids: number[];
    column: number;
    place: number;
    caption: string;
  }) => Promise<void> | void;
  finish?: (caption: string) => Promise<void> | void;
  rewind?: () => void;
};

function numberAt(source: { [k: string]: unknown } | undefined, key: string): number {
  const v = source?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function numberArrayAt(
  source: { [k: string]: unknown } | undefined,
  key: string,
): number[] {
  const v = source?.[key];
  if (!Array.isArray(v)) return [];
  return v.filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
}

export const digitByDigitProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as DigitStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown) {
      const data = initialData as { values?: unknown } | undefined;
      const values = Array.isArray(data?.values)
        ? data.values.filter((v): v is number => typeof v === 'number')
        : [];
      stage?.setup?.(values);
      stage?.setCaption?.(
        tr(
          'caption.start',
          '{count} numbers, out of order — and not one of them gets compared.',
          { count: values.length },
        ),
      );
    },

    onEvent(event) {
      const p = event.payload as { [k: string]: unknown } | undefined;

      switch (event.type) {
        case 'focus-place': {
          const place = numberAt(p, 'place');
          return stage?.focusPlace?.({
            column: numberAt(p, 'column'),
            caption: tr(
              'caption.focus',
              'Pass {round} of {total} — only the {place}s digit is read.',
              { round: numberAt(p, 'round'), total: numberAt(p, 'total'), place },
            ),
          });
        }

        case 'scatter': {
          const place = numberAt(p, 'place');
          return stage?.scatter?.({
            ids: numberArrayAt(p, 'ids'),
            bins: numberArrayAt(p, 'bins'),
            slots: numberArrayAt(p, 'slots'),
            caption: tr(
              'caption.scatter',
              'Each number drops into the bin its {place}s digit names.',
              { place },
            ),
          });
        }

        case 'gather':
          return stage?.gather?.({
            ids: numberArrayAt(p, 'ids'),
            column: numberAt(p, 'column'),
            place: numberAt(p, 'place'),
            caption: tr(
              'caption.gather',
              'Bins are read 0 to 9; inside a bin the earlier order is kept.',
            ),
          });

        case 'done':
          return stage?.finish?.(
            tr('caption.done', '{rounds} passes, zero comparisons — the row is in order.', {
              rounds: numberAt(p, 'rounds'),
            }),
          );

        case 'rewind':
          stage?.rewind?.();
          return;

        default:
          // 이 조각의 algorithm 은 위 다섯 가지만 발신한다. 그 밖은 조용히 흘린다.
          return;
      }
    },
  };
};
