/**
 * load-factor-rehash projector — algorithm 이벤트를 stage 메서드 호출로 옮긴다.
 *
 * payload 는 `unknown` 이므로 여기서 전부 좁힌 뒤 stage 로 넘긴다 (C9).
 * stage 는 좁혀진 정형 객체만 받고, 검증을 다시 하지 않는다.
 *
 * 캡션 문안은 이 파일에 없다 — 키와 en 원본만 있고 문안은 `facet.ts` 의
 * `messages` 가 정한다 (C10).
 */

import {
  makeTranslator,
  type FacetRuntimeEvent,
  type ProjectorFactory,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';
import type {
  RehashStageGrow,
  RehashStageInsert,
  RehashStageKey,
  RehashStageSetup,
  RehashStageStep,
} from './load-factor-rehash-stage.js';

/** stage 의 호출 계약. 없는 메서드는 `?.()` 로 건너뛴다 (C9). */
type RehashStage = {
  setup?(spec: RehashStageSetup): void;
  reset?(): void;
  insert?(p: RehashStageInsert): void;
  grow?(p: RehashStageGrow): void;
  rehash?(p: RehashStageStep): void;
  finish?(): void;
  setCaption?(text: string): void;
};

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function narrowKeys(raw: unknown): RehashStageKey[] {
  if (!Array.isArray(raw)) return [];
  const out: RehashStageKey[] = [];
  for (const item of raw) {
    const r = item as {
      key?: unknown;
      masked?: unknown;
      slotSmall?: unknown;
      slotLarge?: unknown;
    } | null;
    const key = str(r?.key);
    const masked = num(r?.masked);
    const slotSmall = num(r?.slotSmall);
    const slotLarge = num(r?.slotLarge);
    if (key === null || masked === null || slotSmall === null || slotLarge === null) continue;
    out.push({ key, masked, slotSmall, slotLarge });
  }
  return out;
}

export const loadFactorRehashProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as RehashStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(initialData: unknown): void {
      const d = initialData as {
        buckets?: unknown;
        grownBuckets?: unknown;
        threshold?: unknown;
        keys?: unknown;
        incoming?: unknown;
      } | null;
      const buckets = num(d?.buckets);
      const grownBuckets = num(d?.grownBuckets);
      const threshold = num(d?.threshold);
      const incoming = str(d?.incoming);
      const keys = narrowKeys(d?.keys);
      if (buckets === null || grownBuckets === null || threshold === null || incoming === null) {
        return;
      }
      stage?.setup?.({ buckets, grownBuckets, threshold, keys, incoming });
    },

    onEvent(event: FacetRuntimeEvent): void {
      switch (event.type) {
        case 'seat': {
          const p = event.payload as {
            key?: unknown;
            masked?: unknown;
            slot?: unknown;
            buckets?: unknown;
            count?: unknown;
          } | undefined;
          const key = str(p?.key);
          const masked = num(p?.masked);
          const slot = num(p?.slot);
          const buckets = num(p?.buckets);
          const count = num(p?.count);
          if (key === null || masked === null || slot === null) return;
          if (buckets === null || count === null) return;
          stage?.insert?.({ key, masked, slot, buckets, count });
          stage?.setCaption?.(
            tr(
              'caption.threshold',
              'One more key fills {count} of {buckets} buckets — the load factor reaches the {threshold} threshold.',
              { count, buckets, threshold: '0.75' },
            ),
          );
          return;
        }

        case 'grow': {
          const p = event.payload as { buckets?: unknown; count?: unknown } | undefined;
          const buckets = num(p?.buckets);
          const count = num(p?.count);
          if (buckets === null || count === null) return;
          stage?.grow?.({ buckets, count });
          stage?.setCaption?.(
            tr('caption.grow', 'The table doubles, so the same {count} keys now fill far less of it.', {
              count,
            }),
          );
          return;
        }

        case 'rehash': {
          const p = event.payload as {
            key?: unknown;
            masked?: unknown;
            buckets?: unknown;
            from?: unknown;
            to?: unknown;
          } | undefined;
          const key = str(p?.key);
          const masked = num(p?.masked);
          const buckets = num(p?.buckets);
          const from = num(p?.from);
          const to = num(p?.to);
          if (key === null || masked === null || buckets === null) return;
          if (from === null || to === null) return;
          stage?.rehash?.({ key, masked, buckets, from, to });
          stage?.setCaption?.(
            tr(
              'caption.recompute',
              'Nothing is carried over. Every key is divided again by the new bucket count.',
            ),
          );
          return;
        }

        case 'done': {
          const p = (event.payload ?? {}) as { moved?: unknown; stayed?: unknown };
          const moved = typeof p.moved === 'number' ? p.moved : 0;
          const stayed = typeof p.stayed === 'number' ? p.stayed : 0;
          stage?.finish?.();
          stage?.setCaption?.(
            tr('caption.result', '{moved} keys landed somewhere else. {stayed} happened to stay.', {
              moved,
              stayed,
            }),
          );
          return;
        }

        case 'rewind': {
          stage?.reset?.();
          stage?.setCaption?.('');
          return;
        }

        default:
          // 이 facet 의 algorithm 은 위 다섯 외의 이벤트를 발신하지 않는다.
          // 다른 것이 오면 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.reset?.();
      stage?.setCaption?.('');
    },
  };
};
