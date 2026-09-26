/**
 * birthday-paradox 장면.
 *
 * 바탕 — 자리 수 · 입력 이름 · 실측 자리 번호 (initialData 에서 베낀다)
 * 자취 — 앉은 입력 수 · 쌓인 짝 목록 · 짝의 합 · 찬 자리 수 · 겹침
 * 이번 걸음 — 처음 / 들어옴 / 겹침
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readBirthdayParadoxData } from './algorithm.js';

export type BirthdayPair = readonly [number, number];

export type BirthdayStep =
  | { kind: 'start' }
  | { kind: 'enter'; index: number; newPairs: number }
  | { kind: 'collide'; index: number; other: number; newPairs: number };

export type BirthdayParadoxScene = {
  size: number;
  names: readonly string[];
  slots: readonly number[];
  /** 앉은 입력 수 (0 .. names.length) */
  seated: number;
  /** 지금까지 이룬 짝 — [앞선 입력, 새 입력] */
  pairs: readonly BirthdayPair[];
  /** 찬 자리 번호 — 처음 찬 차례대로. 길이가 곧 찬 자리 수다 */
  taken: readonly number[];
  collision: { a: number; b: number; slot: number } | null;
  step: BirthdayStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function fail(path: string, why: string): never {
  throw new Error(`birthdayParadoxScene: ${path} ${why}`);
}

function readInt(payload: Record<string, unknown>, key: string, type: string): number {
  const v = payload[key];
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${type}.payload.${key}`, '가 정수가 아니다');
  return v;
}

function readPartners(payload: Record<string, unknown>, type: string): number[] {
  const v = payload.partners;
  if (!Array.isArray(v)) fail(`${type}.payload.partners`, '가 배열이 아니다');
  return v.map((p: unknown, i: number) => {
    if (typeof p !== 'number' || !Number.isInteger(p)) fail(`${type}.payload.partners[${i}]`, '가 정수가 아니다');
    return p;
  });
}

function checkTaken(taken: readonly number[], filled: number, type: string): readonly number[] {
  if (filled !== taken.length) fail(`${type}.payload.filled`, `가 찬 자리 ${taken.length} 와 다르다 (${filled})`);
  return taken;
}

function seat(scene: BirthdayParadoxScene, event: FacetRuntimeEvent): BirthdayParadoxScene {
  const type = event.type;
  const payload = event.payload;
  if (!isRecord(payload)) fail(`${type}.payload`, '가 객체가 아니다');
  if (scene.collision !== null) fail(type, '가 겹침 뒤에 왔다');

  const index = readInt(payload, 'index', type);
  if (index !== scene.seated) fail(`${type}.payload.index`, `가 다음 차례 ${scene.seated} 와 다르다 (${index})`);
  const expectedSlot = scene.slots[index];
  if (expectedSlot === undefined) fail(`${type}.payload.index`, `가 입력 목록 밖이다 (${index})`);
  const slot = readInt(payload, 'slot', type);
  if (slot !== expectedSlot) fail(`${type}.payload.slot`, `가 바탕의 자리 ${expectedSlot} 와 다르다 (${slot})`);

  const partners = readPartners(payload, type);
  for (const p of partners) {
    if (p < 0 || p >= scene.seated) fail(`${type}.payload.partners`, `에 앉지 않은 입력 ${p} 가 있다`);
  }
  const pairs: BirthdayPair[] = [...scene.pairs, ...partners.map((p): BirthdayPair => [p, index])];
  const total = readInt(payload, 'pairs', type);
  if (total !== pairs.length) fail(`${type}.payload.pairs`, `가 쌓인 짝 ${pairs.length} 와 다르다 (${total})`);
  const filled = readInt(payload, 'filled', type);
  const newPairs = partners.length;

  if (type === 'collide') {
    const other = readInt(payload, 'other', type);
    if (other < 0 || other >= scene.seated) fail('collide.payload.other', `가 앉은 입력이 아니다 (${other})`);
    if (scene.slots[other] !== slot) fail('collide.payload.other', `의 자리가 ${slot} 가 아니다`);
    return {
      ...scene,
      seated: index + 1,
      pairs,
      taken: checkTaken(scene.taken, filled, type),
      collision: { a: other, b: index, slot },
      step: { kind: 'collide', index, other, newPairs },
    };
  }
  if (scene.taken.includes(slot)) fail('enter.payload.slot', `가 이미 찬 자리다 (${slot}) — 겹침이면 collide 여야 한다`);
  return {
    ...scene,
    seated: index + 1,
    pairs,
    taken: checkTaken([...scene.taken, slot], filled, type),
    step: { kind: 'enter', index, newPairs },
  };
}

export const birthdayParadoxScene: ScenePlan<BirthdayParadoxScene> = {
  initial(initialData: unknown): BirthdayParadoxScene {
    const data = readBirthdayParadoxData(initialData);
    return {
      size: data.size,
      names: data.inputs.map((x) => x.name),
      slots: data.inputs.map((x) => x.slot),
      seated: 0,
      pairs: [],
      taken: [],
      collision: null,
      step: { kind: 'start' },
    };
  },
  reduce(scene: BirthdayParadoxScene, event: FacetRuntimeEvent): BirthdayParadoxScene {
    switch (event.type) {
      case 'enter':
      case 'collide':
        return seat(scene, event);
      default:
        throw new Error(`birthdayParadoxScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
