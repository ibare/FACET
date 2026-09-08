/**
 * hash-to-bucket projector — 접히는 걸음을 stage 메서드 호출로 옮긴다.
 *
 * payload 는 여기서 좁혀서 넘긴다 (C9). stage 는 좁혀진 값만 받으므로
 * `unknown` 이 화면 코드까지 흘러가지 않는다.
 * 문안은 키로만 들고 있고 문장은 `FacetJson.messages` 가 준다 (C10).
 */

import { makeTranslator, type ProjectorFactory } from '@ffacet/core/runtime';

type HashToBucketStage = {
  clear?(): void;
  setCaption?(text: string): void;
  showKey?(key: string): void | Promise<void>;
  foldToHash?(hash: number, signBit: number): void | Promise<void>;
  dropSignBit?(masked: number): void | Promise<void>;
  landInBucket?(key: string, slot: number, bucketCount: number): void | Promise<void>;
  settle?(): void | Promise<void>;
};

export const hashToBucketProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as HashToBucketStage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(): void {
      stage.clear?.();
    },

    onReset(): void {
      stage.clear?.();
    },

    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'key-shown': {
          const p = event.payload as { key?: unknown } | undefined;
          if (typeof p?.key !== 'string') return;
          const key = p.key;
          stage.setCaption?.(
            tr('caption.key', 'Keys differ in length — "{key}" has {len} characters.', {
              key,
              len: [...key].length,
            }),
          );
          await stage.showKey?.(key);
          return;
        }

        case 'hash-folded': {
          const p = event.payload as { hash?: unknown; signBit?: unknown } | undefined;
          if (typeof p?.hash !== 'number' || typeof p.signBit !== 'number') return;
          stage.setCaption?.(
            tr('caption.fold', 'The hash function folds it into one integer: {hash}', {
              hash: p.hash,
            }),
          );
          await stage.foldToHash?.(p.hash, p.signBit);
          return;
        }

        case 'sign-dropped': {
          const p = event.payload as { hash?: unknown; masked?: unknown } | undefined;
          if (typeof p?.hash !== 'number' || typeof p.masked !== 'number') return;
          stage.setCaption?.(
            tr('caption.mask', 'Drop the sign bit: {hash} & 0x7FFFFFFF = {masked}', {
              hash: p.hash,
              masked: p.masked,
            }),
          );
          await stage.dropSignBit?.(p.masked);
          return;
        }

        case 'bucket-landed': {
          const p = event.payload as
            | { key?: unknown; masked?: unknown; slot?: unknown; bucketCount?: unknown }
            | undefined;
          if (
            typeof p?.key !== 'string' ||
            typeof p.masked !== 'number' ||
            typeof p.slot !== 'number' ||
            typeof p.bucketCount !== 'number'
          ) {
            return;
          }
          stage.setCaption?.(
            tr('caption.bucket', '{masked} mod {count} = slot {slot}', {
              masked: p.masked,
              count: p.bucketCount,
              slot: p.slot,
            }),
          );
          await stage.landInBucket?.(p.key, p.slot, p.bucketCount);
          return;
        }

        case 'rewind': {
          stage.clear?.();
          return;
        }

        case 'done': {
          const p = event.payload as { bucketCount?: unknown } | undefined;
          if (typeof p?.bucketCount !== 'number') return;
          stage.setCaption?.(
            tr('caption.done', 'Whatever the key, it folds into one of the {count} slots.', {
              count: p.bucketCount,
            }),
          );
          await stage.settle?.();
          return;
        }

        // 그 밖의 이벤트는 이 조각의 어휘에 없다 — 조용히 흘려보낸다 (C2).
        default:
          return;
      }
    },
  };
};
