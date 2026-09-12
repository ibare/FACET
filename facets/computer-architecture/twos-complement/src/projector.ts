/**
 * 알고리즘이 보낸 수를 무대의 메서드 호출로 옮긴다.
 *
 * 알고리즘은 문안을 하나도 보내지 않는다 (C10). 캡션은 여기서 `runtime.t` 로 짓고,
 * 큰 수는 쉼표로 끊어 넣는다 — 그 서식은 무대와 같은 함수를 쓴다.
 *
 * 자리 번호는 `index:<i>` 로 오며 `toIndexArray` 로만 읽는다 (원칙 4). payload 의
 * `index` 는 그것이 없을 때의 대비다.
 */

import {
  makeTranslator,
  toIndexArray,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';
import { groupDigits } from './twos-complement-stage.js';

type Stage = {
  setBoard?(v: { width: number; patternCount: number }): void;
  layBits?(v: { index: number; bits: number[] }): void;
  showReading?(v: { index: number; promise: string; reading: number; terms: number[] }): void;
  setSpan?(v: {
    lowest: number;
    highest: number;
    valueCount: number;
    negativeCount: number;
  }): void;
  setCaption?(text: string): void;
  reset?(): void;
};

type CodePanel = {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

/** payload 의 수 한 자리. 런타임 가드를 거쳐야 꺼낸다 (C9). */
const num = (value: unknown, fallback = 0): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** payload 의 수 배열. 수가 아닌 항목은 버린다 (C9). */
const numbers = (value: unknown): number[] =>
  Array.isArray(value) ? value.filter((x): x is number => typeof x === 'number') : [];

export const twosComplementProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const indexOf = (event: FacetRuntimeEvent, payload: Record<string, unknown>): number => {
    const parsed = toIndexArray(event.target);
    return parsed.length > 0 ? parsed[0] : num(payload.index, -1);
  };

  return {
    onInit(): void {
      stage?.reset?.();
    },

    onReset(): void {
      stage?.reset?.();
      panel?.clearHighlight?.();
    },

    onEvent(event: FacetRuntimeEvent): void {
      const payload = (event.payload ?? {}) as Record<string, unknown>;

      switch (event.type) {
        case 'phase': {
          // silent 이지만 projector 에는 온다 — 코드 패널이 짚는 줄이 여기서 정해진다.
          panel?.highlightPhase?.(typeof payload.phase === 'string' ? payload.phase : null);
          return;
        }

        case 'board-set': {
          const width = num(payload.width, 4);
          stage?.setBoard?.({ width, patternCount: num(payload.patternCount) });
          stage?.setCaption?.(
            tr('caption.board', 'Width {width} — the same bit patterns, read under two promises.', {
              width: String(width),
            }),
          );
          return;
        }

        case 'span-set': {
          const valueCount = num(payload.valueCount);
          const negativeCount = num(payload.negativeCount);
          stage?.setSpan?.({
            lowest: num(payload.lowest),
            highest: num(payload.highest),
            valueCount,
            negativeCount,
          });
          stage?.setCaption?.(
            tr('caption.span', 'This width holds {count} values, and {negatives} of them are negative.', {
              count: groupDigits(valueCount),
              negatives: groupDigits(negativeCount),
            }),
          );
          return;
        }

        case 'bits-laid': {
          stage?.layBits?.({ index: indexOf(event, payload), bits: numbers(payload.bits) });
          stage?.setCaption?.(
            tr('caption.unfold', 'Leading zeros fill the width. Places in all: {width}.', {
              width: String(num(payload.width, 4)),
            }),
          );
          return;
        }

        case 'read-unsigned': {
          stage?.showReading?.({
            index: indexOf(event, payload),
            promise: 'unsigned',
            reading: num(payload.reading),
            terms: numbers(payload.terms),
          });
          stage?.setCaption?.(
            tr('caption.readUnsigned', 'Read without a sign: every place carries a positive weight.'),
          );
          return;
        }

        case 'read-twos': {
          stage?.showReading?.({
            index: indexOf(event, payload),
            promise: 'twos',
            reading: num(payload.reading),
            terms: numbers(payload.terms),
          });
          stage?.setCaption?.(
            tr('caption.readTwos', 'Read as two\'s complement: only the top place weighs negative.'),
          );
          return;
        }

        default:
          // `done` 은 화면을 바꾸지 않는다 — 마지막 걸음이 이미 그려져 있다.
          // 그 밖의 이벤트도 의도적으로 흘려보낸다 (C2).
          return;
      }
    },
  };
};
