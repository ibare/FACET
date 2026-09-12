/**
 * signedWraparound Projector — 걸음 이벤트를 stage 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀 정형 객체로 넘긴다 (C9). 문안은 키로만 갖고 있고
 * 실제 문장은 `facet.ts` 의 `messages` 에 있다 (C10).
 *
 * 넘어간 뒤의 +1 은 넘어가기 전의 +1 과 같은 사건이지만 하는 말이 다르다 —
 * 그 하나를 가르려고 projector 가 "이미 넘어갔는가" 만 시각 상태로 들고 있다.
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

type Step = {
  from: number;
  to: number;
  fromBits: string;
  toBits: string;
  atMax: boolean;
};

type WraparoundStage = {
  setCaption?(text: string): void;
  advanceTo?(step: Step): void | Promise<void>;
  wrapTo?(step: Step): void | Promise<void>;
  conclude?(): void;
  restore?(): void;
};

/** 걸음 payload 를 좁힌다. 필드마다 런타임 가드를 거친 뒤에만 쓴다 (C9). */
function readStep(payload: unknown): Step | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.from !== 'number' || typeof p.to !== 'number') return null;
  if (typeof p.fromBits !== 'string' || typeof p.toBits !== 'string') return null;
  return {
    from: p.from,
    to: p.to,
    fromBits: p.fromBits,
    toBits: p.toBits,
    atMax: p.atMax === true,
  };
}

export const signedWraparoundProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as WraparoundStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  /** 표식이 이미 한 바퀴를 넘었는가. 되감으면 다시 거짓이 된다. */
  let wrapped = false;

  return {
    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'advance': {
          const step = readStep(event.payload);
          if (!step) return;
          stage?.setCaption?.(
            wrapped
              ? tr('caption.afterWrap', 'From here it walks right again: {to}', { to: step.to })
              : tr('caption.step', 'Add one — the marker steps one cell right: {to}', {
                  to: step.to,
                }),
          );
          await stage?.advanceTo?.(step);
          return;
        }

        case 'reach-max': {
          const step = readStep(event.payload);
          if (!step) return;
          // 폭은 비트열에서 읽는다 — 문안에 8 을 박으면 다른 폭에서 거짓이 된다.
          stage?.setCaption?.(
            tr(
              'caption.atMax',
              'The right end — the largest signed value {bits} bits hold is {to}',
              { bits: step.toBits.length, to: step.to },
            ),
          );
          await stage?.advanceTo?.(step);
          return;
        }

        case 'wrap': {
          const step = readStep(event.payload);
          if (!step) return;
          wrapped = true;
          stage?.setCaption?.(
            tr(
              'caption.wrap',
              'One more — the carry runs into the sign bit, and past the right end the marker comes out at the left: {to}',
              { to: step.to },
            ),
          );
          await stage?.wrapTo?.(step);
          return;
        }

        case 'done': {
          stage?.setCaption?.(
            tr(
              'caption.conclusion',
              'Not a line but a ring — the largest value is followed by the smallest',
            ),
          );
          stage?.conclude?.();
          return;
        }

        case 'rewind': {
          wrapped = false;
          stage?.restore?.();
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각에 없다 — 와도 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      wrapped = false;
      stage?.restore?.();
    },
  };
};
