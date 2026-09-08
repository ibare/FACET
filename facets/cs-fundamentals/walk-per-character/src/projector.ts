/**
 * walkPerCharacterProjector — algorithm 의 이벤트를 stage 메서드 호출로 번역.
 *
 * algorithm 은 문안을 보내지 않는다(C10) — 여기서 event.payload 의 원시값만
 * 읽어 `runtime.t` 로 캡션 문장을 지어 stage 에 넘긴다.
 */

import type { FacetRuntimeEvent, ProjectorFactory, ProjectorInstance, ProjectorViews, ProjectorRuntime } from '@ffacet/core/runtime';
import type { WalkPerCharacterStageInstance } from './walk-per-character-stage.js';

type SearchBeginPayload = { queryIndex: number; queryTotal: number; query: string };
type StepDownPayload = { queryIndex: number; charIndex: number; char: string; fromId: string; toId: string };
type SearchResultPayload = {
  queryIndex: number;
  query: string;
  nodeId: string;
  depth: number;
  verdict: 'found' | 'no-word' | 'blocked';
  blockedChar?: string;
};

function asSearchBegin(payload: unknown): SearchBeginPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.queryIndex !== 'number' || typeof p.queryTotal !== 'number' || typeof p.query !== 'string') return null;
  return { queryIndex: p.queryIndex, queryTotal: p.queryTotal, query: p.query };
}

function asStepDown(payload: unknown): StepDownPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.queryIndex !== 'number' ||
    typeof p.charIndex !== 'number' ||
    typeof p.char !== 'string' ||
    typeof p.fromId !== 'string' ||
    typeof p.toId !== 'string'
  ) {
    return null;
  }
  return { queryIndex: p.queryIndex, charIndex: p.charIndex, char: p.char, fromId: p.fromId, toId: p.toId };
}

function asSearchResult(payload: unknown): SearchResultPayload | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  if (
    typeof p.queryIndex !== 'number' ||
    typeof p.query !== 'string' ||
    typeof p.nodeId !== 'string' ||
    typeof p.depth !== 'number' ||
    (p.verdict !== 'found' && p.verdict !== 'no-word' && p.verdict !== 'blocked')
  ) {
    return null;
  }
  return {
    queryIndex: p.queryIndex,
    query: p.query,
    nodeId: p.nodeId,
    depth: p.depth,
    verdict: p.verdict,
    blockedChar: typeof p.blockedChar === 'string' ? p.blockedChar : undefined,
  };
}

function asWords(initialData: unknown): string[] {
  if (typeof initialData !== 'object' || initialData === null) return [];
  const words = (initialData as Record<string, unknown>).words;
  if (!Array.isArray(words)) return [];
  return words.filter((w): w is string => typeof w === 'string');
}

export const walkPerCharacterProjector: ProjectorFactory = (
  views: ProjectorViews,
  runtime?: ProjectorRuntime,
): ProjectorInstance => {
  const stage = views.stage as unknown as WalkPerCharacterStageInstance;
  const t = runtime?.t;

  function tr(key: string, fallback: string, vars?: Record<string, string | number>): string {
    return t ? t(key, fallback, vars) : fallback;
  }

  return {
    onInit(initialData: unknown) {
      stage.init(asWords(initialData));
    },

    onEvent(event: FacetRuntimeEvent): void | Promise<void> {
      switch (event.type) {
        case 'search-begin': {
          const p = asSearchBegin(event.payload);
          if (!p) return;
          const caption = tr('caption.searchBegin', 'looking for "{query}" ({i}/{n})', {
            query: p.query,
            i: p.queryIndex + 1,
            n: p.queryTotal,
          });
          stage.beginSearch(caption);
          return;
        }
        case 'step-down': {
          const p = asStepDown(event.payload);
          if (!p) return;
          const caption = tr('caption.stepDown', "follow '{char}' down one level", { char: p.char });
          return stage.stepDown(p.fromId, p.toId, caption, p.charIndex + 1);
        }
        case 'search-result': {
          const p = asSearchResult(event.payload);
          if (!p) return;
          let caption: string;
          if (p.verdict === 'found') {
            caption = tr('caption.found', '"{query}" is a stored word — found', { query: p.query });
          } else if (p.verdict === 'no-word') {
            caption = tr('caption.noWord', 'the path exists, but "{query}" isn’t a stored word', { query: p.query });
          } else {
            caption = tr('caption.blocked', "no branch for '{char}' — \"{query}\" stops here", {
              char: p.blockedChar ?? '',
              query: p.query,
            });
          }
          stage.finish(p.nodeId, p.verdict, caption, p.blockedChar);
          return;
        }
        default:
          // 표준 어휘와 겹치지 않는 확장 이벤트만 쓴다. 그 외 타입은 없다.
          return;
      }
    },
  };
};
