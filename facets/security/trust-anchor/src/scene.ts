/**
 * trust-anchor 장면.
 *
 * 바탕: 건너온 인증서(이름 · 발급자) — initialData 에서.
 *       열쇠와 제 서명 · 저장소 항목의 열쇠 — 알고리즘이 셈해 silent init 으로.
 * 자취: 제 서명을 푼 결과(checks) · 저장소와 견준 판정(verdicts).
 * 이번 걸음: step.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { asRootId, narrowTrustAnchorData, type RootId } from './algorithm.js';

export type RootCard = { id: RootId; subject: string; issuer: string };
export type RootKey = { id: RootId; n: number; e: number; sig: number };
export type StoreKey = { subject: string; n: number; e: number };
export type SelfCheck = { root: RootId; digest: number; recovered: number; holds: boolean };
export type Verdict = { root: RootId; storeN: number; storeE: number; trusted: boolean };

export type TrustStep =
  | { kind: 'start' }
  | { kind: 'selfSig'; root: RootId }
  | { kind: 'storeCheck'; root: RootId };

export type TrustAnchorScene = {
  cards: RootCard[];
  base: { keys: RootKey[]; store: StoreKey[] } | null;
  checks: SelfCheck[];
  verdicts: Verdict[];
  step: TrustStep;
};

function fail(path: string, why: string): never {
  throw new Error(`trustAnchorScene: ${path} — ${why}`);
}

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, '객체가 아니다');
  return v as Record<string, unknown>;
}

function int(o: Record<string, unknown>, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${path}.${key}`, '정수가 아니다');
  return v;
}

function bool(o: Record<string, unknown>, key: string, path: string): boolean {
  const v = o[key];
  if (typeof v !== 'boolean') fail(`${path}.${key}`, '참거짓이 아니다');
  return v;
}

function text(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== 'string' || v.length === 0) fail(`${path}.${key}`, '글자가 아니다');
  return v;
}

function list(o: Record<string, unknown>, key: string, path: string): unknown[] {
  const v = o[key];
  if (!Array.isArray(v)) fail(`${path}.${key}`, '배열이 아니다');
  return v;
}

function knownRoot(scene: TrustAnchorScene, v: unknown, path: string): RootId {
  const id = asRootId(v, path);
  if (!scene.cards.some((c) => c.id === id)) fail(path, `건너온 뿌리에 없다: ${id}`);
  return id;
}

function reduceInit(scene: TrustAnchorScene, payload: unknown): TrustAnchorScene {
  if (scene.base !== null) fail('init', '바탕이 이미 섰다');
  const p = rec(payload, 'init.payload');
  const keys = list(p, 'keys', 'init.payload').map((k, i): RootKey => {
    const path = `init.payload.keys[${i}]`;
    const ko = rec(k, path);
    const id = knownRoot(scene, ko['id'], `${path}.id`);
    const card = scene.cards[i];
    if (!card || card.id !== id) fail(`${path}.id`, '건너온 뿌리의 차례와 어긋난다');
    return { id, n: int(ko, 'n', path), e: int(ko, 'e', path), sig: int(ko, 'sig', path) };
  });
  if (keys.length !== scene.cards.length) fail('init.payload.keys', '건너온 뿌리 수와 다르다');
  const store = list(p, 'store', 'init.payload').map((s, i): StoreKey => {
    const path = `init.payload.store[${i}]`;
    const so = rec(s, path);
    return { subject: text(so, 'subject', path), n: int(so, 'n', path), e: int(so, 'e', path) };
  });
  if (store.length === 0) fail('init.payload.store', '비었다');
  return { ...scene, base: { keys, store }, step: { kind: 'start' } };
}

function reduceSelfSig(scene: TrustAnchorScene, payload: unknown): TrustAnchorScene {
  if (scene.base === null) fail('selfSig', '바탕이 아직 없다');
  const p = rec(payload, 'selfSig.payload');
  const root = knownRoot(scene, p['root'], 'selfSig.payload.root');
  if (scene.checks.some((c) => c.root === root)) fail('selfSig.payload.root', `이미 푼 뿌리 ${root}`);
  const digest = int(p, 'digest', 'selfSig.payload');
  const recovered = int(p, 'recovered', 'selfSig.payload');
  const holds = bool(p, 'holds', 'selfSig.payload');
  if (holds !== (digest === recovered)) fail('selfSig.payload.holds', '요약과 푼 값의 견줌과 어긋난다');
  return {
    ...scene,
    checks: [...scene.checks, { root, digest, recovered, holds }],
    step: { kind: 'selfSig', root },
  };
}

function reduceStoreCheck(scene: TrustAnchorScene, payload: unknown): TrustAnchorScene {
  const base = scene.base;
  if (base === null) fail('storeCheck', '바탕이 아직 없다');
  const p = rec(payload, 'storeCheck.payload');
  const root = knownRoot(scene, p['root'], 'storeCheck.payload.root');
  if (scene.verdicts.some((v) => v.root === root)) fail('storeCheck.payload.root', `이미 견준 뿌리 ${root}`);
  const storeN = int(p, 'storeN', 'storeCheck.payload');
  const storeE = int(p, 'storeE', 'storeCheck.payload');
  const trusted = bool(p, 'trusted', 'storeCheck.payload');
  if (!base.store.some((s) => s.n === storeN && s.e === storeE)) {
    fail('storeCheck.payload.storeN', `저장소에 없는 열쇠 (${storeN}, ${storeE})`);
  }
  const key = base.keys.find((k) => k.id === root);
  if (!key) fail('storeCheck.payload.root', `열쇠가 없는 뿌리 ${root}`);
  if (trusted !== (key.n === storeN && key.e === storeE)) {
    fail('storeCheck.payload.trusted', '견준 열쇠와 판정이 어긋난다');
  }
  return {
    ...scene,
    verdicts: [...scene.verdicts, { root, storeN, storeE, trusted }],
    step: { kind: 'storeCheck', root },
  };
}

export const trustAnchorScene: ScenePlan<TrustAnchorScene> = {
  initial(initialData: unknown): TrustAnchorScene {
    const data = narrowTrustAnchorData(initialData);
    return {
      cards: data.roots.map((r) => ({ id: r.id, subject: r.subject, issuer: r.issuer })),
      base: null,
      checks: [],
      verdicts: [],
      step: { kind: 'start' },
    };
  },
  reduce(scene: TrustAnchorScene, event: FacetRuntimeEvent): TrustAnchorScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, event.payload);
      case 'selfSig':
        return reduceSelfSig(scene, event.payload);
      case 'storeCheck':
        return reduceStoreCheck(scene, event.payload);
      default:
        throw new Error(`trustAnchorScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
