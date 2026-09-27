/**
 * determinantZeroCollapse 장면.
 *
 * 바탕 — 행렬과 점(initialData 에서 베낀다) · 알고리즘이 셈한 setup(silent init 이 채운다)
 * 자취 — 도착한 점의 차례(arrived) · 자리마다 온 점의 수(counts)
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  readCollapseInput,
  readPt,
  type Bounds,
  type CollapseSetup,
  type Mat2,
  type Pt,
} from './algorithm.js';

export type CollapseStep =
  | { kind: 'start' }
  | { kind: 'move'; i: number; spot: number; count: number }
  | { kind: 'done'; points: number; spots: number; det: number };

export type CollapseScene = {
  matrix: Mat2;
  points: Pt[];
  setup: CollapseSetup | null;
  /** 도착한 점 번호 — 도착 차례 */
  arrived: number[];
  /** 자리마다 지금까지 온 점의 수 */
  counts: number[];
  step: CollapseStep | null;
};

function fail(msg: string): never {
  throw new Error(`determinantZeroCollapseScene: ${msg}`);
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) fail(`${event.type} 의 payload 가 객체가 아니다`);
  return p as Record<string, unknown>;
}

function readInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) fail(`${path} 는 정수여야 한다`);
  return v;
}

function readNum(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${path} 는 유한한 수여야 한다`);
  return v;
}

function readArray(v: unknown, path: string): unknown[] {
  if (!Array.isArray(v)) fail(`${path} 는 배열이어야 한다`);
  return v;
}

function readSetup(p: Record<string, unknown>, n: number): CollapseSetup {
  const images = readArray(p.images, 'init.images').map((q, i) => readPt(q, `init.images[${i}]`));
  if (images.length !== n) fail(`init.images 의 길이 ${images.length} 가 점 수 ${n} 와 다르다`);
  const spots = readArray(p.spots, 'init.spots').map((q, i) => readPt(q, `init.spots[${i}]`));
  if (spots.length === 0) fail('init.spots 가 비었다');
  const spotOf = readArray(p.spotOf, 'init.spotOf').map((v, i) => {
    const k = readInt(v, `init.spotOf[${i}]`);
    if (k < 0 || k >= spots.length) fail(`init.spotOf[${i}] = ${k} 가 자리 범위 밖이다`);
    return k;
  });
  if (spotOf.length !== n) fail(`init.spotOf 의 길이 ${spotOf.length} 가 점 수 ${n} 와 다르다`);
  const totals = readArray(p.totals, 'init.totals').map((v, i) => readInt(v, `init.totals[${i}]`));
  if (totals.length !== spots.length) fail('init.totals 의 길이가 자리 수와 다르다');
  const bRaw = p.bounds;
  if (typeof bRaw !== 'object' || bRaw === null) fail('init.bounds 가 객체가 아니다');
  const b = bRaw as Record<string, unknown>;
  const bounds: Bounds = {
    minX: readNum(b.minX, 'init.bounds.minX'),
    maxX: readNum(b.maxX, 'init.bounds.maxX'),
    minY: readNum(b.minY, 'init.bounds.minY'),
    maxY: readNum(b.maxY, 'init.bounds.maxY'),
  };
  return {
    images,
    spotOf,
    spots,
    totals,
    sourceSpots: readInt(p.sourceSpots, 'init.sourceSpots'),
    det: readNum(p.det, 'init.det'),
    line: readPt(p.line, 'init.line'),
    bounds,
  };
}

export const determinantZeroCollapseScene: ScenePlan<CollapseScene> = {
  initial(initialData: unknown): CollapseScene {
    const input = readCollapseInput(initialData);
    const [a, b, c, d] = input.matrix;
    return {
      matrix: [a, b, c, d],
      points: input.points.map((p) => [p[0], p[1]] as Pt),
      setup: null,
      arrived: [],
      counts: [],
      step: null,
    };
  },

  reduce(scene: CollapseScene, event: FacetRuntimeEvent): CollapseScene {
    switch (event.type) {
      case 'init': {
        if (scene.setup !== null) fail('init 이 두 번 왔다');
        const setup = readSetup(payloadOf(event), scene.points.length);
        return {
          ...scene,
          setup,
          arrived: [],
          counts: setup.spots.map(() => 0),
          step: { kind: 'start' },
        };
      }
      case 'move': {
        const setup = scene.setup;
        if (setup === null) fail('init 앞에 move 가 왔다');
        const p = payloadOf(event);
        const i = readInt(p.i, 'move.i');
        const spot = readInt(p.spot, 'move.spot');
        const count = readInt(p.count, 'move.count');
        if (i !== scene.arrived.length) fail(`move.i = ${i} — 다음 차례는 ${scene.arrived.length}`);
        if (setup.spotOf[i] !== spot) fail(`move.spot = ${spot} 가 바탕의 spotOf[${i}] 와 다르다`);
        const was = scene.counts[spot];
        if (was === undefined) fail(`move.spot = ${spot} 가 자리 범위 밖이다`);
        if (count !== was + 1) fail(`move.count = ${count} — 앞 장면의 수는 ${was}`);
        const counts = [...scene.counts];
        counts[spot] = count;
        return {
          ...scene,
          arrived: [...scene.arrived, i],
          counts,
          step: { kind: 'move', i, spot, count },
        };
      }
      case 'done': {
        const setup = scene.setup;
        if (setup === null) fail('init 앞에 done 이 왔다');
        const p = payloadOf(event);
        const points = readInt(p.points, 'done.points');
        const spots = readInt(p.spots, 'done.spots');
        const det = readNum(p.det, 'done.det');
        if (scene.arrived.length !== scene.points.length) fail('모든 점이 오기 전에 done 이 왔다');
        if (points !== scene.points.length) fail(`done.points = ${points} 가 점 수와 다르다`);
        if (spots !== setup.spots.length) fail(`done.spots = ${spots} 가 자리 수와 다르다`);
        if (det !== setup.det) fail(`done.det = ${det} 가 바탕의 행렬식과 다르다`);
        return { ...scene, step: { kind: 'done', points, spots, det } };
      }
      default:
        fail(`모르는 이벤트 ${event.type}`);
    }
  },
};
