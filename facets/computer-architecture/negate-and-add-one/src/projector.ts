/**
 * negate-and-add-one projector — 걸음을 stage 의 손짓으로 옮긴다.
 *
 * 캡션 문안은 여기서 `runtime.t` 로 해석해 넘긴다. algorithm 은 문안도 키도 보내지
 * 않는다 — 지금이 어느 걸음인지는 이벤트 종류가 이미 말하고 있다 (C10).
 *
 * payload 는 여기서 좁혀 stage 로 넘긴다. stage 는 좁혀진 값만 받는다 (C9).
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorRuntime,
  ProjectorViews,
} from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type Stage = {
  showValue?(v: { bits: number[]; unsigned: number }): Promise<void> | void;
  flipAll?(v: { bits: number[]; unsigned: number }): Promise<void> | void;
  addOne?(v: {
    bits: number[];
    unsigned: number;
    carrySteps: number;
    carryOut: boolean;
  }): Promise<void> | void;
  verify?(v: {
    addend: number[];
    sum: number[];
    carrySteps: number;
    carryOut: boolean;
  }): Promise<void> | void;
  conclude?(v: { signed: number }): Promise<void> | void;
  rewind?(): void;
  setCaption?(text: string): void;
};

/**
 * 열린 payload 를 한 번에 좁힌다. 꺼낸 값은 아래에서 하나씩 `typeof` 로 거른다 —
 * 검사 없이 필드를 믿고 쓰는 것이 아니라 검사를 앞세운 좁히개다 (C9).
 */
function fields(payload: unknown): Record<string, unknown> | null {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : null;
}

function bitsOf(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: number[] = [];
  for (const b of v) {
    if (typeof b !== 'number') return null;
    out.push(b === 1 ? 1 : 0);
  }
  return out;
}

function numOf(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export const negateAndAddOneProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      const p = fields(event.payload);

      switch (event.type) {
        case 'show-value': {
          const bits = bitsOf(p?.bits);
          if (!bits) return;
          const unsigned = numOf(p?.unsigned, 0);
          stage?.setCaption?.(
            tr('caption.start', 'Here is +{v}, written in {w} bits.', {
              v: unsigned,
              w: bits.length,
            }),
          );
          await stage?.showValue?.({ bits, unsigned });
          return;
        }

        case 'flip-all': {
          const bits = bitsOf(p?.bits);
          if (!bits) return;
          stage?.setCaption?.(
            tr('caption.flip', 'Every position turns to its opposite, all at once.'),
          );
          await stage?.flipAll?.({ bits, unsigned: numOf(p?.unsigned, 0) });
          return;
        }

        case 'add-one': {
          const bits = bitsOf(p?.bits);
          if (!bits) return;
          stage?.setCaption?.(
            tr('caption.addOne', 'Add 1. The carry lands on the last position and stops.'),
          );
          await stage?.addOne?.({
            bits,
            unsigned: numOf(p?.unsigned, 0),
            carrySteps: Math.max(0, Math.trunc(numOf(p?.carrySteps, 0))),
            carryOut: p?.carryOut === true,
          });
          return;
        }

        case 'verify': {
          const addend = bitsOf(p?.addend);
          const sum = bitsOf(p?.sum);
          if (!addend || !sum) return;
          stage?.setCaption?.(
            tr(
              'caption.verify',
              'Add the original back: the carry runs the whole width and leaves.',
            ),
          );
          await stage?.verify?.({
            addend,
            sum,
            carrySteps: Math.max(0, Math.trunc(numOf(p?.carrySteps, 0))),
            carryOut: p?.carryOut === true,
          });
          return;
        }

        case 'done': {
          const signed = numOf(p?.signed, 0);
          stage?.setCaption?.(
            tr('caption.conclude', 'The sum is 0, so this pattern is the negative: {signed}.', {
              signed,
            }),
          );
          await stage?.conclude?.({ signed });
          return;
        }

        case 'rewind': {
          stage?.setCaption?.('');
          stage?.rewind?.();
          return;
        }

        default:
          // 이 algorithm 은 위 여섯만 발신한다. 그 밖의 것은 조용히 흘린다.
          return;
      }
    },

    onReset(): void {
      stage?.setCaption?.('');
      stage?.rewind?.();
    },
  };
};
