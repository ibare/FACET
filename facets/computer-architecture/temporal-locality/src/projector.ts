/**
 * temporal-locality 조각의 번역기.
 *
 * algorithm 이 보내는 payload 는 `unknown` 이므로 가드로 좁힌 정형 객체만 stage 로
 * 넘긴다 (C9). 화면 문안은 여기서 `tr` 로 뽑아 넘긴다 — algorithm 은 문안을 모르고
 * 키도 싣지 않는다 (C10).
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';

type Stage = {
  setCaption?(text: string): void;
  beginStream?(p: { stream: number }): Promise<void> | void;
  access?(p: {
    stream: number;
    step: number;
    index: number;
    line: number;
    hit: boolean;
    slot: number;
    evicted: number | null;
  }): Promise<void> | void;
  endStream?(p: { stream: number }): void;
  verdict?(): Promise<void> | void;
  rewind?(): void;
};

type AccessPayload = {
  stream: number;
  step: number;
  index: number;
  line: number;
  hit: boolean;
  slot: number;
  evicted: number | null;
};

function readAccess(payload: unknown): AccessPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.stream !== 'number' ||
    typeof p.step !== 'number' ||
    typeof p.index !== 'number' ||
    typeof p.line !== 'number' ||
    typeof p.hit !== 'boolean' ||
    typeof p.slot !== 'number'
  ) {
    return null;
  }
  return {
    stream: p.stream,
    step: p.step,
    index: p.index,
    line: p.line,
    hit: p.hit,
    slot: p.slot,
    evicted: typeof p.evicted === 'number' ? p.evicted : null,
  };
}

function readNumber(payload: unknown, key: string): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === 'number' ? v : null;
}

export const temporalLocalityProjector: ProjectorFactory = (views, runtime): ProjectorInstance => {
  const stage = views.stage as unknown as Stage;
  const tr = runtime?.t ?? makeTranslator();

  return {
    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'stream-begin': {
          const stream = readNumber(event.payload, 'stream');
          if (stream === null) return;
          const slots = readNumber(event.payload, 'slots') ?? 0;
          stage.setCaption?.(
            stream === 0
              ? tr('caption.near', 'Six reads, all at the same spot. Slots upstairs: {slots}.', {
                  slots,
                })
              : tr('caption.far', 'Six reads again, but each one somewhere else.'),
          );
          await stage.beginStream?.({ stream });
          return;
        }

        case 'access': {
          const access = readAccess(event.payload);
          if (!access) return;
          stage.setCaption?.(
            access.hit
              ? tr('caption.hit', 'Already upstairs. The read turns back here.')
              : access.evicted !== null
                ? tr('caption.evict', 'No free slot — the line that waited longest is pushed out.')
                : tr('caption.miss', 'Not upstairs. The read goes down and the line rises.'),
          );
          await stage.access?.(access);
          return;
        }

        case 'stream-end': {
          const stream = readNumber(event.payload, 'stream');
          if (stream === null) return;
          const misses = readNumber(event.payload, 'misses') ?? 0;
          stage.endStream?.({ stream });
          stage.setCaption?.(
            stream === 0
              ? tr('caption.nearResult', 'Staying put. Trips downstairs: {miss}.', { miss: misses })
              : tr('caption.farResult', 'Wandering off. Trips downstairs: {miss}.', { miss: misses }),
          );
          return;
        }

        case 'verdict': {
          stage.setCaption?.(
            tr('caption.verdict', 'Same six reads either way. Trips downstairs: {near} and {far}.', {
              near: readNumber(event.payload, 'near') ?? 0,
              far: readNumber(event.payload, 'far') ?? 0,
            }),
          );
          await stage.verdict?.();
          return;
        }

        case 'rewind': {
          stage.rewind?.();
          return;
        }

        default:
          // 그 밖의 이벤트는 이 조각이 발신하지 않는다 — 오면 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage.rewind?.();
    },
  };
};
