/**
 * averageTheBuckets projector — 이벤트를 stage 메서드로 옮긴다.
 *
 * payload 는 여기서 좁혀 넘긴다 (C9). stage 는 좁혀진 값만 받는다.
 * 문안은 키로 조회하고 값은 vars 로 민다 (C10).
 */

import { makeTranslator, type ProjectorFactory, type Translate } from '@ffacet/core/runtime';

/** stage 가 내주는 계약. 모두 optional 로 두고 `?.()` 로 부른다 (C9). */
type Stage = {
  showStream?(caption: string): Promise<void>;
  pourIntoOne?(maxRho: number, caption: string): Promise<void>;
  readSingle?(estimate: number, truth: number, caption: string): Promise<void>;
  splitIntoBuckets?(caption: string): Promise<void>;
  settleBuckets?(maxima: number[], estimates: number[], caption: string): Promise<void>;
  gatherReadings?(estimate: number, caption: string): Promise<void>;
  rewind?(): void;
  reset?(): void;
};

/** 가드가 뒤따르는 좁히개 — 아래에서 필드마다 typeof 를 본다 (C9). */
function payloadOf(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

function numberAt(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function numbersAt(p: Record<string, unknown>, key: string): number[] {
  const v = p[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
}

/** 정수는 그대로, 아니면 소수 한 자리. 16.2153 → "16.2" */
function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

export const averageTheBucketsProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Stage | undefined;
  const tr: Translate = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event) {
      const p = payloadOf(event.payload);

      switch (event.type) {
        case 'stream':
          await stage?.showStream?.(
            tr('caption.stream', 'Every key brings one run length. Keys: {n}.', {
              n: numberAt(p, 'count'),
            }),
          );
          return;

        case 'pour': {
          const maxRho = numberAt(p, 'maxRho');
          await stage?.pourIntoOne?.(
            maxRho,
            tr('caption.pour', 'One counter keeps only the largest: {n}.', { n: maxRho }),
          );
          return;
        }

        case 'read-single': {
          const estimate = numberAt(p, 'estimate');
          const truth = numberAt(p, 'truth');
          await stage?.readSingle?.(
            estimate,
            truth,
            tr('caption.readSingle', 'One counter answers {est}, but the truth is {truth}.', {
              est: fmt(estimate),
              truth: fmt(truth),
            }),
          );
          return;
        }

        case 'split':
          await stage?.splitIntoBuckets?.(
            tr('caption.split', 'Split into four. Each key is trapped in its own bucket.'),
          );
          return;

        case 'settle': {
          const maxima = numbersAt(p, 'maxima');
          const estimates = numbersAt(p, 'estimates');
          await stage?.settleBuckets?.(
            maxima,
            estimates,
            // 통 넷을 전제한 문형이다 — 이 조각의 주장 자체가 넷으로 나누는 일이다.
            tr('caption.settle', 'Alone, each bucket answers {a} · {b} · {c} · {d}.', {
              a: fmt(estimates[0] ?? 0),
              b: fmt(estimates[1] ?? 0),
              c: fmt(estimates[2] ?? 0),
              d: fmt(estimates[3] ?? 0),
            }),
          );
          return;
        }

        case 'gather': {
          const estimate = numberAt(p, 'estimate');
          await stage?.gatherReadings?.(
            estimate,
            tr('caption.gather', 'The four gather into {est}. Truth: {truth}.', {
              est: fmt(estimate),
              truth: fmt(numberAt(p, 'truth')),
            }),
          );
          return;
        }

        case 'rewind':
          stage?.rewind?.();
          return;

        default:
          // 이 facet 이 내는 것은 위 일곱뿐이다. 그 밖의 것은 일부러 흘린다 (C2).
          return;
      }
    },

    onReset() {
      stage?.reset?.();
    },
  };
};
