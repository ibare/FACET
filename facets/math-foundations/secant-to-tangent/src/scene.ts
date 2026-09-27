import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowSecantToTangentData, type PathSample, type Term } from './algorithm.js';

/** 바탕 — init 이 한 번 정한다 */
export type SecantBase = {
  terms: Term[];
  a: number;
  fa: number;
  tangent: number;
  curve: { x: number; y: number }[];
  xMax: number;
  yMax: number;
  slopeLo: number;
  slopeHi: number;
};

/** 지금 그어진 선 */
export type SecantLine =
  | { kind: 'secant'; h: number; qx: number; qy: number; slope: number; gap: number }
  | { kind: 'tangent'; slope: number };

/** 이번 걸음 — 무엇이 흐르는가 */
export type SecantStep =
  | { kind: 'place' }
  | { kind: 'slide'; path: PathSample[] }
  | { kind: 'touch'; path: PathSample[] };

export type SecantToTangentScene = {
  base: SecantBase | null;
  /** 지금까지 그은 할선의 기울기 (자취) */
  trail: number[];
  line: SecantLine | null;
  step: SecantStep | null;
};

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`secant-to-tangent scene: ${type}.payload.${key} 가 수가 아니다`);
  }
  return v;
}

function record(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    throw new Error(`secant-to-tangent scene: ${where} 가 객체가 아니다`);
  }
  return v as Record<string, unknown>;
}

function points(v: unknown, where: string): { x: number; y: number }[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`secant-to-tangent scene: ${where} 가 빈 배열이다`);
  return v.map((raw, i) => {
    const p = record(raw, `${where}[${i}]`);
    return { x: num(p, 'x', `${where}[${i}]`), y: num(p, 'y', `${where}[${i}]`) };
  });
}

function path(v: unknown, where: string): PathSample[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error(`secant-to-tangent scene: ${where} 가 빈 배열이다`);
  return v.map((raw, i) => {
    const p = record(raw, `${where}[${i}]`);
    const at = `${where}[${i}]`;
    return { x: num(p, 'x', at), y: num(p, 'y', at), slope: num(p, 'slope', at) };
  });
}

function terms(v: unknown): Term[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error('secant-to-tangent scene: init.payload.terms 가 빈 배열이다');
  return v.map((raw, i) => {
    if (!Array.isArray(raw) || raw.length !== 2 || typeof raw[0] !== 'number' || typeof raw[1] !== 'number') {
      throw new Error(`secant-to-tangent scene: init.payload.terms[${i}] 가 [계수, 지수] 가 아니다`);
    }
    return [raw[0], raw[1]];
  });
}

export const secantToTangentScene: ScenePlan<SecantToTangentScene> = {
  initial(initialData: unknown): SecantToTangentScene {
    // 자료 모양만 확인한다. 곡선 · f(a) · 기울기는 알고리즘이 셈해 silent init 으로 보낸다
    narrowSecantToTangentData(initialData);
    return { base: null, trail: [], line: null, step: null };
  },

  reduce(scene: SecantToTangentScene, event: FacetRuntimeEvent): SecantToTangentScene {
    switch (event.type) {
      case 'init': {
        const p = record(event.payload, 'init.payload');
        return {
          base: {
            terms: terms(p.terms),
            a: num(p, 'a', 'init'),
            fa: num(p, 'fa', 'init'),
            tangent: num(p, 'tangent', 'init'),
            curve: points(p.curve, 'init.payload.curve'),
            xMax: num(p, 'xMax', 'init'),
            yMax: num(p, 'yMax', 'init'),
            slopeLo: num(p, 'slopeLo', 'init'),
            slopeHi: num(p, 'slopeHi', 'init'),
          },
          trail: [],
          line: null,
          step: null,
        };
      }
      case 'secant': {
        if (scene.base === null) throw new Error('secant-to-tangent scene: init 전에 secant 가 왔다');
        if (scene.line !== null && scene.line.kind === 'tangent') {
          throw new Error('secant-to-tangent scene: 접선 뒤에 secant 가 왔다');
        }
        const p = record(event.payload, 'secant.payload');
        const h = num(p, 'h', 'secant');
        if (scene.line !== null && h >= scene.line.h) {
          throw new Error(`secant-to-tangent scene: secant.payload.h ${h} 가 앞 걸음보다 작지 않다`);
        }
        const line: SecantLine = {
          kind: 'secant',
          h,
          qx: num(p, 'qx', 'secant'),
          qy: num(p, 'qy', 'secant'),
          slope: num(p, 'slope', 'secant'),
          gap: num(p, 'gap', 'secant'),
        };
        const step: SecantStep =
          scene.line === null ? { kind: 'place' } : { kind: 'slide', path: path(p.path, 'secant.payload.path') };
        return { base: scene.base, trail: [...scene.trail, line.slope], line, step };
      }
      case 'tangent': {
        if (scene.base === null) throw new Error('secant-to-tangent scene: init 전에 tangent 가 왔다');
        if (scene.line === null || scene.line.kind !== 'secant') {
          throw new Error('secant-to-tangent scene: 할선 없이 tangent 가 왔다');
        }
        const p = record(event.payload, 'tangent.payload');
        return {
          base: scene.base,
          trail: scene.trail,
          line: { kind: 'tangent', slope: num(p, 'slope', 'tangent') },
          step: { kind: 'touch', path: path(p.path, 'tangent.payload.path') },
        };
      }
      default:
        throw new Error(`secant-to-tangent scene: 모르는 이벤트 '${event.type}'`);
    }
  },
};
