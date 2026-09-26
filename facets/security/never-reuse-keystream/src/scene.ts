/**
 * never-reuse-keystream 의 장면.
 *
 * 바탕 — 두 평문 · 키스트림 · 짐작 (initialData 에서, 걸음 0)
 * 자취 — 잠근 암호문 둘 · 공격자의 겹침 · 짐작으로 푼 것
 * 이번 걸음 — 무엇이 막 일어났는가 (운동을 고르는 데 쓴다)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowKeystreamData, type Term } from './algorithm.js';

export type KeystreamRow = { bytes: number[]; terms: Term[] };

export type OverlayRow = KeystreamRow & { cancelled: Term[]; zeros: number[] };

export type RecoverRow = KeystreamRow & {
  guess: number[];
  cancelled: Term[];
  samePos: boolean[];
  same: number;
  total: number;
  keystreamUses: number;
};

export type KeystreamStep =
  | { kind: 'lock'; row: 'c1' | 'c2'; from: 'p1' | 'p2' }
  | { kind: 'overlay' }
  | { kind: 'recover' };

export type NeverReuseKeystreamScene = {
  base: { p1: number[]; p2: number[]; s: number[] };
  c1: KeystreamRow | null;
  c2: KeystreamRow | null;
  x: OverlayRow | null;
  r: RecoverRow | null;
  step: KeystreamStep | null;
};

function fail(path: string): never {
  throw new Error(`never-reuse-keystream scene: ${path} 의 모양이 어긋났다`);
}

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) fail('payload');
  return (payload as Record<string, unknown>)[key];
}

function bytesOf(payload: unknown, key: string, n: number): number[] {
  const value = field(payload, key);
  if (!Array.isArray(value) || value.length !== n) fail(`payload.${key}`);
  return value.map((b, i) => {
    if (typeof b !== 'number' || !Number.isInteger(b) || b < 0 || b > 255) fail(`payload.${key}[${i}]`);
    return b;
  });
}

function termsOf(payload: unknown, key: string): Term[] {
  const value = field(payload, key);
  if (!Array.isArray(value)) fail(`payload.${key}`);
  return value.map((term, i) => {
    if (term !== 'p1' && term !== 'p2' && term !== 's') fail(`payload.${key}[${i}]`);
    return term;
  });
}

function countOf(payload: unknown, key: string): number {
  const value = field(payload, key);
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) fail(`payload.${key}`);
  return value;
}

export const neverReuseKeystreamScene: ScenePlan<NeverReuseKeystreamScene> = {
  initial(initialData: unknown): NeverReuseKeystreamScene {
    const d = narrowKeystreamData(initialData);
    return {
      base: { p1: [...d.p1], p2: [...d.p2], s: [...d.s] },
      c1: null,
      c2: null,
      x: null,
      r: null,
      step: null,
    };
  },

  reduce(scene: NeverReuseKeystreamScene, event: FacetRuntimeEvent): NeverReuseKeystreamScene {
    const n = scene.base.p1.length;
    const payload = event.payload;
    switch (event.type) {
      case 'lock': {
        const row = field(payload, 'row');
        if (row !== 'c1' && row !== 'c2') fail('payload.row');
        const from = row === 'c1' ? 'p1' : 'p2';
        if (field(payload, 'from') !== from) fail('payload.from');
        if (scene[row] !== null) fail(`scene.${row} (이미 잠겼다)`);
        if (row === 'c2' && scene.c1 === null) fail('scene.c1 (c2 보다 먼저 잠겨야 한다)');
        const next: KeystreamRow = { bytes: bytesOf(payload, 'bytes', n), terms: termsOf(payload, 'terms') };
        return { ...scene, [row]: next, step: { kind: 'lock', row, from } };
      }
      case 'overlay': {
        if (scene.c1 === null || scene.c2 === null || scene.x !== null) fail('scene (겹칠 차례가 아니다)');
        const zeros = field(payload, 'zeros');
        if (!Array.isArray(zeros)) fail('payload.zeros');
        const x: OverlayRow = {
          bytes: bytesOf(payload, 'bytes', n),
          terms: termsOf(payload, 'terms'),
          cancelled: termsOf(payload, 'cancelled'),
          zeros: zeros.map((z, i) => {
            if (typeof z !== 'number' || !Number.isInteger(z) || z < 0 || z >= n) fail(`payload.zeros[${i}]`);
            return z;
          }),
        };
        return { ...scene, x, step: { kind: 'overlay' } };
      }
      case 'recover': {
        if (scene.x === null || scene.r !== null) fail('scene (풀 차례가 아니다)');
        const guess = bytesOf(payload, 'guess', n);
        const samePos = field(payload, 'samePos');
        if (!Array.isArray(samePos) || samePos.length !== n) fail('payload.samePos');
        const r: RecoverRow = {
          guess,
          bytes: bytesOf(payload, 'bytes', n),
          terms: termsOf(payload, 'terms'),
          cancelled: termsOf(payload, 'cancelled'),
          samePos: samePos.map((hit, i) => {
            if (typeof hit !== 'boolean') fail(`payload.samePos[${i}]`);
            return hit;
          }),
          same: countOf(payload, 'same'),
          total: countOf(payload, 'total'),
          keystreamUses: countOf(payload, 'keystreamUses'),
        };
        if (r.total !== n || r.same !== r.samePos.filter((hit) => hit).length) fail('payload.same · payload.total');
        return { ...scene, r, step: { kind: 'recover' } };
      }
      default:
        throw new Error(`never-reuse-keystream scene: 모르는 이벤트 ${event.type}`);
    }
  },
};
