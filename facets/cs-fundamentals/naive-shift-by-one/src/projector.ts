/**
 * naive-shift-by-one projector — 걸음 이벤트를 stage 의 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). stage 는 `unknown` 을 받지 않는다.
 * 문안은 키로만 다루고 실제 문장은 `facet.ts` 의 messages 에 있다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

type Stage = {
  align?(shift: number): Promise<void>;
  compare?(offset: number, hit: boolean): Promise<void>;
  retreat?(matched: number): Promise<void>;
  found?(): Promise<void>;
  finish?(): void;
  setCaption?(line: string): void;
  reset?(): void;
};

type Step = {
  shift: number;
  offset: number;
  matched: number;
  comparisons: number;
  hit: boolean;
};

/**
 * 이벤트 payload 를 정형 객체로 조립한다.
 *
 * `as Record<string, unknown>` 뒤에 필드마다 `typeof` 가 따라붙는 좁히개다 —
 * 검사 없이 곧바로 꺼내 쓰는 회피와 다르다 (C9).
 */
function readStep(payload: unknown): Step {
  const p = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<
    string,
    unknown
  >;
  const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  return {
    shift: num(p.shift),
    offset: num(p.offset),
    matched: num(p.matched),
    comparisons: num(p.comparisons),
    hit: p.hit === true,
  };
}

export const naiveShiftByOneProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event) {
      const step = readStep(event.payload);

      switch (event.type) {
        case 'align': {
          stage?.setCaption?.(
            tr('caption.align', 'Line up and compare from the front. Position: {shift}.', {
              shift: step.shift,
            }),
          );
          await stage?.align?.(step.shift);
          return;
        }

        case 'compare': {
          await stage?.compare?.(step.offset, step.hit);
          return;
        }

        case 'retreat': {
          stage?.setCaption?.(
            step.matched === 0
              ? tr('caption.retreatNone', 'The very first letter is a mismatch. Slide by one.')
              : tr(
                  'caption.retreat',
                  'A mismatch. Throw away everything matched so far and slide by one. Matched: {matched}.',
                  { matched: step.matched },
                ),
          );
          await stage?.retreat?.(step.matched);
          return;
        }

        case 'found': {
          stage?.setCaption?.(
            tr('caption.found', 'The whole pattern matched. Found at: {shift}.', {
              shift: step.shift,
            }),
          );
          await stage?.found?.();
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr('caption.done', 'No positions left to slide to. Comparisons: {comparisons}.', {
              comparisons: step.comparisons,
            }),
          );
          stage?.finish?.();
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          return;
        }

        default:
          // 그 밖의 이벤트는 그리지 않는다 (silently drop — C2).
          return;
      }
    },

    onReset() {
      stage?.reset?.();
    },
  };
};
