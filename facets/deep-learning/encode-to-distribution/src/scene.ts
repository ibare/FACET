/**
 * encode-to-distribution 의 장면.
 *
 * 바탕: 입력들 (id · 칸 값) — initialData 에서 베낀다. 걸음 0 은 입력만 있고 잠재 축이 빈다.
 * 자취: 입력마다 놓인 μ · 번진 σ, 쌓인 겹침, 가운데 자리의 셈.
 * 이번 걸음: step.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readEncodeData } from './algorithm.js';

export type SceneInput = { id: string; x: number[] };

export type SceneEncoding = {
  mu: number;
  /** 번지기 전이면 null */
  spread: { logVar: number; sigma: number; lo: number; hi: number } | null;
};

export type SceneOverlap = { a: number; b: number; lo: number; hi: number; width: number };

export type SceneProbe = {
  z: number;
  left: number;
  right: number;
  densities: number[];
  inside: number[];
  onPoint: number[];
};

export type SceneStep =
  | { kind: 'start' }
  | { kind: 'place'; index: number }
  | { kind: 'spread'; index: number; overlaps: number[] }
  | { kind: 'probe' };

/** 잠재 축의 바탕 — 알고리즘이 셈해 silent init 으로 보낸다 */
export type SceneAxis = { lo: number; hi: number; peak: number };

export type EncodeToDistributionScene = {
  inputs: SceneInput[];
  axis: SceneAxis | null;
  encodings: (SceneEncoding | null)[];
  overlaps: SceneOverlap[];
  probe: SceneProbe | null;
  step: SceneStep;
};

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`encode-to-distribution 장면: ${where} 가 수가 아니다`);
  }
  return v;
}

function numList(v: unknown, where: string): number[] {
  if (!Array.isArray(v)) throw new Error(`encode-to-distribution 장면: ${where} 가 배열이 아니다`);
  return v.map((e, i) => num(e, `${where}[${i}]`));
}

function record(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) {
    throw new Error(`encode-to-distribution 장면: ${where} 가 객체가 아니다`);
  }
  return v as Record<string, unknown>;
}

function inputIndex(scene: EncodeToDistributionScene, v: unknown, where: string): number {
  const i = num(v, where);
  if (!Number.isInteger(i) || i < 0 || i >= scene.inputs.length) {
    throw new Error(`encode-to-distribution 장면: ${where} ${i} 는 입력 번호가 아니다`);
  }
  return i;
}

export const encodeToDistributionScene: ScenePlan<EncodeToDistributionScene> = {
  initial(initialData: unknown): EncodeToDistributionScene {
    const data = readEncodeData(initialData);
    return {
      inputs: data.inputs.map((e) => ({ id: e.id, x: [...e.x] })),
      axis: null,
      encodings: data.inputs.map(() => null),
      overlaps: [],
      probe: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: EncodeToDistributionScene, event: FacetRuntimeEvent): EncodeToDistributionScene {
    const p = record(event.payload, `${event.type} payload`);
    switch (event.type) {
      case 'init': {
        const axis: SceneAxis = {
          lo: num(p.lo, 'init.lo'),
          hi: num(p.hi, 'init.hi'),
          peak: num(p.peak, 'init.peak'),
        };
        if (!(axis.hi > axis.lo) || !(axis.peak > 0)) {
          throw new Error('encode-to-distribution 장면: init 의 축 범위 · 봉우리가 올바르지 않다');
        }
        return { ...scene, axis };
      }
      case 'place': {
        const index = inputIndex(scene, p.index, 'place.index');
        const encodings = scene.encodings.map((e, i) =>
          i === index ? { mu: num(p.mu, 'place.mu'), spread: null } : e,
        );
        return { ...scene, encodings, step: { kind: 'place', index } };
      }
      case 'spread': {
        const index = inputIndex(scene, p.index, 'spread.index');
        const was = scene.encodings[index];
        if (was === null || was === undefined) {
          throw new Error(`encode-to-distribution 장면: 입력 ${index} 는 놓이기 전에 번질 수 없다`);
        }
        const spread = {
          logVar: num(p.logVar, 'spread.logVar'),
          sigma: num(p.sigma, 'spread.sigma'),
          lo: num(p.lo, 'spread.lo'),
          hi: num(p.hi, 'spread.hi'),
        };
        if (!Array.isArray(p.overlaps)) {
          throw new Error('encode-to-distribution 장면: spread.overlaps 가 배열이 아니다');
        }
        const added = p.overlaps.map((raw: unknown, k: number): SceneOverlap => {
          const o = record(raw, `spread.overlaps[${k}]`);
          return {
            a: inputIndex(scene, o.other, `spread.overlaps[${k}].other`),
            b: index,
            lo: num(o.lo, `spread.overlaps[${k}].lo`),
            hi: num(o.hi, `spread.overlaps[${k}].hi`),
            width: num(o.width, `spread.overlaps[${k}].width`),
          };
        });
        const encodings = scene.encodings.map((e, i) => (i === index ? { mu: was.mu, spread } : e));
        const start = scene.overlaps.length;
        return {
          ...scene,
          encodings,
          overlaps: [...scene.overlaps, ...added],
          step: { kind: 'spread', index, overlaps: added.map((_, k) => start + k) },
        };
      }
      case 'probe': {
        const probe: SceneProbe = {
          z: num(p.z, 'probe.z'),
          left: inputIndex(scene, p.left, 'probe.left'),
          right: inputIndex(scene, p.right, 'probe.right'),
          densities: numList(p.densities, 'probe.densities'),
          inside: numList(p.inside, 'probe.inside').map((v) => inputIndex(scene, v, 'probe.inside')),
          onPoint: numList(p.onPoint, 'probe.onPoint').map((v) => inputIndex(scene, v, 'probe.onPoint')),
        };
        if (probe.densities.length !== scene.inputs.length) {
          throw new Error('encode-to-distribution 장면: probe.densities 의 길이가 입력 수와 다르다');
        }
        return { ...scene, probe, step: { kind: 'probe' } };
      }
      default:
        throw new Error(`encode-to-distribution 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
