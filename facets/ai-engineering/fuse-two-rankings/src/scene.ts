/**
 * fuse-two-rankings 의 장면.
 *
 * 바탕  — init 이 한 번 정한다: 질의 · 문서 · 두 등수 · k
 * 자취  — 떨어져 제 문서에 쌓인 몫들(도착 순서), 그리고 다시 선 줄
 * 이번 걸음 — step
 *
 * 좌표 · 문안 · DOM 은 담지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export interface FuseBase {
  query: string;
  k: number;
  docs: { id: string; title: string }[];
  lists: { id: string; ranking: string[] }[];
}

/** 떨어져 나와 문서로 간 몫 하나. 값은 1/den. */
export interface FuseShare {
  list: number;
  rank: number;
  doc: string;
  den: number;
}

/** 다시 선 줄의 한 자리. 합 = num/den (기약). */
export interface FusedEntry {
  doc: string;
  num: number;
  den: number;
}

export type FuseStep =
  | { kind: 'init' }
  | { kind: 'drop'; rank: number; k: number; den: number }
  | { kind: 'fuse'; top: string; places: number[]; firstInNone: boolean };

export interface FuseTwoRankingsScene {
  base: FuseBase | null;
  shares: FuseShare[];
  fused: FusedEntry[] | null;
  step: FuseStep | null;
}

function rec(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
}
function arr(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export const fuseTwoRankingsScene: ScenePlan<FuseTwoRankingsScene> = {
  initial() {
    return { base: null, shares: [], fused: null, step: null };
  },

  reduce(scene, event: FacetRuntimeEvent) {
    const p = rec(event.payload);
    switch (event.type) {
      case 'init':
        return {
          base: {
            query: str(p.query),
            k: num(p.k),
            docs: arr(p.docs).map((d) => ({ id: str(rec(d).id), title: str(rec(d).title) })),
            lists: arr(p.lists).map((l) => ({
              id: str(rec(l).id),
              ranking: arr(rec(l).ranking).map(str),
            })),
          },
          shares: [],
          fused: null,
          step: { kind: 'init' },
        };
      case 'drop': {
        const rank = num(p.rank);
        const k = num(p.k);
        const added = arr(p.shares).map((s) => ({
          list: num(rec(s).list),
          rank,
          doc: str(rec(s).doc),
          den: num(rec(s).den),
        }));
        return {
          ...scene,
          shares: [...scene.shares, ...added],
          step: { kind: 'drop', rank, k, den: added[0]?.den ?? k + rank },
        };
      }
      case 'fuse':
        return {
          ...scene,
          fused: arr(p.order).map((o) => ({
            doc: str(rec(o).doc),
            num: num(rec(o).num),
            den: num(rec(o).den) || 1,
          })),
          step: {
            kind: 'fuse',
            top: str(p.top),
            places: arr(p.places).map(num),
            firstInNone: p.firstInNone === true,
          },
        };
      default:
        return { ...scene };
    }
  },
};
