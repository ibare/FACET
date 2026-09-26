import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowMoveFewData, type KeyBase, type ServerBase } from './algorithm.js';

/** 키 하나를 두 쪽에서 다시 놓은 결과 (알고리즘이 셈해 실은 것). */
export type Placed = {
  key: string;
  ringTo: string;
  ringMoved: boolean;
  modIndex: number;
  modTo: string;
  modMoved: boolean;
};

export type MoveFewStep = { kind: 'start' } | { kind: 'remove' } | { kind: 'place'; key: string };

export type MoveFewScene = {
  /** 자료에서 베낀 것 — init 이 오기 전 바탕을 맞춰 볼 잣대. */
  serverIds: readonly string[];
  keyIds: readonly string[];
  removedId: string;
  /** 바탕 — silent init 이 한 번 정한다. */
  base: { ringSize: number; servers: readonly ServerBase[]; keys: readonly KeyBase[]; rows: number } | null;
  /** 자취 */
  removal: { server: string; successor: string; survivors: readonly string[] } | null;
  placed: readonly Placed[];
  /** 이번 걸음 */
  step: MoveFewStep;
};

function fail(path: string, why: string): never {
  throw new Error(`move-few-on-change 장면: ${path} — ${why}`);
}

function rec(v: unknown, path: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) fail(path, '객체가 아니다');
  return v as Record<string, unknown>;
}
function str(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, '문자열이 아니다');
  return v;
}
function int(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(path, '0 이상의 정수가 아니다');
  return v;
}
function bool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') fail(path, '참거짓이 아니다');
  return v;
}
function arr(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(path, '배열이 아니다');
  return v;
}

/** 자취에서 옮겨 간 키의 누계를 읽는다 — 화면의 누계와 이벤트의 누계가 같은 자리에서 나온다. */
export function movedCounts(scene: MoveFewScene): { ring: number; mod: number } {
  let ring = 0;
  let mod = 0;
  for (const p of scene.placed) {
    if (p.ringMoved) ring += 1;
    if (p.modMoved) mod += 1;
  }
  return { ring, mod };
}

function reduceInit(scene: MoveFewScene, payload: unknown): MoveFewScene {
  const p = rec(payload, 'init.payload');
  const ringSize = int(p.ringSize, 'init.payload.ringSize');
  const servers: ServerBase[] = arr(p.servers, 'init.payload.servers').map((raw, i) => {
    const s = rec(raw, `init.payload.servers[${i}]`);
    const id = str(s.id, `init.payload.servers[${i}].id`);
    if (id !== scene.serverIds[i]) fail(`init.payload.servers[${i}].id`, `자료의 차례(${String(scene.serverIds[i])})와 다르다`);
    const pos = int(s.pos, `init.payload.servers[${i}].pos`);
    if (pos >= ringSize) fail(`init.payload.servers[${i}].pos`, '링 밖이다');
    const index = int(s.index, `init.payload.servers[${i}].index`);
    if (index !== i) fail(`init.payload.servers[${i}].index`, '목록 차례와 다르다');
    return { id, pos, index };
  });
  if (servers.length !== scene.serverIds.length) fail('init.payload.servers', '자료의 서버 수와 다르다');
  const ids = new Set(servers.map((s) => s.id));
  const keys: KeyBase[] = arr(p.keys, 'init.payload.keys').map((raw, i) => {
    const k = rec(raw, `init.payload.keys[${i}]`);
    const id = str(k.id, `init.payload.keys[${i}].id`);
    if (id !== scene.keyIds[i]) fail(`init.payload.keys[${i}].id`, `자료의 차례(${String(scene.keyIds[i])})와 다르다`);
    const pos = int(k.pos, `init.payload.keys[${i}].pos`);
    if (pos >= ringSize) fail(`init.payload.keys[${i}].pos`, '링 밖이다');
    const ringOwner = str(k.ringOwner, `init.payload.keys[${i}].ringOwner`);
    if (!ids.has(ringOwner)) fail(`init.payload.keys[${i}].ringOwner`, '없는 서버다');
    const modIndex = int(k.modIndex, `init.payload.keys[${i}].modIndex`);
    const modOwner = str(k.modOwner, `init.payload.keys[${i}].modOwner`);
    if (servers[modIndex]?.id !== modOwner) fail(`init.payload.keys[${i}].modOwner`, '번호의 서버와 다르다');
    return { id, pos, ringOwner, modIndex, modOwner };
  });
  if (keys.length !== scene.keyIds.length) fail('init.payload.keys', '자료의 키 수와 다르다');
  const rows = int(p.rows, 'init.payload.rows');
  if (rows < 1) fail('init.payload.rows', '1 보다 작다');
  return { ...scene, base: { ringSize, servers, keys, rows }, step: { kind: 'start' } };
}

function reduceRemove(scene: MoveFewScene, payload: unknown): MoveFewScene {
  if (scene.base === null) fail('remove', '바탕(init) 앞에 왔다');
  if (scene.removal !== null) fail('remove', '이미 빠졌다');
  const p = rec(payload, 'remove.payload');
  const server = str(p.server, 'remove.payload.server');
  if (server !== scene.removedId) fail('remove.payload.server', `자료의 빠지는 서버(${scene.removedId})와 다르다`);
  const survivors = arr(p.survivors, 'remove.payload.survivors').map((v, i) =>
    str(v, `remove.payload.survivors[${i}]`),
  );
  const expected = scene.serverIds.filter((id) => id !== server);
  if (survivors.join('|') !== expected.join('|')) fail('remove.payload.survivors', '남은 서버의 원래 차례와 다르다');
  const successor = str(p.successor, 'remove.payload.successor');
  if (!survivors.includes(successor)) fail('remove.payload.successor', '남은 서버가 아니다');
  return { ...scene, removal: { server, successor, survivors }, step: { kind: 'remove' } };
}

function reducePlace(scene: MoveFewScene, payload: unknown): MoveFewScene {
  const base = scene.base;
  const removal = scene.removal;
  if (base === null || removal === null) fail('place', '서버가 빠지기 전에 왔다');
  const p = rec(payload, 'place.payload');
  const key = str(p.key, 'place.payload.key');
  const next = base.keys[scene.placed.length];
  if (next === undefined) fail('place.payload.key', '다시 놓을 키가 더 없다');
  if (next.id !== key) fail('place.payload.key', `다시 놓는 차례(${next.id})와 다르다`);
  const ringTo = str(p.ringTo, 'place.payload.ringTo');
  if (!removal.survivors.includes(ringTo)) fail('place.payload.ringTo', '남은 서버가 아니다');
  const ringMoved = bool(p.ringMoved, 'place.payload.ringMoved');
  if (ringMoved !== (ringTo !== next.ringOwner)) fail('place.payload.ringMoved', '앞 주인과 맞지 않는다');
  const modIndex = int(p.modIndex, 'place.payload.modIndex');
  const modTo = str(p.modTo, 'place.payload.modTo');
  if (removal.survivors[modIndex] !== modTo) fail('place.payload.modTo', '새 번호의 서버와 다르다');
  const modMoved = bool(p.modMoved, 'place.payload.modMoved');
  if (modMoved !== (modTo !== next.modOwner)) fail('place.payload.modMoved', '앞 주인과 맞지 않는다');
  const ring = int(p.ringTally, 'place.payload.ringTally');
  const mod = int(p.modTally, 'place.payload.modTally');
  const before = movedCounts(scene);
  if (ring !== before.ring + (ringMoved ? 1 : 0)) fail('place.payload.ringTally', '앞 누계와 맞지 않는다');
  if (mod !== before.mod + (modMoved ? 1 : 0)) fail('place.payload.modTally', '앞 누계와 맞지 않는다');
  return {
    ...scene,
    placed: [...scene.placed, { key, ringTo, ringMoved, modIndex, modTo, modMoved }],
    step: { kind: 'place', key },
  };
}

export const moveFewOnChangeScene: ScenePlan<MoveFewScene> = {
  initial(initialData: unknown): MoveFewScene {
    const data = narrowMoveFewData(initialData);
    return {
      serverIds: [...data.servers],
      keyIds: [...data.keys],
      removedId: data.removed,
      base: null,
      removal: null,
      placed: [],
      step: { kind: 'start' },
    };
  },
  reduce(scene: MoveFewScene, event: FacetRuntimeEvent): MoveFewScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, event.payload);
      case 'remove':
        return reduceRemove(scene, event.payload);
      case 'place':
        return reducePlace(scene, event.payload);
      default:
        throw new Error(`move-few-on-change 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
