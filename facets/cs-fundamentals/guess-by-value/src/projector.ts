/**
 * guess-by-value projector — 알고리즘 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 오픈 타입이므로 여기서 한 번에 좁힌다. 각 필드를 `typeof` 로 검사한
 * 뒤 정형 값만 stage 로 넘기고, stage 는 필수 필드 타입으로만 받는다 (C9).
 *
 * 캡션 문안은 이 파일에 없다 — 키와 en 원본만 두고 정본은 `facet.ts` 의
 * `messages` 에 있다 (C10). algorithm 은 문안도 키도 보내지 않고, 무슨 일이
 * 일어났는지만 보낸다.
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { GuessByValueLane, GuessByValueStageInstance } from './guess-by-value-stage.js';

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function lane(v: unknown): GuessByValueLane | null {
  return v === 'middle' || v === 'aim' ? v : null;
}

export const guessByValueProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as GuessByValueStageInstance | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 화면에 되풀이해 넣어야 하는 값. 원본은 언제나 ctx.data 다 (원칙 5). */
  let target = 0;

  function caption(text: string): void {
    stage?.setCaption(text);
  }

  return {
    onInit(initialData: unknown): void {
      const d = initialData as { values?: unknown; target?: unknown } | undefined;
      const values = Array.isArray(d?.values)
        ? d.values.filter((v): v is number => typeof v === 'number')
        : [];
      target = num(d?.target) ?? 0;
      stage?.setup(values, target);
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      if (!stage) return;
      const p = event.payload as
        | {
            lo?: unknown;
            hi?: unknown;
            lane?: unknown;
            index?: unknown;
            value?: unknown;
            count?: unknown;
            hit?: unknown;
            side?: unknown;
            pivotValue?: unknown;
            target?: unknown;
            loIndex?: unknown;
            hiIndex?: unknown;
            loValue?: unknown;
            hiValue?: unknown;
            fraction?: unknown;
            aimProbes?: unknown;
            midProbes?: unknown;
          }
        | undefined;

      switch (event.type) {
        case 'range-set': {
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          if (lo === null || hi === null) return;
          caption(
            tr('caption.begin', 'Looking for {target} in an evenly spread array.', { target }),
          );
          await stage.setRange(lo, hi);
          return;
        }

        case 'probe': {
          const which = lane(p?.lane);
          const index = num(p?.index);
          const value = num(p?.value);
          const count = num(p?.count);
          if (which === null || index === null || value === null || count === null) return;
          const hit = p?.hit === true;
          if (which === 'middle') {
            caption(
              hit
                ? tr('caption.midHit', 'The middle lands on {target}.', { target })
                : tr('caption.midProbe', 'The middle of what is left holds {value}.', { value }),
            );
          } else {
            caption(
              hit
                ? tr('caption.aimHit', 'Slot {index} holds {target}. Straight there.', {
                    index,
                    target,
                  })
                : tr(
                    'caption.aimMiss',
                    'Slot {index} holds {value}. Narrow the scale and aim again.',
                    { index, value },
                  ),
            );
          }
          await stage.probe(which, index, count, hit);
          return;
        }

        case 'discard-half': {
          const lo = num(p?.lo);
          const hi = num(p?.hi);
          const pivotValue = num(p?.pivotValue);
          const evTarget = num(p?.target);
          if (lo === null || hi === null || pivotValue === null || evTarget === null) return;
          caption(
            p?.side === 'right'
              ? tr('caption.midDropRight', '{value} is above {target} — the right half is out.', {
                  value: pivotValue,
                  target: evTarget,
                })
              : tr('caption.midDropLeft', '{value} is below {target} — the left half is out.', {
                  value: pivotValue,
                  target: evTarget,
                }),
          );
          await stage.discardHalf(lo, hi);
          return;
        }

        case 'lane-settled': {
          // 캡션은 건드리지 않는다 — 바로 앞 걸음이 한 말이 이 줄의 결론이다.
          const which = lane(p?.lane);
          if (which === null) return;
          await stage.settleLane(which);
          return;
        }

        case 'scale-set': {
          const loIndex = num(p?.loIndex);
          const hiIndex = num(p?.hiIndex);
          const loValue = num(p?.loValue);
          const hiValue = num(p?.hiValue);
          if (loIndex === null || hiIndex === null || loValue === null || hiValue === null) return;
          caption(
            tr('caption.scaleSet', 'Read the two ends as a scale — {loValue} to {hiValue}.', {
              loValue,
              hiValue,
            }),
          );
          await stage.setScale(loIndex, hiIndex);
          return;
        }

        case 'aim-measure': {
          const loValue = num(p?.loValue);
          const hiValue = num(p?.hiValue);
          const evTarget = num(p?.target);
          const fraction = num(p?.fraction);
          if (loValue === null || hiValue === null || evTarget === null || fraction === null) {
            return;
          }
          caption(
            tr('caption.aimMeasure', 'Where does {target} sit on that scale?', {
              target: evTarget,
            }),
          );
          await stage.aimMeasure(loValue, hiValue, evTarget, fraction);
          return;
        }

        case 'aim-land': {
          const index = num(p?.index);
          const fraction = num(p?.fraction);
          if (index === null || fraction === null) return;
          caption(
            tr('caption.aimLand', 'The same fraction of the slots — slot {index}.', { index }),
          );
          await stage.aimLand(index, fraction);
          return;
        }

        case 'rewind': {
          stage.rewind();
          return;
        }

        case 'done': {
          const aimProbes = num(p?.aimProbes);
          const midProbes = num(p?.midProbes);
          if (aimProbes === null || midProbes === null) return;
          caption(
            tr('caption.verdict', '{aim} against {mid}. The value itself said where to look.', {
              aim: aimProbes,
              mid: midProbes,
            }),
          );
          await stage.finish();
          return;
        }

        default:
          // 위에 없는 type 은 이 facet 이 발신하지 않는다. 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      // 데이터 복원 뒤 러너가 onInit 을 다시 불러 화면을 처음부터 짓는다.
    },
  };
};
