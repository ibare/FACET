/**
 * 청킹 projector — 알고리즘 이벤트를 stage 호출로 옮긴다.
 *
 * 운동의 길이는 재생 속도를 따라간다 — 걸음마다 `getSpeed()` 로 나눠 stage 에 넘긴다.
 * 걸음 머무름(700ms)보다 짧게 잡아 걸음 경계를 넘지 않게 한다.
 */

import type { ProjectorFactory, ViewInstance } from '@ffacet/core/runtime';
import { sentenceSpans, splitWords } from './algorithm.js';
import type { ChunkingStage } from './chunking-stage.js';

/** 운동 한 마디의 기준 길이 (속도 1 에서). */
const MOVE_MS = 480;

type CodePanel = ViewInstance & {
  highlightPhase?(phase: string | null): void;
  clearHighlight?(): void;
};

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function nums(v: unknown): number[] {
  return Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];
}

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) return undefined;
  return (payload as Record<string, unknown>)[key];
}

export const chunkingProjector: ProjectorFactory = (views, runtime) => {
  const stage = views.stage as unknown as Partial<ChunkingStage> | undefined;
  const panel = views.codePanel as unknown as CodePanel | undefined;
  const ms = (): number => MOVE_MS / Math.max(0.01, runtime?.getSpeed() ?? 1);

  return {
    onInit(initialData) {
      const text = field(initialData, 'text');
      const words = splitWords(typeof text === 'string' ? text : '');
      stage?.setup?.(words, sentenceSpans(words));
      panel?.clearHighlight?.();
    },
    onEvent(event) {
      const p = event.payload;
      switch (event.type) {
        case 'phase': {
          const name = field(p, 'phase');
          panel?.highlightPhase?.(typeof name === 'string' ? name : null);
          return;
        }
        case 'plan':
          stage?.plan?.(num(field(p, 'rule')), num(field(p, 'size')), num(field(p, 'count')), ms());
          return;
        case 'chunk':
          stage?.placeChunk?.(
            num(field(p, 'index')),
            num(field(p, 'start')),
            num(field(p, 'end')),
            nums(field(p, 'whole')),
            ms(),
          );
          return;
        case 'judge':
          stage?.judge?.(nums(field(p, 'broken')), num(field(p, 'total')), num(field(p, 'count')), ms());
          return;
        case 'done':
          stage?.finish?.(
            num(field(p, 'chunks')),
            num(field(p, 'broken')),
            num(field(p, 'stored')),
            num(field(p, 'fill')),
          );
          return;
        default:
          return;
      }
    },
    onReset() {
      stage?.clear?.();
      panel?.clearHighlight?.();
    },
  };
};
