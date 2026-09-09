/**
 * squash-to-probability projector — 알고리즘의 발신을 무대의 동작으로 옮긴다.
 *
 * payload 는 열린 타입이라 여기서 한 번에 좁힌다 (C9). 화면에 뜰 문안은 코드에
 * 키와 en 원본만 남고 문안 자체는 `facet.ts` 의 `messages` 에 있다 (C10).
 * 수를 몇 자리로 보일지는 표현 계층의 결정이라 여기서 정한다 — 알고리즘은
 * 셈한 값 그대로를 보낸다.
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

import type { SquashStep } from './squash-to-probability-stage.js';

type SquashStage = {
  reset(): void;
  setCaption(text: string): void;
  extendAxis(scores: number[]): Promise<void>;
  raiseBand(): Promise<void>;
  squash(step: SquashStep): Promise<void>;
  pressTails(lowP: number, highP: number): Promise<void>;
  settle(): Promise<void>;
};

type AxisPayload = { scores?: unknown };
type SquashPayload = {
  index?: unknown;
  z?: unknown;
  p?: unknown;
  fromIndex?: unknown;
  fromZ?: unknown;
  fromP?: unknown;
  axisGap?: unknown;
  bandGap?: unknown;
};
type TailsPayload = { lowP?: unknown; highP?: unknown };

/** 확률은 넷째 자리까지 보인다. −8 과 8 이 벽에서 떨어져 있는 것이 거기서 보인다. */
const PROBABILITY_DIGITS = 4;
const MINUS = '−';

const num = (value: unknown): number | null => (typeof value === 'number' ? value : null);

const showProbability = (value: number): string => value.toFixed(PROBABILITY_DIGITS);

/** 축 위의 수는 정수라 그대로. 음수만 조판용 빼기 기호로 바꾼다. */
const showScore = (value: number): string =>
  value < 0 ? `${MINUS}${Math.abs(value)}` : String(value);

export const squashToProbabilityProjector: ProjectorFactory = (views, runtime) => {
  const tr = runtime?.t ?? makeTranslator();
  const stage = views.stage as unknown as SquashStage | undefined;

  return {
    onInit(): void {
      stage?.reset();
    },

    onReset(): void {
      stage?.reset();
    },

    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'axis-extends': {
          const payload = event.payload as AxisPayload | undefined;
          const raw = Array.isArray(payload?.scores) ? payload.scores : [];
          const scores = raw.filter((z): z is number => typeof z === 'number');
          stage?.setCaption(
            tr('caption.axis', 'The score axis runs on without end, in both directions.'),
          );
          await stage?.extendAxis(scores);
          return;
        }

        case 'band-appears': {
          stage?.setCaption(
            tr('caption.band', 'A probability may only sit between two walls.'),
          );
          await stage?.raiseBand();
          return;
        }

        case 'score-squashed': {
          const payload = event.payload as SquashPayload | undefined;
          const index = num(payload?.index);
          const z = num(payload?.z);
          const p = num(payload?.p);
          if (index === null || z === null || p === null) return;
          const fromIndex = num(payload?.fromIndex);
          const fromZ = num(payload?.fromZ);
          const fromP = num(payload?.fromP);
          const axisGap = num(payload?.axisGap);
          const bandGap = num(payload?.bandGap);

          if (fromZ === null || axisGap === null || bandGap === null) {
            stage?.setCaption(
              tr('caption.center', 'The middle of the axis lands in the middle of the band: {p}.', {
                p: showProbability(p),
              }),
            );
          } else {
            stage?.setCaption(
              tr(
                'caption.squash',
                'z = {z} lands at {p}. A step of {dz} along the axis buys {dp} of the band.',
                {
                  z: showScore(z),
                  p: showProbability(p),
                  dz: showScore(axisGap),
                  dp: showProbability(bandGap),
                },
              ),
            );
          }
          await stage?.squash({ index, z, p, fromIndex, fromP });
          return;
        }

        case 'tails-pressed': {
          const payload = event.payload as TailsPayload | undefined;
          const lowP = num(payload?.lowP);
          const highP = num(payload?.highP);
          if (lowP === null || highP === null) return;
          stage?.setCaption(
            tr(
              'caption.tails',
              'The rest of the axis presses into two slivers — and the walls stay out of reach: {lo} / {hi}.',
              { lo: showProbability(lowP), hi: showProbability(highP) },
            ),
          );
          await stage?.pressTails(lowP, highP);
          return;
        }

        case 'rewind': {
          stage?.reset();
          return;
        }

        case 'done': {
          await stage?.settle();
          return;
        }

        default:
          // 이 facet 이 내보내는 어휘는 위가 전부다. 그 밖의 것은 조용히 버린다 (C2).
          return;
      }
    },
  };
};
