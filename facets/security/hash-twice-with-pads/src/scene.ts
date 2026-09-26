/**
 * hash-twice-with-pads 의 장면.
 *
 * 바탕 — K · ipad · opad · 메시지 (initialData 에서 베낀다).
 * 자취 — 안쪽 열쇠 · 안쪽 값 · 바깥 열쇠 · 옮겨 갔는가 · HMAC. 걸음마다 한 칸씩 찬다.
 * 이번 걸음 — `step.kind` 로 무엇이 흐를지 고른다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { messageBytes, narrowHashTwiceData } from './algorithm.js';

export type HashTwiceStep =
  | { kind: 'start' }
  | { kind: 'xor-inner' }
  | { kind: 'fold-inner' }
  | { kind: 'xor-outer' }
  | { kind: 'carry' }
  | { kind: 'fold-outer' };

export type HashTwiceScene = {
  base: {
    key: number;
    ipad: number;
    opad: number;
    message: string;
    messageBytes: number[];
  };
  innerKey: number | null;
  innerValue: number | null;
  outerKey: number | null;
  /** 바깥 입력 바이트 — 옮겨 간 뒤에 찬다 */
  outerInput: number[] | null;
  hmac: number | null;
  step: HashTwiceStep;
};

function fail(msg: string): never {
  throw new Error(`hashTwiceWithPadsScene: ${msg}`);
}

function readObject(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type}.payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function readWord(p: Record<string, unknown>, type: string, field: string): number {
  const v = p[field];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 0xffff) {
    fail(`${type}.payload.${field} 가 16 비트 정수가 아니다`);
  }
  return v;
}

function readBytes(p: Record<string, unknown>, type: string, field: string): number[] {
  const v = p[field];
  if (!Array.isArray(v)) fail(`${type}.payload.${field} 가 배열이 아니다`);
  return v.map((b: unknown, i: number) => {
    if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b > 0xff) {
      fail(`${type}.payload.${field}[${i}] 가 바이트가 아니다`);
    }
    return b;
  });
}

function sameBytes(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

export const hashTwiceWithPadsScene: ScenePlan<HashTwiceScene> = {
  initial(initialData: unknown): HashTwiceScene {
    const d = narrowHashTwiceData(initialData);
    return {
      base: {
        key: d.key,
        ipad: d.ipad,
        opad: d.opad,
        message: d.message,
        messageBytes: messageBytes(d.message),
      },
      innerKey: null,
      innerValue: null,
      outerKey: null,
      outerInput: null,
      hmac: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: HashTwiceScene, event: FacetRuntimeEvent): HashTwiceScene {
    switch (event.type) {
      case 'xor-inner': {
        const p = readObject(event);
        const key = readWord(p, event.type, 'key');
        const pad = readWord(p, event.type, 'pad');
        if (key !== scene.base.key) fail('xor-inner.payload.key 가 바탕의 K 와 다르다');
        if (pad !== scene.base.ipad) fail('xor-inner.payload.pad 가 바탕의 ipad 와 다르다');
        if (scene.innerKey !== null) fail('xor-inner 가 두 번 왔다');
        return { ...scene, innerKey: readWord(p, event.type, 'result'), step: { kind: 'xor-inner' } };
      }
      case 'fold-inner': {
        const p = readObject(event);
        if (scene.innerKey === null) fail('fold-inner 가 안쪽 열쇠보다 먼저 왔다');
        const input = readBytes(p, event.type, 'input');
        const expect = [(scene.innerKey >>> 8) & 0xff, scene.innerKey & 0xff, ...scene.base.messageBytes];
        if (!sameBytes(input, expect)) fail('fold-inner.payload.input 이 안쪽 열쇠 ‖ 메시지와 다르다');
        return { ...scene, innerValue: readWord(p, event.type, 'result'), step: { kind: 'fold-inner' } };
      }
      case 'xor-outer': {
        const p = readObject(event);
        const key = readWord(p, event.type, 'key');
        const pad = readWord(p, event.type, 'pad');
        if (key !== scene.base.key) fail('xor-outer.payload.key 가 바탕의 K 와 다르다');
        if (pad !== scene.base.opad) fail('xor-outer.payload.pad 가 바탕의 opad 와 다르다');
        if (scene.outerKey !== null) fail('xor-outer 가 두 번 왔다');
        return { ...scene, outerKey: readWord(p, event.type, 'result'), step: { kind: 'xor-outer' } };
      }
      case 'carry': {
        const p = readObject(event);
        const value = readWord(p, event.type, 'value');
        if (scene.innerValue === null || value !== scene.innerValue) fail('carry.payload.value 가 지금의 안쪽 값과 다르다');
        if (scene.outerKey === null) fail('carry 가 바깥 열쇠보다 먼저 왔다');
        const input = readBytes(p, event.type, 'input');
        const expect = [
          (scene.outerKey >>> 8) & 0xff,
          scene.outerKey & 0xff,
          (value >>> 8) & 0xff,
          value & 0xff,
        ];
        if (!sameBytes(input, expect)) fail('carry.payload.input 이 바깥 열쇠 ‖ 안쪽 값과 다르다');
        return { ...scene, outerInput: input, step: { kind: 'carry' } };
      }
      case 'fold-outer': {
        const p = readObject(event);
        if (scene.outerInput === null) fail('fold-outer 가 옮겨 가기보다 먼저 왔다');
        const input = readBytes(p, event.type, 'input');
        if (!sameBytes(input, scene.outerInput)) fail('fold-outer.payload.input 이 바깥 입력과 다르다');
        return { ...scene, hmac: readWord(p, event.type, 'result'), step: { kind: 'fold-outer' } };
      }
      default:
        return fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
