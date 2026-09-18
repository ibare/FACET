/**
 * 자르는 자리 — 장면.
 *
 * 바탕: 낱말 · 문장 · 문단 수 · 고정 길이 (`init` 이 한 번 정한다)
 * 자취: 지금 칼자리들(`cuts`)과, 고정 자르기가 남긴 칼자리(`fixed` — 옮겨 간 뒤에도 남는다)
 * 이번 걸음: `step` — 무엇이 일어났는지와 그 계기값(`from`)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 칼자리 하나 — 앞 `at` 낱말 뒤. `torn` 은 그것이 가른 문장 번호(0 기준). */
export type Cut = { at: number; torn: number | null };

export type WhereToCutStep =
  | { kind: 'init' }
  | { kind: 'cut'; at: number; torn: number | null }
  | { kind: 'move'; from: number; to: number; rejoined: number | null; torn: number | null }
  | { kind: 'done'; chunks: number; fixedTorn: number; paragraphTorn: number; sentences: number };

export type WhereToCutScene = {
  words: string[];
  sentences: Array<[number, number]>;
  paragraphs: number;
  size: number;
  /** 지금 칼자리들. 늘 at 오름차순. */
  cuts: Cut[];
  /** 고정 자르기의 칼자리. 문단 자르기로 옮겨 간 뒤에도 견줌을 위해 남는다. */
  fixed: Cut[];
  /** 문단 자르기로 넘어갔는가. */
  byParagraph: boolean;
  /** 다 셈했는가 — 문단 쪽 합계를 보일지. */
  finished: boolean;
  step: WhereToCutStep | null;
};

function emptyScene(): WhereToCutScene {
  return {
    words: [],
    sentences: [],
    paragraphs: 0,
    size: 0,
    cuts: [],
    fixed: [],
    byParagraph: false,
    finished: false,
    step: null,
  };
}

function asNumber(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function asIndex(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function sortCuts(cuts: Cut[]): Cut[] {
  return [...cuts].sort((a, b) => a.at - b.at);
}

export const whereToCutScene: ScenePlan<WhereToCutScene> = {
  initial() {
    return emptyScene();
  },
  reduce(scene, event: FacetRuntimeEvent) {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    switch (event.type) {
      case 'init': {
        const words = Array.isArray(p.words) ? p.words.map((w) => String(w)) : [];
        const sentences: Array<[number, number]> = Array.isArray(p.sentences)
          ? p.sentences.map((s) => {
              const pair = Array.isArray(s) ? s : [];
              return [asNumber(pair[0]), asNumber(pair[1])] as [number, number];
            })
          : [];
        return {
          ...emptyScene(),
          words,
          sentences,
          paragraphs: asNumber(p.paragraphs),
          size: asNumber(p.size),
          step: { kind: 'init' },
        };
      }
      case 'cut': {
        const cut: Cut = { at: asNumber(p.at), torn: asIndex(p.torn) };
        return {
          ...scene,
          cuts: sortCuts([...scene.cuts, cut]),
          fixed: sortCuts([...scene.fixed, cut]),
          step: { kind: 'cut', at: cut.at, torn: cut.torn },
        };
      }
      case 'move': {
        const from = asNumber(p.from);
        const to = asNumber(p.to);
        const torn = asIndex(p.torn);
        const cuts = sortCuts(
          scene.cuts.map((c) => (c.at === from ? { at: to, torn } : { ...c })),
        );
        return {
          ...scene,
          cuts,
          fixed: scene.fixed.map((c) => ({ ...c })),
          byParagraph: true,
          step: { kind: 'move', from, to, rejoined: asIndex(p.rejoined), torn },
        };
      }
      case 'done':
        return {
          ...scene,
          cuts: scene.cuts.map((c) => ({ ...c })),
          fixed: scene.fixed.map((c) => ({ ...c })),
          finished: true,
          step: {
            kind: 'done',
            chunks: asNumber(p.chunks),
            fixedTorn: asNumber(p.fixedTorn),
            paragraphTorn: asNumber(p.paragraphTorn),
            sentences: asNumber(p.sentences),
          },
        };
      default:
        return scene;
    }
  },
};
