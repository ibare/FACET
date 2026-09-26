/**
 * compress-block-by-block 의 장면.
 *
 * 바탕 — 메시지(자료) · 메시지 바이트 · 상태 폭 · 덩어리 폭 · 채운 전체 바이트 수 (silent init 이 정한다)
 *        · 자른 결과(채운 바이트 · 패딩 구성 · 덩어리 값) (cut 이 정한다)
 * 자취 — 접은 덩어리 수 · 지금 상태
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowCompressData } from './algorithm.js';

export type CutBase = {
  padded: number[];
  messageLength: number;
  zeroCount: number;
  lengthBits: number;
  blocks: number[];
};

export type CompressStep =
  | { kind: 'start' }
  | { kind: 'cut' }
  | { kind: 'fold'; index: number; block: number; from: number; to: number };

export type CompressScene = {
  message: string;
  /** silent init 이 채운다. 없으면 아직 그릴 것이 없다 */
  bytes: number[] | null;
  stateBits: number | null;
  blockBytes: number | null;
  paddedLength: number | null;
  /** cut 뒤에만 */
  cut: CutBase | null;
  /** 접은 덩어리 수 */
  folded: number;
  /** 지금 상태 */
  state: number | null;
  step: CompressStep;
};

function fail(path: string, why: string): never {
  throw new Error(`compressBlockByBlockScene: ${path} ${why}`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload`, '가 객체가 아니다');
  return p as Record<string, unknown>;
}

function intField(p: Record<string, unknown>, path: string, key: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(`${path}.${key}`, '가 0 이상의 정수가 아니다');
  return v;
}

function byteArray(p: Record<string, unknown>, path: string, key: string, max: number): number[] {
  const v = p[key];
  if (!Array.isArray(v)) fail(`${path}.${key}`, '가 배열이 아니다');
  return v.map((x: unknown, i: number) => {
    if (typeof x !== 'number' || !Number.isInteger(x) || x < 0 || x > max) {
      fail(`${path}.${key}[${i}]`, `가 0..${max} 정수가 아니다`);
    }
    return x;
  });
}

export const compressBlockByBlockScene: ScenePlan<CompressScene> = {
  initial(initialData: unknown): CompressScene {
    const data = narrowCompressData(initialData);
    return {
      message: data.message,
      bytes: null,
      stateBits: null,
      blockBytes: null,
      paddedLength: null,
      cut: null,
      folded: 0,
      state: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: CompressScene, event: FacetRuntimeEvent): CompressScene {
    switch (event.type) {
      case 'init': {
        const p = payloadOf(event);
        const bytes = byteArray(p, 'init', 'bytes', 0xff);
        if (bytes.length !== scene.message.length) fail('init.bytes', '의 길이가 메시지와 다르다');
        const stateBits = intField(p, 'init', 'stateBits');
        const state = intField(p, 'init', 'state');
        if (state >= 2 ** stateBits) fail('init.state', '가 상태 폭을 넘는다');
        return {
          message: scene.message,
          bytes,
          stateBits,
          blockBytes: intField(p, 'init', 'blockBytes'),
          paddedLength: intField(p, 'init', 'paddedLength'),
          cut: null,
          folded: 0,
          state,
          step: { kind: 'start' },
        };
      }
      case 'cut': {
        if (scene.bytes === null || scene.blockBytes === null) fail('cut', '이 init 보다 먼저 왔다');
        if (scene.cut !== null) fail('cut', '이 두 번 왔다');
        const p = payloadOf(event);
        const padded = byteArray(p, 'cut', 'padded', 0xff);
        const messageLength = intField(p, 'cut', 'messageLength');
        if (messageLength !== scene.bytes.length) fail('cut.messageLength', '가 메시지 바이트 수와 다르다');
        if (padded.length !== scene.paddedLength) fail('cut.padded', '의 길이가 init.paddedLength 와 다르다');
        for (let i = 0; i < messageLength; i += 1) {
          if (padded[i] !== scene.bytes[i]) fail(`cut.padded[${i}]`, '가 메시지 바이트와 다르다');
        }
        const zeroCount = intField(p, 'cut', 'zeroCount');
        if (messageLength + 1 + zeroCount + 2 !== padded.length) fail('cut.zeroCount', '가 채운 길이와 맞지 않는다');
        const blocks = byteArray(p, 'cut', 'blocks', 0xffff);
        if (blocks.length * scene.blockBytes !== padded.length) fail('cut.blocks', '의 수가 채운 바이트와 맞지 않는다');
        return {
          ...scene,
          bytes: [...scene.bytes],
          cut: { padded, messageLength, zeroCount, lengthBits: intField(p, 'cut', 'lengthBits'), blocks },
          step: { kind: 'cut' },
        };
      }
      case 'fold': {
        if (scene.cut === null || scene.state === null || scene.bytes === null) fail('fold', '이 cut 보다 먼저 왔다');
        const p = payloadOf(event);
        const index = intField(p, 'fold', 'index');
        if (index !== scene.folded) fail('fold.index', `가 다음 덩어리(${scene.folded})가 아니다`);
        const block = intField(p, 'fold', 'block');
        if (scene.cut.blocks[index] !== block) fail('fold.block', '가 바탕의 덩어리와 다르다');
        const from = intField(p, 'fold', 'from');
        if (from !== scene.state) fail('fold.from', '이 지금 상태와 다르다');
        const to = intField(p, 'fold', 'to');
        if (scene.stateBits === null || to >= 2 ** scene.stateBits) fail('fold.to', '가 상태 폭을 넘는다');
        const remaining = intField(p, 'fold', 'remaining');
        if (remaining !== scene.cut.blocks.length - index - 1) fail('fold.remaining', '가 남은 덩어리 수와 다르다');
        return {
          ...scene,
          bytes: [...scene.bytes],
          cut: {
            ...scene.cut,
            padded: [...scene.cut.padded],
            blocks: [...scene.cut.blocks],
          },
          folded: index + 1,
          state: to,
          step: { kind: 'fold', index, block, from, to },
        };
      }
      default:
        throw new Error(`compressBlockByBlockScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
