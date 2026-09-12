/**
 * hnsw projector — 걸음 이벤트를 지도 위의 움직임으로 옮긴다.
 *
 * payload 는 여기서 좁혀서 넘긴다 (C9). `event.payload` 를 그대로 stage 로
 * 흘리지 않는다 — stage 는 필수 필드 타입으로만 받는다.
 *
 * 문안은 키로만 들고 있고 실제 문장은 `facet.ts` 의 선언에서 온다 (C10).
 */

import type { ProjectorFactory } from '@ffacet/core/runtime';
import { makeTranslator } from '@ffacet/core/runtime';
import type { HnswStageFrame, HnswStageScene, HnswStageWalker } from './hnsw-stage.js';

/** stage 의 계약. 구체형은 파일 상단에 모으고 호출은 `?.()` 로 한다 (C9). */
type HnswStage = {
  setScene?(scene: HnswStageScene): void;
  showStep?(frame: HnswStageFrame): Promise<void> | void;
  setCaption?(text: string): void;
  resetScene?(): void;
};

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function asScene(payload: unknown): HnswStageScene | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.levels !== 'number' || typeof p.truth !== 'string') return null;
  const members = Array.isArray(p.members) ? p.members.map(asStringArray) : [];
  return { levels: p.levels, members, truth: p.truth };
}

function asWalker(v: unknown): HnswStageWalker | null {
  if (typeof v !== 'object' || v === null) return null;
  const w = v as Record<string, unknown>;
  if (typeof w.entry !== 'string' || typeof w.at !== 'string') return null;
  return {
    entry: w.entry,
    at: w.at,
    level: typeof w.level === 'number' ? w.level : 0,
    probed: asStringArray(w.probed),
    seen: asStringArray(w.seen),
    done: w.done === true,
  };
}

function asFrame(payload: unknown): HnswStageFrame | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.walkers)) return null;
  const walkers: HnswStageWalker[] = [];
  for (const item of p.walkers) {
    const w = asWalker(item);
    if (w) walkers.push(w);
  }
  if (walkers.length === 0) return null;
  return {
    tick: typeof p.tick === 'number' ? p.tick : 0,
    levels: typeof p.levels === 'number' ? p.levels : 1,
    walkers,
  };
}

type RoundSummary = { levels: number; hits: number; seenSum: number; truth: string };

function asSummary(payload: unknown): RoundSummary | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.levels !== 'number' || typeof p.hits !== 'number') return null;
  if (typeof p.seenSum !== 'number' || typeof p.truth !== 'string') return null;
  return { levels: p.levels, hits: p.hits, seenSum: p.seenSum, truth: p.truth };
}

export const hnswProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as HnswStage | undefined;
  const tr = runtime?.t ?? makeTranslator();

  return {
    onInit(): void {
      // `initialData` 를 좁히는 자리는 stage 의 mount 다. 여기서 다시 좁혀 밀어
      // 넣으면 좁히는 규칙이 두 벌이 된다 (S-piece).
      stage?.resetScene?.();
    },

    async onEvent(event): Promise<void> {
      switch (event.type) {
        case 'layers-set': {
          const scene = asScene(event.payload);
          if (scene) stage?.setScene?.(scene);
          return;
        }
        case 'walkers-step': {
          const frame = asFrame(event.payload);
          if (!frame) return;
          // 캡션의 수는 stage 로 넘기는 것과 **같은 배열**에서 나온다.
          const seen = frame.walkers.reduce((s, w) => s + w.seen.length, 0);
          stage?.setCaption?.(
            tr('caption.walk', '{levels} levels — six walks step together. Seen: {seen}.', {
              levels: frame.levels,
              seen,
            }),
          );
          await stage?.showStep?.(frame);
          return;
        }
        case 'round-done': {
          const done = asSummary(event.payload);
          if (!done) return;
          stage?.setCaption?.(
            tr('caption.result', '{levels} levels — {hits} of six reached {truth}. Seen: {seen}.', {
              levels: done.levels,
              hits: done.hits,
              truth: done.truth,
              seen: done.seenSum,
            }),
          );
          return;
        }
        default:
          // 그 밖의 이벤트는 이 facet 이 발신하지 않는다. 와도 조용히 버린다 (C2).
          return;
      }
    },

    onReset(): void {
      stage?.resetScene?.();
    },
  };
};
