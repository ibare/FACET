/**
 * chaining-bucket projector — 이벤트를 stage 메서드 호출로 번역한다.
 *
 * payload 는 그대로 넘기지 않는다. `typeof` 가드로 정형 객체를 조립해 넘기고,
 * 자리 번호는 표준 식별자 `index:<b>` 를 `toIndexArray` 로 푼다 (C1 · C9).
 * 캡션 문안은 여기 없다 — 키와 en 원본만 있고 실제 문장은 `facet.ts` 의
 * `messages` 에 있다 (C10).
 */

import {
  makeTranslator,
  toIndexArray,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
} from '@ffacet/core/runtime';

type ChainingBucketStage = {
  hangKey?: (input: {
    key: string;
    hash: number;
    bucket: number;
    depth: number;
    caption: string;
  }) => Promise<void> | void;
  jumpToBucket?: (input: { key: string; bucket: number; caption: string }) => Promise<void> | void;
  compareLink?: (input: {
    bucket: number;
    depth: number;
    match: boolean;
    caption: string;
  }) => Promise<void> | void;
  settle?: (input: { caption: string }) => void;
  rewind?: () => void;
};

const readString = (v: unknown): string | null => (typeof v === 'string' ? v : null);

const readNumber = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

const firstBucket = (target: FacetRuntimeEvent['target']): number | null => {
  const indices = toIndexArray(target);
  return indices.length === 0 ? null : indices[0];
};

export const chainingBucketProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as ChainingBucketStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  const hangCaption = (key: string, bucket: number, depth: number): string =>
    depth === 0
      ? tr(
          'caption.hangFirst',
          '{key} hashes to slot {bucket}. Nothing hangs there yet, so it hangs alone.',
          { key, bucket },
        )
      : tr(
          'caption.hangCollide',
          '{key} lands on slot {bucket} too. Nothing is pushed out — it hooks onto the end of that chain.',
          { key, bucket },
        );

  return {
    onInit(): void {
      stage?.rewind?.();
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'key-hung': {
          const bucket = firstBucket(event.target);
          const p = event.payload as
            | { key?: unknown; hash?: unknown; depth?: unknown }
            | undefined;
          const key = readString(p?.key);
          const hash = readNumber(p?.hash);
          const depth = readNumber(p?.depth);
          if (bucket === null || key === null || hash === null || depth === null) return;
          await stage?.hangKey?.({
            key,
            hash,
            bucket,
            depth,
            caption: hangCaption(key, bucket, depth),
          });
          return;
        }

        case 'probe-jump': {
          const bucket = firstBucket(event.target);
          const p = event.payload as { key?: unknown } | undefined;
          const key = readString(p?.key);
          if (bucket === null || key === null) return;
          await stage?.jumpToBucket?.({
            key,
            bucket,
            caption: tr(
              'caption.probeJump',
              'Looking for {key}: go straight to slot {bucket}. No other slot is touched.',
              { key, bucket },
            ),
          });
          return;
        }

        case 'probe-compare': {
          const bucket = firstBucket(event.target);
          const p = event.payload as
            | { key?: unknown; depth?: unknown; match?: unknown }
            | undefined;
          const key = readString(p?.key);
          const depth = readNumber(p?.depth);
          const match = typeof p?.match === 'boolean' ? p.match : null;
          if (bucket === null || key === null || depth === null || match === null) return;
          await stage?.compareLink?.({
            bucket,
            depth,
            match,
            caption: match
              ? tr('caption.probeHit', '{key} matches.', { key })
              : tr('caption.probeMiss', '{key} is not it. Step one link down the chain.', { key }),
          });
          return;
        }

        case 'done': {
          const p = event.payload as { bucket?: unknown; comparisons?: unknown } | undefined;
          const bucket = readNumber(p?.bucket);
          const comparisons = readNumber(p?.comparisons);
          if (bucket === null || comparisons === null) return;
          stage?.settle?.({
            caption: tr(
              'caption.done',
              'Found in slot {bucket} after {comparisons} comparisons — only that one chain was walked.',
              { bucket, comparisons },
            ),
          });
          return;
        }

        case 'rewind': {
          stage?.rewind?.();
          return;
        }

        default:
          // 이 조각의 algorithm 은 위 다섯만 발신한다. 그 밖은 조용히 흘린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.rewind?.();
    },
  };
};
