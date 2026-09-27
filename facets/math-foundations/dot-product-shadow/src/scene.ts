/**
 * dot-product-shadow 장면.
 *
 * 바탕 — b 와 |b|, 틀의 크기(extent), 기호. init 이 한 번 정한다.
 * 자취 — 지나간 걸음의 그림자들 (b 의 줄 위 눈금으로 남는다).
 * 이번 걸음 — 무엇이 돌았는지. 도는 운동의 출발값(from)을 싣는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  SHADOW_CHANGES,
  narrowDotProductShadowData,
  type Reading,
  type ShadowChange,
  type Vec2,
} from './algorithm.js';

export type DotProductShadowBase = {
  symbols: { a: string; b: string };
  b: Vec2;
  bLen: number;
  extent: number;
};

export type DotProductShadowStep =
  | { kind: 'start' }
  | { kind: 'turn'; index: number; from: Vec2; fromShadow: number; change: ShadowChange };

export type DotProductShadowScene = {
  base: DotProductShadowBase | null;
  current: Reading | null;
  /** 지나간 걸음의 그림자 (지금 걸음은 빼고). */
  trail: readonly number[];
  step: DotProductShadowStep | null;
};

function fail(path: string, why: string): never {
  throw new Error(`dot-product-shadow scene: ${path} — ${why}`);
}

function field(obj: unknown, key: string, path: string): unknown {
  if (typeof obj !== 'object' || obj === null) fail(path, '객체가 아니다');
  return (obj as Record<string, unknown>)[key];
}

function num(obj: unknown, key: string, path: string): number {
  const v = field(obj, key, path);
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${path}.${key}`, '유한한 수가 아니다');
  return v;
}

function str(obj: unknown, key: string, path: string): string {
  const v = field(obj, key, path);
  if (typeof v !== 'string' || v === '') fail(`${path}.${key}`, '빈 글자다');
  return v;
}

function vec(obj: unknown, key: string, path: string): Vec2 {
  const v = field(obj, key, path);
  if (!Array.isArray(v) || v.length !== 2) fail(`${path}.${key}`, '숫자 둘이 아니다');
  const [x, y] = v as unknown[];
  if (typeof x !== 'number' || typeof y !== 'number') fail(`${path}.${key}`, '숫자 둘이 아니다');
  return [x, y];
}

function change(obj: unknown, path: string): ShadowChange {
  const v = field(obj, 'change', path);
  const hit = SHADOW_CHANGES.find((c) => c === v);
  if (hit === undefined) fail(`${path}.change`, `모르는 갈래 '${String(v)}'`);
  return hit;
}

function reading(obj: unknown, path: string): Reading {
  const r = field(obj, 'reading', path);
  const p = `${path}.reading`;
  return {
    a: vec(r, 'a', p),
    aLen: num(r, 'aLen', p),
    sep: num(r, 'sep', p),
    shadow: num(r, 'shadow', p),
    dot: num(r, 'dot', p),
    product: num(r, 'product', p),
  };
}

export const dotProductShadowScene: ScenePlan<DotProductShadowScene> = {
  initial(initialData: unknown): DotProductShadowScene {
    // 모양만 확인한다. 셈한 값(길이 · 사이각 · 그림자)은 silent init 이 채운다.
    narrowDotProductShadowData(initialData);
    return { base: null, current: null, trail: [], step: null };
  },

  reduce(scene: DotProductShadowScene, event: FacetRuntimeEvent): DotProductShadowScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        const symbols = field(p, 'symbols', 'init.payload');
        return {
          base: {
            symbols: {
              a: str(symbols, 'a', 'init.payload.symbols'),
              b: str(symbols, 'b', 'init.payload.symbols'),
            },
            b: vec(p, 'b', 'init.payload'),
            bLen: num(p, 'bLen', 'init.payload'),
            extent: num(p, 'extent', 'init.payload'),
          },
          current: reading(p, 'init.payload'),
          trail: [],
          step: { kind: 'start' },
        };
      }
      case 'turn': {
        if (scene.base === null || scene.current === null) {
          fail('turn', 'init 보다 먼저 왔다');
        }
        const from = vec(p, 'from', 'turn.payload');
        const now = scene.current.a;
        if (from[0] !== now[0] || from[1] !== now[1]) {
          fail('turn.payload.from', `지금 a (${now[0]}, ${now[1]}) 와 다르다`);
        }
        return {
          base: scene.base,
          current: reading(p, 'turn.payload'),
          trail: [...scene.trail, scene.current.shadow],
          step: {
            kind: 'turn',
            index: num(p, 'index', 'turn.payload'),
            from,
            fromShadow: scene.current.shadow,
            change: change(p, 'turn.payload'),
          },
        };
      }
      default:
        throw new Error(`dot-product-shadow scene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
