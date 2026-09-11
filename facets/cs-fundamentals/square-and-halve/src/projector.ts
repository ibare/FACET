/**
 * square-and-halve projector — 걸음 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 만들어 넘긴다. stage 는 필수 필드 타입으로
 * 받으므로 `event.payload` 가 그대로 건너가지 않는다 (C9).
 *
 * 문안은 키와 en 원본만 여기 남고 정본은 `facet.ts` 의 messages 에 있다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

type Stage = {
  showBegin?(a: { base: number; exponent: number }): Promise<void>;
  setCaption?(text: string): void;
  takeCell?(a: { place: number; factor: number; product: number }): Promise<void>;
  markSkip?(a: { place: number }): Promise<void>;
  foldRow?(a: { row: number; count: number; value: number }): Promise<void>;
  showDone?(a: { product: number }): Promise<void>;
  reset?(): void;
};

function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function bitsOf(value: unknown): string {
  if (!Array.isArray(value)) return '';
  return value.map((bit) => (num(bit) === 1 ? '1' : '0')).join('');
}

export const squareAndHalveProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event): Promise<void> {
      const p = event.payload as Record<string, unknown> | undefined;

      switch (event.type) {
        case 'begin': {
          const base = num(p?.base);
          const exponent = num(p?.exponent);
          // 캡션을 먼저 걸고 그림을 움직인다 — 지금 무슨 일인지 읽으며 보게.
          stage?.setCaption?.(
            tr(
              'caption.begin',
              'A row of {exponent} cells, each one {base}. Multiplied one at a time, that is {naive} multiplications.',
              { exponent, base, naive: num(p?.naive) },
            ),
          );
          await stage?.showBegin?.({ base, exponent });
          return;
        }

        case 'take': {
          stage?.setCaption?.(
            tr(
              'caption.take',
              'The count {count} is odd, so one cell has no partner. It goes into the answer: {factor}.',
              { count: num(p?.count), factor: num(p?.factor) },
            ),
          );
          await stage?.takeCell?.({
            place: num(p?.place, 1),
            factor: num(p?.factor),
            product: num(p?.product),
          });
          return;
        }

        case 'skip': {
          stage?.setCaption?.(
            tr(
              'caption.skip',
              'The count {count} is even — every cell has a partner. Nothing goes into the answer.',
              { count: num(p?.count) },
            ),
          );
          await stage?.markSkip?.({ place: num(p?.place, 1) });
          return;
        }

        case 'fold': {
          const count = num(p?.count);
          const value = num(p?.value);
          stage?.setCaption?.(
            tr(
              'caption.fold',
              'Fold in half. Each pair meets and becomes one cell worth {value}, and the row now holds {count}.',
              { value, count },
            ),
          );
          await stage?.foldRow?.({ row: num(p?.row), count, value });
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr(
              'caption.done',
              '{total} multiplications instead of {naive} — {squarings} squarings and {multiplies} products. The digits {bits} say which squares were taken.',
              {
                total: num(p?.total),
                naive: num(p?.naive),
                squarings: num(p?.squarings),
                multiplies: num(p?.multiplies),
                bits: bitsOf(p?.bits),
              },
            ),
          );
          await stage?.showDone?.({ product: num(p?.product) });
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          return;
        }

        default:
          // 그 밖의 어휘는 이 조각이 내보내지 않는다 — 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
    },
  };
};
