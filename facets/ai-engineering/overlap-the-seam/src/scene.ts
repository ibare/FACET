/**
 * 겹쳐 자르기의 장면.
 *
 * 바탕   글의 낱말 · 문장 구간 · 창 크기 · 겹침 · 두 자르기의 창 수 (init 이 한 번 정한다)
 * 자취   겹침 없이 자른 창과 그 판정, 겹쳐 자른 창과 그 창들이 온전히 담은 문장
 * 걸음   이번에 일어난 일의 종류와 인자 — 겹쳐 자른 창은 물러나기 전 자리(seam)를 싣는다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Holder, Span } from './algorithm.js';

export type OverlapTheSeamStep =
  | { kind: 'init' }
  | { kind: 'cut' }
  | { kind: 'judge' }
  | {
      kind: 'window';
      w: number;
      start: number;
      end: number;
      seam: number | null;
      gained: readonly number[];
      rescued: readonly number[];
    }
  | { kind: 'done' };

export type OverlapTheSeamScene = {
  words: readonly string[];
  sentences: readonly Span[];
  size: number;
  overlap: number;
  counts: { plain: number; over: number };
  plain: {
    windows: readonly Span[];
    /** 판정 전이면 null */
    holders: readonly Holder[] | null;
    stored: number | null;
    whole: number | null;
  };
  over: {
    windows: readonly Span[];
    /** 문장마다 온전히 담은 창. 아직 없으면 -1 */
    holders: readonly number[];
    stored: number | null;
    whole: number | null;
  };
  step: OverlapTheSeamStep | null;
};

/** payload 의 한 필드를 수로. 아니면 기본값. */
const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

const nums = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number') : [];

const spans = (v: unknown): Span[] =>
  Array.isArray(v)
    ? v.flatMap((x): Span[] =>
        Array.isArray(x) && typeof x[0] === 'number' && typeof x[1] === 'number' ? [[x[0], x[1]]] : [],
      )
    : [];

function holderOf(v: unknown): Holder {
  const h = v as { kind?: unknown; w?: unknown; a?: unknown; b?: unknown; at?: unknown } | null;
  if (h?.kind === 'split') return { kind: 'split', a: num(h.a), b: num(h.b), at: num(h.at) };
  return { kind: 'whole', w: num(h?.w) };
}

function emptyScene(): OverlapTheSeamScene {
  return {
    words: [],
    sentences: [],
    size: 0,
    overlap: 0,
    counts: { plain: 0, over: 0 },
    plain: { windows: [], holders: null, stored: null, whole: null },
    over: { windows: [], holders: [], stored: null, whole: null },
    step: null,
  };
}

const copySpans = (xs: readonly Span[]): Span[] => xs.map(([a, b]) => [a, b] as Span);

export const overlapTheSeamScene: ScenePlan<OverlapTheSeamScene> = {
  initial(): OverlapTheSeamScene {
    return emptyScene();
  },

  reduce(scene: OverlapTheSeamScene, event: FacetRuntimeEvent): OverlapTheSeamScene {
    switch (event.type) {
      case 'init': {
        const p = event.payload as {
          words?: unknown;
          sentences?: unknown;
          size?: unknown;
          overlap?: unknown;
          counts?: { plain?: unknown; over?: unknown };
        } | null;
        const words = Array.isArray(p?.words)
          ? p.words.filter((x): x is string => typeof x === 'string')
          : [];
        const sentences = spans(p?.sentences);
        return {
          ...emptyScene(),
          words,
          sentences,
          size: num(p?.size),
          overlap: num(p?.overlap),
          counts: { plain: num(p?.counts?.plain), over: num(p?.counts?.over) },
          over: {
            windows: [],
            holders: sentences.map(() => -1),
            stored: null,
            whole: null,
          },
          step: { kind: 'init' },
        };
      }
      case 'cut': {
        const p = event.payload as { windows?: unknown } | null;
        return {
          ...scene,
          plain: { ...scene.plain, windows: spans(p?.windows) },
          step: { kind: 'cut' },
        };
      }
      case 'judge': {
        const p = event.payload as { holders?: unknown; stored?: unknown; whole?: unknown } | null;
        return {
          ...scene,
          plain: {
            ...scene.plain,
            holders: Array.isArray(p?.holders) ? p.holders.map(holderOf) : [],
            stored: num(p?.stored),
            whole: num(p?.whole),
          },
          step: { kind: 'judge' },
        };
      }
      case 'window': {
        const p = event.payload as {
          w?: unknown;
          start?: unknown;
          end?: unknown;
          seam?: unknown;
          gained?: unknown;
          rescued?: unknown;
        } | null;
        const w = num(p?.w);
        const start = num(p?.start);
        const end = num(p?.end);
        const gained = nums(p?.gained);
        const holders = scene.over.holders.map((h, r) => (gained.includes(r) ? w : h));
        return {
          ...scene,
          over: {
            ...scene.over,
            windows: [...copySpans(scene.over.windows), [start, end]],
            holders,
          },
          step: {
            kind: 'window',
            w,
            start,
            end,
            seam: typeof p?.seam === 'number' ? p.seam : null,
            gained,
            rescued: nums(p?.rescued),
          },
        };
      }
      case 'done': {
        const p = event.payload as { stored?: unknown; whole?: unknown } | null;
        return {
          ...scene,
          over: { ...scene.over, stored: num(p?.stored), whole: num(p?.whole) },
          step: { kind: 'done' },
        };
      }
      default:
        return scene;
    }
  },
};
