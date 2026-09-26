/**
 * binds-key-to-name 장면 — 이벤트를 장면으로 잇는다.
 *
 * 바탕(base): init 이 한 번 정하는 CA 열쇠 · 이름 · 두 열쇠
 * 자취: signed(CA 가 이은 줄과 요약) · sig(서명) · certKey(인증서의 지금 열쇠) · removed(빼낸 열쇠) · check(받는 쪽의 확인)
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowBindsKeyToNameData, type PublicKey } from './algorithm.js';

export type BindsBase = {
  caN: number;
  caE: number;
  caD: number;
  subject: string;
  issuer: string;
  ownerKey: PublicKey;
  swapKey: PublicKey;
};

export type SignedLine = { segs: string[]; h: number; digest: number };

export type CheckLine = {
  segs: string[];
  same: boolean[];
  h: number;
  digest: number;
  sig: number;
  unwrapped: number;
  match: boolean;
};

export type BindsStep =
  | { kind: 'start' }
  | { kind: 'digest' }
  | { kind: 'sign' }
  | { kind: 'verify' }
  | { kind: 'swap'; from: PublicKey; to: PublicKey };

export type BindsScene = {
  base: BindsBase | null;
  signed: SignedLine | null;
  sig: number | null;
  certKey: PublicKey | null;
  removed: PublicKey | null;
  check: CheckLine | null;
  step: BindsStep;
};

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`binds-key-to-name 장면: ${path} 가 객체가 아니다`);
  }
  return v as Record<string, unknown>;
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`binds-key-to-name 장면: ${path} 가 정수가 아니다`);
  }
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') throw new Error(`binds-key-to-name 장면: ${path} 가 문자열이 아니다`);
  return v;
}

function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new Error(`binds-key-to-name 장면: ${path} 가 참거짓이 아니다`);
  return v;
}

function key(v: unknown, path: string): PublicKey {
  const r = rec(v, path);
  return { n: num(r.n, `${path}.n`), e: num(r.e, `${path}.e`) };
}

function strs(v: unknown, path: string): string[] {
  if (!Array.isArray(v) || v.length !== 4) throw new Error(`binds-key-to-name 장면: ${path} 가 토막 넷의 배열이 아니다`);
  return v.map((x, i) => str(x, `${path}[${i}]`));
}

function bools(v: unknown, path: string): boolean[] {
  if (!Array.isArray(v) || v.length !== 4) throw new Error(`binds-key-to-name 장면: ${path} 가 참거짓 넷의 배열이 아니다`);
  return v.map((x, i) => bool(x, `${path}[${i}]`));
}

function sameKey(a: PublicKey, b: PublicKey): boolean {
  return a.n === b.n && a.e === b.e;
}

function need<T>(v: T | null, what: string, type: string): T {
  if (v === null) throw new Error(`binds-key-to-name 장면: ${type} 이벤트인데 ${what} 가 아직 없다`);
  return v;
}

export const bindsKeyToNameScene: ScenePlan<BindsScene> = {
  initial(initialData: unknown): BindsScene {
    // 모양만 검사한다 — n · d · 요약은 알고리즘이 셈해 silent init 으로 싣는다
    narrowBindsKeyToNameData(initialData);
    return { base: null, signed: null, sig: null, certKey: null, removed: null, check: null, step: { kind: 'start' } };
  },

  reduce(scene: BindsScene, event: FacetRuntimeEvent): BindsScene {
    const p = event.payload;
    switch (event.type) {
      case 'init': {
        const r = rec(p, 'init.payload');
        const base: BindsBase = {
          caN: num(r.caN, 'init.payload.caN'),
          caE: num(r.caE, 'init.payload.caE'),
          caD: num(r.caD, 'init.payload.caD'),
          subject: str(r.subject, 'init.payload.subject'),
          issuer: str(r.issuer, 'init.payload.issuer'),
          ownerKey: key(r.ownerKey, 'init.payload.ownerKey'),
          swapKey: key(r.swapKey, 'init.payload.swapKey'),
        };
        return {
          base,
          signed: null,
          sig: null,
          certKey: { ...base.ownerKey },
          removed: null,
          check: null,
          step: { kind: 'start' },
        };
      }
      case 'digest': {
        need(scene.base, 'base', 'digest');
        if (scene.signed !== null) throw new Error('binds-key-to-name 장면: digest 가 두 번 왔다');
        const r = rec(p, 'digest.payload');
        const signed: SignedLine = {
          segs: strs(r.segs, 'digest.payload.segs'),
          h: num(r.h, 'digest.payload.h'),
          digest: num(r.digest, 'digest.payload.digest'),
        };
        return { ...scene, signed, step: { kind: 'digest' } };
      }
      case 'sign': {
        const signed = need(scene.signed, 'signed', 'sign');
        const r = rec(p, 'sign.payload');
        const digest = num(r.digest, 'sign.payload.digest');
        if (digest !== signed.digest) {
          throw new Error(`binds-key-to-name 장면: sign.payload.digest ${digest} 가 이은 줄의 요약 ${signed.digest} 와 다르다`);
        }
        return { ...scene, sig: num(r.sig, 'sign.payload.sig'), step: { kind: 'sign' } };
      }
      case 'verify': {
        const sig = need(scene.sig, 'sig', 'verify');
        const certKey = need(scene.certKey, 'certKey', 'verify');
        const r = rec(p, 'verify.payload');
        const check: CheckLine = {
          segs: strs(r.segs, 'verify.payload.segs'),
          same: bools(r.same, 'verify.payload.same'),
          h: num(r.h, 'verify.payload.h'),
          digest: num(r.digest, 'verify.payload.digest'),
          sig: num(r.sig, 'verify.payload.sig'),
          unwrapped: num(r.unwrapped, 'verify.payload.unwrapped'),
          match: bool(r.match, 'verify.payload.match'),
        };
        if (check.sig !== sig) throw new Error(`binds-key-to-name 장면: verify.payload.sig ${check.sig} 가 인증서의 서명 ${sig} 와 다르다`);
        if (check.segs[2] !== String(certKey.n) || check.segs[3] !== String(certKey.e)) {
          throw new Error('binds-key-to-name 장면: verify.payload.segs 의 열쇠가 인증서의 지금 열쇠와 다르다');
        }
        return { ...scene, check, step: { kind: 'verify' } };
      }
      case 'swap': {
        const certKey = need(scene.certKey, 'certKey', 'swap');
        const r = rec(p, 'swap.payload');
        const from = key(r.from, 'swap.payload.from');
        const to = key(r.to, 'swap.payload.to');
        if (!sameKey(from, certKey)) throw new Error('binds-key-to-name 장면: swap.payload.from 이 인증서의 지금 열쇠가 아니다');
        return { ...scene, certKey: { ...to }, removed: { ...from }, check: null, step: { kind: 'swap', from, to } };
      }
      default:
        throw new Error(`binds-key-to-name 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
