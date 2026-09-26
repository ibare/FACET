/**
 * iv-makes-different 의 장면.
 *
 * 바탕(base) — init 이 한 번 정한다: 열쇠 · 평문 덩어리 · 두 IV 와 그 차이.
 * 자취(done) — 덩어리마다 두 쪽의 암호문과 다른 비트 수가 쌓인다.
 * 이번 걸음(step) — 처음인가, 몇 번째 덩어리를 잠갔는가 (누계를 함께).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowIvMakesDifferentData } from './algorithm.js';

export type IvBase = {
  key: number;
  blocks: number[];
  chars: string[];
  ivA: number;
  ivB: number;
  ivMask: number;
  ivDiff: number;
  width: number;
};

export type IvPair = { a: number; b: number; mask: number; diff: number };

export type IvStep =
  | { kind: 'start' }
  | { kind: 'block'; index: number; diffBlocks: number; sumBits: number };

export type IvMakesDifferentScene = {
  base: IvBase | null;
  done: IvPair[];
  step: IvStep | null;
};

function field(p: Record<string, unknown>, name: string, ev: string): number {
  const v = p[name];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`iv-makes-different scene: ${ev}.payload.${name} 가 0 이상의 정수가 아니다`);
  }
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) throw new Error(`iv-makes-different scene: ${event.type}.payload 가 없다`);
  return p as Record<string, unknown>;
}

function intArray(v: unknown, path: string, max: number): number[] {
  if (!Array.isArray(v)) throw new Error(`iv-makes-different scene: ${path} 가 배열이 아니다`);
  return v.map((x: unknown, i: number) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x > max) {
      throw new Error(`iv-makes-different scene: ${path}[${i}] 가 범위 밖이다`);
    }
    return x;
  });
}

export const ivMakesDifferentScene: ScenePlan<IvMakesDifferentScene> = {
  initial(initialData: unknown): IvMakesDifferentScene {
    // 모양만 확인한다 — 덩어리 · 차이는 알고리즘이 셈해 silent init 으로 싣는다
    narrowIvMakesDifferentData(initialData);
    return { base: null, done: [], step: null };
  },

  reduce(scene: IvMakesDifferentScene, event: FacetRuntimeEvent): IvMakesDifferentScene {
    switch (event.type) {
      case 'init': {
        if (scene.base !== null) throw new Error('iv-makes-different scene: init 이 두 번 왔다');
        const p = payloadOf(event);
        const width = field(p, 'width', 'init');
        const max = 2 ** width - 1;
        const blocks = intArray(p.blocks, 'init.payload.blocks', max);
        if (!Array.isArray(p.chars) || p.chars.length !== blocks.length) {
          throw new Error('iv-makes-different scene: init.payload.chars 의 길이가 덩어리 수와 다르다');
        }
        const chars = p.chars.map((c: unknown, i: number) => {
          if (typeof c !== 'string' || c.length !== 2) throw new Error(`iv-makes-different scene: init.payload.chars[${i}] 가 두 글자가 아니다`);
          return c;
        });
        const ivA = field(p, 'ivA', 'init');
        const ivB = field(p, 'ivB', 'init');
        if (ivA > max || ivB > max) throw new Error('iv-makes-different scene: init.payload 의 IV 가 덩어리 폭을 넘는다');
        const ivMask = field(p, 'ivMask', 'init');
        if (ivMask !== (ivA ^ ivB)) throw new Error('iv-makes-different scene: init.payload.ivMask 가 두 IV 와 맞지 않는다');
        const ivDiff = field(p, 'ivDiff', 'init');
        if (ivDiff > width) throw new Error('iv-makes-different scene: init.payload.ivDiff 가 폭을 넘는다');
        return {
          base: { key: field(p, 'key', 'init'), blocks, chars, ivA, ivB, ivMask, ivDiff, width },
          done: [],
          step: { kind: 'start' },
        };
      }
      case 'block': {
        const base = scene.base;
        if (base === null) throw new Error('iv-makes-different scene: init 전에 block 이 왔다');
        const p = payloadOf(event);
        const index = field(p, 'index', 'block');
        if (index !== scene.done.length + 1 || index > base.blocks.length) {
          throw new Error(`iv-makes-different scene: block.payload.index ${index} 가 차례(${scene.done.length + 1})와 어긋난다`);
        }
        const max = 2 ** base.width - 1;
        const a = field(p, 'a', 'block');
        const b = field(p, 'b', 'block');
        if (a > max || b > max) throw new Error('iv-makes-different scene: block.payload 의 암호문이 덩어리 폭을 넘는다');
        const mask = field(p, 'mask', 'block');
        if (mask !== (a ^ b)) throw new Error('iv-makes-different scene: block.payload.mask 가 두 암호문과 맞지 않는다');
        const diff = field(p, 'diff', 'block');
        if (diff > base.width) throw new Error('iv-makes-different scene: block.payload.diff 가 폭을 넘는다');
        const diffBlocks = field(p, 'diffBlocks', 'block');
        const sumBits = field(p, 'sumBits', 'block');
        return {
          base,
          done: [...scene.done, { a, b, mask, diff }],
          step: { kind: 'block', index, diffBlocks, sumBits },
        };
      }
      default:
        throw new Error(`iv-makes-different scene: 모르는 이벤트 ${event.type}`);
    }
  },
};
