import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowColorBleedingData } from './algorithm.js';
import type { Emitter, Patch, Rgb, Vec2 } from './algorithm.js';

/** 직접광 한 줄 */
export type DirectLight = { id: string; formToLight: number; value: Rgb };

/** 모음 한 번 */
export type Gathering = {
  id: string;
  parts: { from: string; form: number }[];
  added: Rgb;
  before: Rgb;
  after: Rgb;
  redMinusGreen: number;
};

export type ColorBleedingStep = { kind: 'start' } | { kind: 'direct' } | { kind: 'gather'; id: string };

export type ColorBleedingScene = {
  // 바탕
  emitter: Emitter;
  patches: Patch[];
  receivers: string[];
  senders: string[];
  // 자취
  /** 직접광 — direct 전에는 null */
  direct: DirectLight[] | null;
  /** 모음 — receivers 차례로 쌓인다 */
  gathered: Gathering[];
  // 이번 걸음
  step: ColorBleedingStep;
};

function fail(path: string, why: string): never {
  throw new Error(`color-bleeding scene: ${path} — ${why}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '수가 아니다');
  return v;
}

function str(v: unknown, path: string): string {
  if (typeof v !== 'string') fail(path, '문자열이 아니다');
  return v;
}

function rgb(v: unknown, path: string): Rgb {
  if (!Array.isArray(v) || v.length !== 3) fail(path, 'RGB 셋이 아니다');
  return [num(v[0], `${path}[0]`), num(v[1], `${path}[1]`), num(v[2], `${path}[2]`)];
}

function v2(p: Vec2): Vec2 {
  return [p[0], p[1]];
}

function c3(c: Rgb): Rgb {
  return [c[0], c[1], c[2]];
}

function sameRgb(x: Rgb, y: Rgb): boolean {
  return x[0] === y[0] && x[1] === y[1] && x[2] === y[2];
}

function reduceDirect(scene: ColorBleedingScene, payload: unknown): ColorBleedingScene {
  if (scene.direct !== null) fail('direct', '직접광이 두 번 왔다');
  if (!isRecord(payload) || !Array.isArray(payload.items)) fail('direct.payload.items', '배열이 아니다');
  const items = payload.items;
  if (items.length !== scene.patches.length) fail('direct.payload.items', '패치 수와 다르다');
  const direct = items.map((it: unknown, i: number): DirectLight => {
    const path = `direct.payload.items[${i}]`;
    if (!isRecord(it)) fail(path, '객체가 아니다');
    const id = str(it.id, `${path}.id`);
    const expected = scene.patches[i];
    if (expected === undefined || expected.id !== id) fail(`${path}.id`, `패치 차례와 다르다 (${id})`);
    return { id, formToLight: num(it.formToLight, `${path}.formToLight`), value: rgb(it.value, `${path}.value`) };
  });
  return { ...scene, direct, step: { kind: 'direct' } };
}

function reduceGather(scene: ColorBleedingScene, payload: unknown): ColorBleedingScene {
  if (scene.direct === null) fail('gather', '직접광보다 먼저 왔다');
  if (!isRecord(payload)) fail('gather.payload', '객체가 아니다');
  const id = str(payload.id, 'gather.payload.id');
  const expectedId = scene.receivers[scene.gathered.length];
  if (expectedId === undefined || expectedId !== id) fail('gather.payload.id', `받는 차례와 다르다 (${id})`);
  const lit = scene.direct.find((d) => d.id === id);
  if (lit === undefined) fail('gather.payload.id', `직접광이 없는 패치 ${id}`);
  const before = rgb(payload.before, 'gather.payload.before');
  if (!sameRgb(before, lit.value)) fail('gather.payload.before', '그 패치의 직접광과 다르다');
  if (!Array.isArray(payload.parts) || payload.parts.length !== scene.senders.length) {
    fail('gather.payload.parts', '보내는 패치 수와 다르다');
  }
  const parts = payload.parts.map((p: unknown, i: number) => {
    const path = `gather.payload.parts[${i}]`;
    if (!isRecord(p)) fail(path, '객체가 아니다');
    const from = str(p.from, `${path}.from`);
    if (from !== scene.senders[i]) fail(`${path}.from`, `보내는 차례와 다르다 (${from})`);
    return { from, form: num(p.form, `${path}.form`) };
  });
  const g: Gathering = {
    id,
    parts,
    added: rgb(payload.added, 'gather.payload.added'),
    before,
    after: rgb(payload.after, 'gather.payload.after'),
    redMinusGreen: num(payload.redMinusGreen, 'gather.payload.redMinusGreen'),
  };
  return { ...scene, gathered: [...scene.gathered, g], step: { kind: 'gather', id } };
}

export const colorBleedingScene: ScenePlan<ColorBleedingScene> = {
  initial(initialData: unknown): ColorBleedingScene {
    const d = narrowColorBleedingData(initialData);
    return {
      emitter: { id: d.emitter.id, a: v2(d.emitter.a), b: v2(d.emitter.b), emission: c3(d.emitter.emission) },
      patches: d.patches.map((p) => ({ id: p.id, a: v2(p.a), b: v2(p.b), rho: c3(p.rho) })),
      receivers: [...d.receivers],
      senders: [...d.senders],
      direct: null,
      gathered: [],
      step: { kind: 'start' },
    };
  },
  reduce(scene: ColorBleedingScene, event: FacetRuntimeEvent): ColorBleedingScene {
    switch (event.type) {
      case 'direct':
        return reduceDirect(scene, event.payload);
      case 'gather':
        return reduceGather(scene, event.payload);
      default:
        throw new Error(`color-bleeding scene: 모르는 이벤트 ${event.type}`);
    }
  },
};
