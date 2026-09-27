/**
 * matrix-product-chain 장면.
 *
 * 바탕   matrices (initialData 의 두 변환) · plane (init 이 주는 처음 자리와 좌표 범위)
 * 자취   hops (두 번 뛴 길) · products (셈한 곱과 그 곱으로 한 번에 뛴 도착)
 * 이번   step — 이 걸음에 무엇이 움직이는가
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowData, readCells, readPts } from './algorithm.js';
import type { Bounds, Cells, MatrixSpec, Pt } from './algorithm.js';

export type Role = 'first' | 'second';
export type Order = 'kept' | 'swapped';

export type Hop = { readonly by: Role; readonly from: readonly Pt[]; readonly to: readonly Pt[] };

export type Product = {
  readonly order: Order;
  readonly name: string;
  readonly cells: Cells;
  /** 이 곱으로 처음 자리에서 한 번에 뛴 도착. 아직 뛰지 않았으면 null */
  readonly landing: readonly Pt[] | null;
  /** 두 번 뛴 자리와 같은 점의 수 (뛴 뒤에만) */
  readonly same: number | null;
  readonly total: number | null;
};

export type Step =
  | { readonly kind: 'start' }
  | { readonly kind: 'hop'; readonly by: Role }
  | { readonly kind: 'compose' }
  | { readonly kind: 'leap' }
  | { readonly kind: 'swapLeap' };

export type MatrixProductChainScene = {
  readonly matrices: { readonly first: MatrixSpec; readonly second: MatrixSpec };
  readonly plane: { readonly start: readonly Pt[]; readonly bounds: Bounds } | null;
  readonly hops: readonly Hop[];
  readonly products: readonly Product[];
  readonly step: Step;
};

function fail(msg: string): never {
  throw new Error(`matrixProductChainScene: ${msg}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (!isRecord(p)) fail(`${event.type}.payload 가 객체가 아니다`);
  return p;
}

function readInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(`${path} 는 0 이상의 정수여야 한다`);
  return v;
}

function readName(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(`${path} 는 빈 글자가 아니어야 한다`);
  return v;
}

function readBounds(v: unknown): Bounds {
  if (!isRecord(v)) fail('init.payload.bounds 가 객체가 아니다');
  const b = v;
  const pick = (k: string): number => {
    const n = b[k];
    if (typeof n !== 'number' || !Number.isFinite(n)) fail(`init.payload.bounds.${k} 가 수가 아니다`);
    return n;
  };
  const out = { xMin: pick('xMin'), xMax: pick('xMax'), yMin: pick('yMin'), yMax: pick('yMax') };
  if (out.xMin > out.xMax || out.yMin > out.yMax) fail('init.payload.bounds 의 최소가 최대보다 크다');
  return out;
}

function samePts(a: readonly Pt[], b: readonly Pt[]): boolean {
  return a.length === b.length && a.every((p, i) => p.x === b[i].x && p.y === b[i].y);
}

function needPlane(scene: MatrixProductChainScene, type: string): { start: readonly Pt[]; bounds: Bounds } {
  if (scene.plane === null) fail(`${type} 이 init 보다 먼저 왔다`);
  return scene.plane;
}

function copyCells(c: Cells): Cells {
  return [c[0], c[1], c[2], c[3]];
}

/** 지금 두 번 뛰는 점들이 서 있는 자리. */
function currentPts(scene: MatrixProductChainScene, start: readonly Pt[]): readonly Pt[] {
  const last = scene.hops[scene.hops.length - 1];
  return last === undefined ? start : last.to;
}

export const matrixProductChainScene: ScenePlan<MatrixProductChainScene> = {
  initial(initialData: unknown): MatrixProductChainScene {
    const data = narrowData(initialData);
    return {
      matrices: {
        first: { symbol: data.first.symbol, cells: copyCells(data.first.cells) },
        second: { symbol: data.second.symbol, cells: copyCells(data.second.cells) },
      },
      plane: null,
      hops: [],
      products: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: MatrixProductChainScene, event: FacetRuntimeEvent): MatrixProductChainScene {
    switch (event.type) {
      case 'init': {
        if (scene.plane !== null) fail('init 이 두 번 왔다');
        const p = payloadOf(event);
        const start = readPts(p['start'], 'init.payload.start');
        return { ...scene, plane: { start, bounds: readBounds(p['bounds']) }, step: { kind: 'start' } };
      }
      case 'hop': {
        const plane = needPlane(scene, 'hop');
        const p = payloadOf(event);
        const by = p['by'];
        if (by !== 'first' && by !== 'second') fail('hop.payload.by 는 first 또는 second 여야 한다');
        const expected: Role = scene.hops.length === 0 ? 'first' : 'second';
        if (scene.hops.length >= 2 || by !== expected) fail(`hop.payload.by 가 ${expected} 차례가 아니다`);
        const from = readPts(p['from'], 'hop.payload.from');
        if (!samePts(from, currentPts(scene, plane.start))) fail('hop.payload.from 이 지금 자리와 다르다');
        const to = readPts(p['to'], 'hop.payload.to');
        if (to.length !== from.length) fail('hop.payload.to 의 점 수가 from 과 다르다');
        return { ...scene, hops: [...scene.hops, { by, from, to }], step: { kind: 'hop', by } };
      }
      case 'compose': {
        needPlane(scene, 'compose');
        if (scene.hops.length !== 2) fail('compose 가 두 번 뛰기 전에 왔다');
        if (scene.products.length !== 0) fail('compose 가 두 번 왔다');
        const p = payloadOf(event);
        if (p['order'] !== 'kept') fail('compose.payload.order 는 kept 여야 한다');
        const product: Product = {
          order: 'kept',
          name: readName(p['name'], 'compose.payload.name'),
          cells: readCells(p['cells'], 'compose.payload.cells'),
          landing: null,
          same: null,
          total: null,
        };
        return { ...scene, products: [product], step: { kind: 'compose' } };
      }
      case 'leap': {
        const plane = needPlane(scene, 'leap');
        const kept = scene.products[0];
        if (kept === undefined || scene.products.length !== 1 || kept.landing !== null) {
          fail('leap 이 compose 바로 뒤가 아니다');
        }
        const p = payloadOf(event);
        if (p['order'] !== 'kept') fail('leap.payload.order 는 kept 여야 한다');
        const from = readPts(p['from'], 'leap.payload.from');
        if (!samePts(from, plane.start)) fail('leap.payload.from 이 처음 자리와 다르다');
        const to = readPts(p['to'], 'leap.payload.to');
        if (to.length !== from.length) fail('leap.payload.to 의 점 수가 from 과 다르다');
        const landed: Product = {
          ...kept,
          landing: to,
          same: readInt(p['same'], 'leap.payload.same'),
          total: readInt(p['total'], 'leap.payload.total'),
        };
        return { ...scene, products: [landed], step: { kind: 'leap' } };
      }
      case 'swapLeap': {
        const plane = needPlane(scene, 'swapLeap');
        const kept = scene.products[0];
        if (kept === undefined || scene.products.length !== 1 || kept.landing === null) {
          fail('swapLeap 이 leap 바로 뒤가 아니다');
        }
        const p = payloadOf(event);
        if (p['order'] !== 'swapped') fail('swapLeap.payload.order 는 swapped 여야 한다');
        const from = readPts(p['from'], 'swapLeap.payload.from');
        if (!samePts(from, plane.start)) fail('swapLeap.payload.from 이 처음 자리와 다르다');
        const to = readPts(p['to'], 'swapLeap.payload.to');
        if (to.length !== from.length) fail('swapLeap.payload.to 의 점 수가 from 과 다르다');
        const product: Product = {
          order: 'swapped',
          name: readName(p['name'], 'swapLeap.payload.name'),
          cells: readCells(p['cells'], 'swapLeap.payload.cells'),
          landing: to,
          same: readInt(p['same'], 'swapLeap.payload.same'),
          total: readInt(p['total'], 'swapLeap.payload.total'),
        };
        return { ...scene, products: [kept, product], step: { kind: 'swapLeap' } };
      }
      default:
        fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
