/**
 * 약수의 짝 — 이벤트를 무대의 몸짓으로 옮긴다.
 *
 * payload 를 그대로 넘기지 않고 수만 좁혀 넘긴다 (C9). 화면 문안은 키로만
 * 다루고 문장은 `facet.ts` 의 `messages` 에 있다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

/** stage 가 내주는 계약. `ViewInstance` 가 열린 타입이라 여기서 좁힌다 (C9). */
type DivisorStage = {
  probe?(d: number): Promise<void> | void;
  pairTo?(d: number, q: number): Promise<void> | void;
  miss?(d: number): Promise<void> | void;
  coverBeyond?(from: number): Promise<void> | void;
  setCaption?(text: string): void;
  rewind?(): void;
};

type DivisorPayload = {
  d?: unknown;
  q?: unknown;
  n?: unknown;
  self?: unknown;
  from?: unknown;
};

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export const divisorPairsSqrtProjector: ProjectorFactory = (views, runtime) => {
  const stage = views['stage'] as unknown as DivisorStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event) {
      const p = (event.payload ?? {}) as DivisorPayload;
      const d = num(p.d);
      const n = num(p.n);

      switch (event.type) {
        case 'probe': {
          stage?.setCaption?.(tr('caption.probe', 'Is {d} a divisor of {n}?', { d, n }));
          await stage?.probe?.(d);
          return;
        }
        case 'pair': {
          const q = num(p.q);
          stage?.setCaption?.(
            p.self === true
              ? tr(
                  'caption.self',
                  '{d} × {d} = {n}. Here the pair meets itself — this is the square root of {n}.',
                  { d, n },
                )
              : tr(
                  'caption.pair',
                  '{d} × {q} = {n}. Finding the smaller side finds the larger one too.',
                  { d, q, n },
                ),
          );
          await stage?.pairTo?.(d, q);
          return;
        }
        case 'miss': {
          stage?.setCaption?.(
            tr('caption.miss', '{n} is not divisible by {d}. No partner here.', { d, n }),
          );
          await stage?.miss?.(d);
          return;
        }
        case 'cover': {
          stage?.setCaption?.(
            tr(
              'caption.stop',
              'Every pair has its smaller side at or before the square root. Walking that far meets them all.',
              { n },
            ),
          );
          await stage?.coverBeyond?.(num(p.from));
          return;
        }
        case 'rewind': {
          stage?.rewind?.();
          stage?.setCaption?.('');
          return;
        }
        default:
          // algorithm 이 내보내는 다섯을 위에서 모두 다룬다. 그 밖의 이벤트는
          // 오지 않으며, 오더라도 화면을 건드리지 않고 흘려보낸다 (C2).
          return;
      }
    },

    onReset() {
      stage?.rewind?.();
      stage?.setCaption?.('');
    },
  };
};
