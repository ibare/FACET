/**
 * roughness-metallic 장면.
 *
 * 바탕  — 면 · 점 · 빛 · 눈 · 바탕색 (initial 이 initialData 에서 베낀다)
 * 자취  — 지금 얹힌 재질과 그 점 아홉의 값 (재질은 걸음마다 갈아 끼운다 — 쌓이지 않는다)
 * 이번 걸음 — 무엇이 바뀌었는가와, 흐르게 할 출발값(앞 재질의 값 · 번진 자리 · 봉우리)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowRoughnessMetallicData, type ShadedRow, type Vec3 } from './algorithm.js';

export type RoughnessMetallicBase = {
  readonly points: readonly number[];
  readonly light: Vec3;
  readonly eye: Vec3;
  readonly base: Vec3;
};

export type RoughnessMetallicState = {
  readonly id: string;
  readonly metallic: number;
  readonly roughness: number;
  readonly rows: readonly ShadedRow[];
  readonly peakX: number;
  readonly half: number;
  readonly spread: readonly number[];
};

export type RoughnessMetallicStep =
  | { readonly kind: 'start' }
  | {
      readonly kind: 'material';
      readonly changed: 'first' | 'metallic' | 'roughness';
      readonly from: number | null;
      /** 앞 재질의 상태 — 흐름의 출발값. 첫 재질이면 null */
      readonly was: RoughnessMetallicState | null;
    };

export type RoughnessMetallicScene = {
  readonly base: RoughnessMetallicBase;
  readonly now: RoughnessMetallicState | null;
  readonly step: RoughnessMetallicStep;
};

function fail(path: string, why: string): never {
  throw new Error(`roughness-metallic scene: ${path} — ${why}`);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function vec(v: unknown, path: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) fail(path, '수 셋의 배열이 아니다');
  return [num(v[0], `${path}[0]`), num(v[1], `${path}[1]`), num(v[2], `${path}[2]`)];
}

function readRows(v: unknown, points: readonly number[]): ShadedRow[] {
  if (!Array.isArray(v)) fail('payload.rows', '배열이 아니다');
  if (v.length !== points.length) fail('payload.rows', `점 ${points.length} 개가 아니라 ${v.length} 개다`);
  return v.map((r, i): ShadedRow => {
    const path = `payload.rows[${i}]`;
    if (typeof r !== 'object' || r === null) fail(path, '객체가 아니다');
    const o = r as Record<string, unknown>;
    const x = num(o.x, `${path}.x`);
    if (x !== points[i]) fail(`${path}.x`, `바탕의 점 차례와 다르다 (${String(points[i])} 자리)`);
    return {
      x,
      diffuse: vec(o.diffuse, `${path}.diffuse`),
      specular: vec(o.specular, `${path}.specular`),
      total: vec(o.total, `${path}.total`),
    };
  });
}

function readMaterial(event: FacetRuntimeEvent, points: readonly number[]): { state: RoughnessMetallicState; changed: 'first' | 'metallic' | 'roughness'; from: number | null } {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail('payload', '객체가 아니다');
  const o = p as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id === '') fail('payload.id', '문자열이 아니다');
  const changed = o.changed;
  if (changed !== 'first' && changed !== 'metallic' && changed !== 'roughness') fail('payload.changed', `모르는 값 ${String(changed)}`);
  const from = o.from === null ? null : num(o.from, 'payload.from');
  if ((changed === 'first') !== (from === null)) fail('payload.from', '첫 재질만 앞 값이 없다');
  const rows = readRows(o.rows, points);
  const peakX = num(o.peakX, 'payload.peakX');
  if (!points.includes(peakX)) fail('payload.peakX', `바탕에 없는 점 x=${peakX}`);
  if (!Array.isArray(o.spread) || o.spread.length === 0) fail('payload.spread', '빈 배열이거나 배열이 아니다');
  const spread = o.spread.map((x, i) => {
    const v = num(x, `payload.spread[${i}]`);
    if (!points.includes(v)) fail(`payload.spread[${i}]`, `바탕에 없는 점 x=${v}`);
    return v;
  });
  if (!spread.includes(peakX)) fail('payload.spread', '봉우리가 번진 자리에 없다');
  return {
    changed,
    from,
    state: {
      id: o.id,
      metallic: num(o.metallic, 'payload.metallic'),
      roughness: num(o.roughness, 'payload.roughness'),
      rows,
      peakX,
      half: num(o.half, 'payload.half'),
      spread,
    },
  };
}

export const roughnessMetallicScene: ScenePlan<RoughnessMetallicScene> = {
  initial(initialData) {
    const d = narrowRoughnessMetallicData(initialData);
    return {
      base: { points: [...d.points], light: [...d.light], eye: [...d.eye], base: [...d.base] },
      now: null,
      step: { kind: 'start' },
    };
  },
  reduce(scene, event) {
    switch (event.type) {
      case 'material': {
        const { state, changed, from } = readMaterial(event, scene.base.points);
        if ((scene.now === null) !== (changed === 'first')) fail('payload.changed', '첫 재질이 아닌데 first 이거나, 첫 재질인데 first 가 아니다');
        if (scene.now !== null && changed !== 'first') {
          const was = changed === 'metallic' ? scene.now.metallic : scene.now.roughness;
          if (was !== from) fail('payload.from', `지금 값 ${was} 과 다르다`);
        }
        return {
          base: scene.base,
          now: state,
          step: { kind: 'material', changed, from, was: scene.now },
        };
      }
      default:
        return fail('event.type', `모르는 이벤트 ${event.type}`);
    }
  },
};
