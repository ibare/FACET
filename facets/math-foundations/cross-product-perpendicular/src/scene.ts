/**
 * 외적 조각의 장면.
 *
 * 바탕 — a · b (initialData) 와 init 이 싣는 사이각 (`base`). 좌표는 담지 않는다.
 * 자취 — c = a × b (`cross`), 내적 둘 (`dots`), 차례를 바꾼 b × a (`swap`).
 * 이번 걸음 — `step`.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readCrossData, type NamedVec, type Vec3 } from './algorithm.js';

export interface CrossRow {
  readonly p: number;
  readonly q: number;
  readonly r: number;
  readonly s: number;
  readonly value: number;
}

export interface CrossStep {
  readonly name: string;
  readonly label: string;
  readonly v: Vec3;
  readonly rows: readonly CrossRow[];
}

export interface DotStep {
  readonly with: string;
  readonly expr: string;
  readonly terms: readonly (readonly [number, number])[];
  readonly value: number;
  readonly angle: number;
}

export interface SwapCheck {
  readonly expr: string;
  readonly value: number;
}

export interface SwapStep {
  readonly label: string;
  readonly v: Vec3;
  readonly opposite: boolean;
  readonly negLabel: string;
  readonly checks: readonly SwapCheck[];
}

export interface CrossBase {
  readonly angle: number;
}

export type CrossStepKind = 'start' | 'cross' | 'dot' | 'swap';

export interface CrossScene {
  readonly a: NamedVec;
  readonly b: NamedVec;
  readonly base: CrossBase | null;
  readonly cross: CrossStep | null;
  readonly dots: readonly DotStep[];
  readonly swap: SwapStep | null;
  readonly step: CrossStepKind | null;
}

// ── payload 좁히기 ───────────────────────────────────────

type Rec = Record<string, unknown>;

function rec(raw: unknown, path: string): Rec {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error(`${path}: 객체가 아니다`);
  return raw as Rec;
}

function num(raw: unknown, path: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`${path}: 수가 아니다`);
  return raw;
}

function str(raw: unknown, path: string): string {
  if (typeof raw !== 'string' || raw === '') throw new Error(`${path}: 글자가 아니다`);
  return raw;
}

function vec3(raw: unknown, path: string): Vec3 {
  if (!Array.isArray(raw) || raw.length !== 3) throw new Error(`${path}: 성분 셋이 아니다`);
  return [num(raw[0], `${path}[0]`), num(raw[1], `${path}[1]`), num(raw[2], `${path}[2]`)];
}

function list(raw: unknown, size: number, path: string): unknown[] {
  if (!Array.isArray(raw) || raw.length !== size) throw new Error(`${path}: 길이 ${size} 인 배열이 아니다`);
  return raw;
}

function reduceInit(scene: CrossScene, payload: unknown): CrossScene {
  if (scene.base !== null) throw new Error('init: 바탕이 이미 섰다');
  const p = rec(payload, 'init.payload');
  return {
    ...scene,
    base: { angle: num(p.angle, 'init.payload.angle') },
    step: 'start',
  };
}

function reduceCross(scene: CrossScene, payload: unknown): CrossScene {
  if (scene.base === null) throw new Error('cross: 바탕(init) 앞에 왔다');
  if (scene.cross !== null) throw new Error('cross: 이미 셈했다');
  const p = rec(payload, 'cross.payload');
  const rows = list(p.rows, 3, 'cross.payload.rows').map((raw, i) => {
    const row = rec(raw, `cross.payload.rows[${i}]`);
    return {
      p: num(row.p, `cross.payload.rows[${i}].p`),
      q: num(row.q, `cross.payload.rows[${i}].q`),
      r: num(row.r, `cross.payload.rows[${i}].r`),
      s: num(row.s, `cross.payload.rows[${i}].s`),
      value: num(row.value, `cross.payload.rows[${i}].value`),
    };
  });
  return {
    ...scene,
    cross: {
      name: str(p.name, 'cross.payload.name'),
      label: str(p.label, 'cross.payload.label'),
      v: vec3(p.v, 'cross.payload.v'),
      rows,
    },
    step: 'cross',
  };
}

function reduceDot(scene: CrossScene, payload: unknown): CrossScene {
  if (scene.cross === null) throw new Error('dot: c 를 셈하기 앞에 왔다');
  if (scene.dots.length >= 2) throw new Error('dot: 내적은 둘뿐이다');
  const p = rec(payload, 'dot.payload');
  const withName = str(p.with, 'dot.payload.with');
  if (withName !== scene.a.name && withName !== scene.b.name) throw new Error(`dot.payload.with: ${withName} 는 a · b 가 아니다`);
  const terms = list(p.terms, 3, 'dot.payload.terms').map((raw, i) => {
    const pair = list(raw, 2, `dot.payload.terms[${i}]`);
    return [num(pair[0], `dot.payload.terms[${i}][0]`), num(pair[1], `dot.payload.terms[${i}][1]`)] as const;
  });
  const step: DotStep = {
    with: withName,
    expr: str(p.expr, 'dot.payload.expr'),
    terms,
    value: num(p.value, 'dot.payload.value'),
    angle: num(p.angle, 'dot.payload.angle'),
  };
  return { ...scene, dots: [...scene.dots, step], step: 'dot' };
}

function reduceSwap(scene: CrossScene, payload: unknown): CrossScene {
  if (scene.cross === null) throw new Error('swap: c 를 셈하기 앞에 왔다');
  if (scene.swap !== null) throw new Error('swap: 이미 바꿨다');
  const p = rec(payload, 'swap.payload');
  if (typeof p.opposite !== 'boolean') throw new Error('swap.payload.opposite: 참거짓이 아니다');
  const checks = list(p.checks, 2, 'swap.payload.checks').map((raw, i) => {
    const c = rec(raw, `swap.payload.checks[${i}]`);
    return { expr: str(c.expr, `swap.payload.checks[${i}].expr`), value: num(c.value, `swap.payload.checks[${i}].value`) };
  });
  return {
    ...scene,
    swap: {
      label: str(p.label, 'swap.payload.label'),
      v: vec3(p.v, 'swap.payload.v'),
      opposite: p.opposite,
      negLabel: str(p.negLabel, 'swap.payload.negLabel'),
      checks,
    },
    step: 'swap',
  };
}

export const crossProductPerpendicularScene: ScenePlan<CrossScene> = {
  initial(initialData: unknown): CrossScene {
    const data = readCrossData(initialData);
    return {
      a: { name: data.a.name, v: [data.a.v[0], data.a.v[1], data.a.v[2]] },
      b: { name: data.b.name, v: [data.b.v[0], data.b.v[1], data.b.v[2]] },
      base: null,
      cross: null,
      dots: [],
      swap: null,
      step: null,
    };
  },
  reduce(scene: CrossScene, event: FacetRuntimeEvent): CrossScene {
    switch (event.type) {
      case 'init':
        return reduceInit(scene, event.payload);
      case 'cross':
        return reduceCross(scene, event.payload);
      case 'dot':
        return reduceDot(scene, event.payload);
      case 'swap':
        return reduceSwap(scene, event.payload);
      default:
        throw new Error(`crossProductPerpendicularScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
