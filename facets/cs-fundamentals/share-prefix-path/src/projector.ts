/**
 * sharePrefixPathProjector — algorithm.ts 의 이벤트를 stage view 호출로 옮긴다.
 *
 * payload 는 전부 `typeof` 가드로 좁힌 뒤에만 stage 로 넘긴다 (C9). 화면 문안은
 * stage 가 `params.t` 로 직접 조회하므로 (C10) 여기서는 구조만 옮긴다.
 */

import type {
  FacetRuntimeEvent,
  ProjectorFactory,
  ProjectorInstance,
  ProjectorViews,
} from '@ffacet/core/runtime';

/** stage view 의 계약 — algorithm 의 타입을 stage 가 import 하지 않으므로 여기서 동형으로 좁힌다. */
type PrefixStage = {
  init(payload: { words: string[] }): void;
  rewind(): void;
  beginWord(payload: { word: string; wordIndex: number }): void;
  ride(payload: { nodeId: string; parentId: string; char: string }): void | Promise<void>;
  grow(payload: { nodeId: string; parentId: string; char: string; depth: number }): void | Promise<void>;
  markWord(payload: { nodeId: string; word: string }): void;
  endWord(payload: { word: string; wordIndex: number; rode: number; grown: number }): void;
  summarize(payload: { wordCount: number; totalSeats: number; rawChars: number; saved: number }): void;
  destroy(): void;
};

function narrowWordBegin(payload: unknown): { word: string; wordIndex: number } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { word?: unknown; wordIndex?: unknown };
  if (typeof p.word !== 'string' || typeof p.wordIndex !== 'number') return null;
  return { word: p.word, wordIndex: p.wordIndex };
}

function narrowRide(payload: unknown): { nodeId: string; parentId: string; char: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { nodeId?: unknown; parentId?: unknown; char?: unknown };
  if (typeof p.nodeId !== 'string' || typeof p.parentId !== 'string' || typeof p.char !== 'string') return null;
  return { nodeId: p.nodeId, parentId: p.parentId, char: p.char };
}

function narrowGrow(payload: unknown): { nodeId: string; parentId: string; char: string; depth: number } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { nodeId?: unknown; parentId?: unknown; char?: unknown; depth?: unknown };
  if (
    typeof p.nodeId !== 'string' ||
    typeof p.parentId !== 'string' ||
    typeof p.char !== 'string' ||
    typeof p.depth !== 'number'
  ) {
    return null;
  }
  return { nodeId: p.nodeId, parentId: p.parentId, char: p.char, depth: p.depth };
}

function narrowMark(payload: unknown): { nodeId: string; word: string } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { nodeId?: unknown; word?: unknown };
  if (typeof p.nodeId !== 'string' || typeof p.word !== 'string') return null;
  return { nodeId: p.nodeId, word: p.word };
}

function narrowWordEnd(
  payload: unknown,
): { word: string; wordIndex: number; rode: number; grown: number } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { word?: unknown; wordIndex?: unknown; rode?: unknown; grown?: unknown };
  if (
    typeof p.word !== 'string' ||
    typeof p.wordIndex !== 'number' ||
    typeof p.rode !== 'number' ||
    typeof p.grown !== 'number'
  ) {
    return null;
  }
  return { word: p.word, wordIndex: p.wordIndex, rode: p.rode, grown: p.grown };
}

function narrowSummary(
  payload: unknown,
): { wordCount: number; totalSeats: number; rawChars: number; saved: number } | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as { wordCount?: unknown; totalSeats?: unknown; rawChars?: unknown; saved?: unknown };
  if (
    typeof p.wordCount !== 'number' ||
    typeof p.totalSeats !== 'number' ||
    typeof p.rawChars !== 'number' ||
    typeof p.saved !== 'number'
  ) {
    return null;
  }
  return { wordCount: p.wordCount, totalSeats: p.totalSeats, rawChars: p.rawChars, saved: p.saved };
}

function narrowWords(initialData: unknown): string[] {
  if (typeof initialData !== 'object' || initialData === null) return [];
  const words = (initialData as { words?: unknown }).words;
  if (!Array.isArray(words)) return [];
  return words.filter((w): w is string => typeof w === 'string');
}

export const sharePrefixPathProjector: ProjectorFactory = (views: ProjectorViews): ProjectorInstance => {
  const stage = views.stage as unknown as PrefixStage;

  return {
    onInit(initialData: unknown) {
      stage.init({ words: narrowWords(initialData) });
    },

    async onEvent(event: FacetRuntimeEvent): Promise<void> {
      switch (event.type) {
        case 'prefix-word-begin': {
          const p = narrowWordBegin(event.payload);
          if (p) stage.beginWord(p);
          return;
        }
        case 'prefix-ride': {
          const p = narrowRide(event.payload);
          if (p) await stage.ride(p);
          return;
        }
        case 'prefix-grow': {
          const p = narrowGrow(event.payload);
          if (p) await stage.grow(p);
          return;
        }
        case 'prefix-mark': {
          const p = narrowMark(event.payload);
          if (p) stage.markWord(p);
          return;
        }
        case 'prefix-word-end': {
          const p = narrowWordEnd(event.payload);
          if (p) stage.endWord(p);
          return;
        }
        case 'prefix-summary': {
          const p = narrowSummary(event.payload);
          if (p) stage.summarize(p);
          return;
        }
        case 'rewind': {
          stage.rewind();
          return;
        }
        default:
          // 표준 어휘 밖의 알려지지 않은 이벤트는 조용히 무시 (C2).
          return;
      }
    },
  };
};
