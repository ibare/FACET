import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * 장면 — 바탕(두 파일 · 표식)과 자취(두 눈이 걸음마다 쌓은 것), 이번 걸음(`step`).
 * 셈은 알고리즘이 했다. 장면은 이벤트가 실어 온 것을 잇기만 한다.
 */

export type ScenePair = readonly [number, number];
export type SceneMove = { readonly from: number; readonly count: number; readonly to: number };
export type SceneTry = { readonly a: number; readonly b: number; readonly crosses: readonly ScenePair[] };

export type MoveLooksLikeRewriteScene = {
  /** 바탕 */
  readonly a: readonly string[];
  readonly b: readonly string[];
  readonly marks: { readonly keep: string; readonly del: string; readonly ins: string };
  /** 자취 */
  readonly moves: readonly SceneMove[] | null;
  readonly pairs: readonly ScenePair[] | null;
  readonly tries: readonly SceneTry[] | null;
  readonly deleted: readonly number[] | null;
  readonly inserted: readonly number[] | null;
  readonly tally: { readonly moves: number; readonly deletes: number; readonly inserts: number } | null;
  /** 이번 걸음 */
  readonly step: 'start' | 'move' | 'keep' | 'cross' | 'delete' | 'insert' | 'compare';
};

function fail(where: string): never {
  throw new Error(`moveLooksLikeRewriteScene: ${where} 의 모양을 모른다`);
}

function rec(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(where);
  return v as Record<string, unknown>;
}

function int(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(where);
  return v;
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string') fail(where);
  return v;
}

function list(v: unknown, where: string): unknown[] {
  if (!Array.isArray(v)) fail(where);
  return v;
}

function pair(v: unknown, where: string): ScenePair {
  const xs = list(v, where);
  if (xs.length !== 2) fail(where);
  return [int(xs[0], `${where}[0]`), int(xs[1], `${where}[1]`)];
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  return rec(event.payload, `${event.type}.payload`);
}

export const moveLooksLikeRewriteScene: ScenePlan<MoveLooksLikeRewriteScene> = {
  initial(initialData: unknown): MoveLooksLikeRewriteScene {
    const d = rec(initialData, 'initialData');
    const marks = rec(d.marks, 'initialData.marks');
    return {
      a: list(d.a, 'initialData.a').map((l, k) => str(l, `initialData.a[${k}]`)),
      b: list(d.b, 'initialData.b').map((l, k) => str(l, `initialData.b[${k}]`)),
      marks: {
        keep: str(marks.keep, 'initialData.marks.keep'),
        del: str(marks.del, 'initialData.marks.del'),
        ins: str(marks.ins, 'initialData.marks.ins'),
      },
      moves: null,
      pairs: null,
      tries: null,
      deleted: null,
      inserted: null,
      tally: null,
      step: 'start',
    };
  },

  reduce(scene: MoveLooksLikeRewriteScene, event: FacetRuntimeEvent): MoveLooksLikeRewriteScene {
    switch (event.type) {
      case 'move': {
        const p = payloadOf(event);
        const moves = list(p.moves, 'move.payload.moves').map((m, k) => {
          const r = rec(m, `move.payload.moves[${k}]`);
          return {
            from: int(r.from, `move.payload.moves[${k}].from`),
            count: int(r.count, `move.payload.moves[${k}].count`),
            to: int(r.to, `move.payload.moves[${k}].to`),
          };
        });
        if (moves.length !== 1) fail(`move.payload.moves (길이 ${moves.length}, 이 조각은 하나만)`);
        return { ...scene, moves, step: 'move' };
      }
      case 'keep': {
        const p = payloadOf(event);
        const pairs = list(p.pairs, 'keep.payload.pairs').map((x, k) => pair(x, `keep.payload.pairs[${k}]`));
        return { ...scene, pairs, step: 'keep' };
      }
      case 'cross': {
        const p = payloadOf(event);
        const tries = list(p.tries, 'cross.payload.tries').map((x, k) => {
          const r = rec(x, `cross.payload.tries[${k}]`);
          return {
            a: int(r.a, `cross.payload.tries[${k}].a`),
            b: int(r.b, `cross.payload.tries[${k}].b`),
            crosses: list(r.crosses, `cross.payload.tries[${k}].crosses`).map((c, q) =>
              pair(c, `cross.payload.tries[${k}].crosses[${q}]`),
            ),
          };
        });
        return { ...scene, tries, step: 'cross' };
      }
      case 'delete': {
        const p = payloadOf(event);
        const deleted = list(p.lines, 'delete.payload.lines').map((x, k) => int(x, `delete.payload.lines[${k}]`));
        return { ...scene, deleted, step: 'delete' };
      }
      case 'insert': {
        const p = payloadOf(event);
        const inserted = list(p.lines, 'insert.payload.lines').map((x, k) => int(x, `insert.payload.lines[${k}]`));
        return { ...scene, inserted, step: 'insert' };
      }
      case 'compare': {
        const p = payloadOf(event);
        return {
          ...scene,
          tally: {
            moves: int(p.moves, 'compare.payload.moves'),
            deletes: int(p.deletes, 'compare.payload.deletes'),
            inserts: int(p.inserts, 'compare.payload.inserts'),
          },
          step: 'compare',
        };
      }
      default:
        throw new Error(`moveLooksLikeRewriteScene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
