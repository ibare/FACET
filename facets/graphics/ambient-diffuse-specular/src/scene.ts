/**
 * 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 했다.
 *
 * 바탕: 법선 · 빛 쪽 각 · 눈 쪽 각 · 광택 지수 (initialData 에서)
 * 자취: 점의 색 · 얹힌 몫들 · 찾은 반사 방향
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowAdsData, type PartId, type Rgb, type Vec3 } from './algorithm.js';

export type AdsPart = { part: PartId; amount: Rgb };

export type AdsStep =
  | { kind: 'start' }
  | { kind: 'add'; part: PartId; before: Rgb; factor: number | null }
  | { kind: 'reflect'; rv: number };

export type AdsScene = {
  base: { normal: Vec3; lightDeg: number; eyeDeg: number; shininess: number };
  /** 점의 색. init 이 오기 전에는 null */
  sum: Rgb | null;
  parts: readonly AdsPart[];
  reflect: { dir: Vec3; rv: number } | null;
  step: AdsStep;
};

function num(raw: unknown, path: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`${path}: 수가 아니다`);
  return raw;
}

function three(raw: unknown, path: string): [number, number, number] {
  if (!Array.isArray(raw) || raw.length !== 3) throw new Error(`${path}: 세 수의 배열이 아니다`);
  return [num(raw[0], `${path}[0]`), num(raw[1], `${path}[1]`), num(raw[2], `${path}[2]`)];
}

function record(raw: unknown, path: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${path}: 객체가 아니다`);
  return raw as Record<string, unknown>;
}

function partId(raw: unknown): PartId {
  if (raw === 'ambient' || raw === 'diffuse' || raw === 'specular') return raw;
  throw new Error(`add-part.payload.part: 모르는 몫 (${String(raw)})`);
}

export const ambientDiffuseSpecularScene: ScenePlan<AdsScene> = {
  initial(initialData: unknown): AdsScene {
    const d = narrowAdsData(initialData);
    return {
      base: {
        normal: [d.normal[0], d.normal[1], d.normal[2]],
        lightDeg: d.lightDeg,
        eyeDeg: d.eyeDeg,
        shininess: d.shininess,
      },
      sum: null,
      parts: [],
      reflect: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: AdsScene, event: FacetRuntimeEvent): AdsScene {
    const p = record(event.payload, `${event.type}.payload`);
    switch (event.type) {
      case 'init': {
        if (scene.sum !== null) throw new Error('init: 이미 점의 색이 있다');
        return { ...scene, sum: three(p.sum, 'init.payload.sum'), step: { kind: 'start' } };
      }
      case 'add-part': {
        const before = scene.sum;
        if (before === null) throw new Error('add-part: init 앞에 왔다');
        const part = partId(p.part);
        if (scene.parts.some((x) => x.part === part)) throw new Error(`add-part.payload.part: ${part} 는 이미 얹혔다`);
        if (part === 'specular' && scene.reflect === null) throw new Error('add-part: 반사 방향 없이 번쩍임이 왔다');
        const amount = three(p.amount, 'add-part.payload.amount');
        const sum = three(p.sum, 'add-part.payload.sum');
        sum.forEach((x, i) => {
          if (Math.abs(before[i]! + amount[i]! - x) > 1e-9) {
            throw new Error(`add-part.payload.sum[${i}]: 앞의 색에 몫을 더한 값과 다르다`);
          }
        });
        const factor = p.factor === null ? null : num(p.factor, 'add-part.payload.factor');
        if ((part === 'ambient') !== (factor === null)) {
          throw new Error(`add-part.payload.factor: ${part} 에 맞지 않는다`);
        }
        return {
          ...scene,
          sum,
          parts: [...scene.parts, { part, amount }],
          step: { kind: 'add', part, before: [before[0], before[1], before[2]], factor },
        };
      }
      case 'reflect': {
        if (scene.reflect !== null) throw new Error('reflect: 이미 반사 방향이 있다');
        const dir = three(p.dir, 'reflect.payload.dir');
        const rv = num(p.rv, 'reflect.payload.rv');
        return { ...scene, reflect: { dir, rv }, step: { kind: 'reflect', rv } };
      }
      default:
        throw new Error(`모르는 이벤트: ${event.type}`);
    }
  },
};
