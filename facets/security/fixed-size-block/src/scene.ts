/**
 * fixed-size-block 의 장면.
 *
 * 바탕: 메시지 바이트 · 열쇠(initialData) 와 덩어리 크기 · 수 · 메시지 비트(init).
 * 자취: 잘린 덩어리 · 채움 · 잠긴 덩어리들.
 * 이번 걸음: `step`.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowFixedSizeBlock } from './algorithm.js';

export type FixedSizeBlockBase = {
  blockBits: number;
  blockCount: number;
  messageBits: number;
};

export type FixedSizeBlockPad = {
  block: number;
  bytes: number[];
  paddedBits: number;
};

export type FixedSizeBlockSeal = {
  block: number;
  input: number;
  output: number;
  bits: number;
};

export type FixedSizeBlockStep =
  | { kind: 'start' }
  | { kind: 'cut'; lastBits: number }
  | { kind: 'pad' }
  | { kind: 'seal'; block: number };

export type FixedSizeBlockScene = {
  bytes: number[];
  keyHex: string;
  /** init 전에는 null — 알고리즘이 셈한 바탕이 오지 않았다 */
  base: FixedSizeBlockBase | null;
  /** cut 전에는 null */
  blocks: number[][] | null;
  pad: FixedSizeBlockPad | null;
  sealed: FixedSizeBlockSeal[];
  cipherBits: number;
  step: FixedSizeBlockStep;
};

function fail(msg: string): never {
  throw new Error(`fixedSizeBlockScene: ${msg}`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function int(p: Record<string, unknown>, field: string, where: string, lo: number, hi: number): number {
  const v = p[field];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) {
    fail(`${where}.payload.${field} 가 ${lo}..${hi} 의 정수가 아니다 (${String(v)})`);
  }
  return v;
}

function byteList(v: unknown, where: string): number[] {
  if (!Array.isArray(v)) fail(`${where} 가 배열이 아니다`);
  return v.map((b, i) => {
    if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b > 255) {
      fail(`${where}[${i}] 가 바이트가 아니다 (${String(b)})`);
    }
    return b;
  });
}

function needBase(scene: FixedSizeBlockScene, where: string): FixedSizeBlockBase {
  if (scene.base === null) fail(`${where} 가 init 보다 먼저 왔다`);
  return scene.base;
}

export const fixedSizeBlockScene: ScenePlan<FixedSizeBlockScene> = {
  initial(initialData: unknown): FixedSizeBlockScene {
    const input = narrowFixedSizeBlock(initialData);
    return {
      bytes: [...input.bytes],
      keyHex: input.keyHex,
      base: null,
      blocks: null,
      pad: null,
      sealed: [],
      cipherBits: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: FixedSizeBlockScene, event: FacetRuntimeEvent): FixedSizeBlockScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const blockBits = int(p, 'blockBits', 'init', 8, 128);
        const blockCount = int(p, 'blockCount', 'init', 1, 64);
        const messageBits = int(p, 'messageBits', 'init', 8, 8 * 1024);
        if (messageBits !== scene.bytes.length * 8) {
          fail(`init.payload.messageBits ${messageBits} 가 메시지 바이트 ${scene.bytes.length} 와 맞지 않다`);
        }
        return {
          ...scene,
          base: { blockBits, blockCount, messageBits },
          blocks: null,
          pad: null,
          sealed: [],
          cipherBits: 0,
          step: { kind: 'start' },
        };
      }
      case 'cut': {
        const base = needBase(scene, 'cut');
        const p = payloadOf(event);
        if (!Array.isArray(p.blocks)) fail('cut.payload.blocks 가 배열이 아니다');
        const blocks = p.blocks.map((b, i) => byteList(b, `cut.payload.blocks[${i}]`));
        const flat = blocks.flat();
        if (flat.length !== scene.bytes.length || flat.some((b, i) => b !== scene.bytes[i])) {
          fail('cut.payload.blocks 를 이으면 메시지 바이트가 되지 않는다');
        }
        if (blocks.some((b) => b.length === 0 || b.length * 8 > base.blockBits)) {
          fail('cut.payload.blocks 에 덩어리 크기를 넘거나 빈 덩어리가 있다');
        }
        const lastBits = int(p, 'lastBits', 'cut', 8, base.blockBits);
        if (lastBits !== blocks[blocks.length - 1]!.length * 8) {
          fail('cut.payload.lastBits 가 끝 덩어리와 맞지 않다');
        }
        return { ...scene, blocks, step: { kind: 'cut', lastBits } };
      }
      case 'pad': {
        const base = needBase(scene, 'pad');
        if (scene.blocks === null) fail('pad 가 cut 보다 먼저 왔다');
        const p = payloadOf(event);
        const block = int(p, 'block', 'pad', 0, base.blockCount - 1);
        const bytes = byteList(p.bytes, 'pad.payload.bytes');
        const paddedBits = int(p, 'paddedBits', 'pad', 8, 8 * 1024);
        const have = block < scene.blocks.length ? scene.blocks[block]!.length : 0;
        if ((have + bytes.length) * 8 !== base.blockBits) {
          fail(`pad.payload 가 덩어리 ${block} 를 ${base.blockBits} 비트로 채우지 않는다`);
        }
        return { ...scene, pad: { block, bytes, paddedBits }, step: { kind: 'pad' } };
      }
      case 'seal': {
        const base = needBase(scene, 'seal');
        if (scene.pad === null) fail('seal 이 pad 보다 먼저 왔다');
        const p = payloadOf(event);
        const block = int(p, 'block', 'seal', 0, base.blockCount - 1);
        if (block !== scene.sealed.length) {
          fail(`seal.payload.block ${block} 가 다음 차례 ${scene.sealed.length} 가 아니다`);
        }
        const input = int(p, 'input', 'seal', 0, 0xffff);
        const output = int(p, 'output', 'seal', 0, 0xffff);
        const bits = int(p, 'bits', 'seal', 8, 128);
        const cipherBits = int(p, 'cipherBits', 'seal', 8, 8 * 1024);
        return {
          ...scene,
          sealed: [...scene.sealed, { block, input, output, bits }],
          cipherBits,
          step: { kind: 'seal', block },
        };
      }
      default:
        fail(`모르는 이벤트 '${event.type}'`);
    }
  },
};
