/**
 * 무게중심 보간의 장면.
 *
 * 바탕   격자 크기 · 꼭짓점 셋과 그 색 · 읽을 칸 (자료) + 안쪽 칸과 그 몫 (init)
 * 자취   칸마다 지금까지 부은 색 · 부은 꼭짓점 수
 * 이번 걸음  처음 · 한 꼭짓점의 붓기(붓기 전 색을 계기값으로) · 칸 하나 읽기
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { narrowInterpolateAcrossData, type Rgb, type Vertex } from './algorithm.js';

export type InsideCell = { c: number; r: number; weights: Rgb };

export type InterpolateAcrossStep =
  | { kind: 'start' }
  | { kind: 'pour'; vertex: number; shares: number[]; was: Rgb[]; strongest: number; faintest: number }
  | { kind: 'probe'; cell: number; x: number; y: number; weights: Rgb; color: Rgb; sum: number };

export type InterpolateAcrossScene = {
  width: number;
  height: number;
  vertices: Vertex[];
  probe: { c: number; r: number };
  /** init 전에는 null — 안쪽 칸은 알고리즘이 셈한다. */
  cells: InsideCell[] | null;
  colors: Rgb[] | null;
  poured: number;
  step: InterpolateAcrossStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`interpolateAcrossScene: ${path} 가 수가 아니다`);
  return v;
}

function index(v: unknown, length: number, path: string): number {
  const n = num(v, path);
  if (!Number.isInteger(n) || n < 0 || n >= length) throw new Error(`interpolateAcrossScene: ${path} 가 범위 밖이다`);
  return n;
}

function rgb(v: unknown, path: string): Rgb {
  if (!Array.isArray(v) || v.length !== 3) throw new Error(`interpolateAcrossScene: ${path} 는 수 셋이어야 한다`);
  return [num(v[0], `${path}[0]`), num(v[1], `${path}[1]`), num(v[2], `${path}[2]`)];
}

function numbers(v: unknown, length: number, path: string): number[] {
  if (!Array.isArray(v) || v.length !== length) throw new Error(`interpolateAcrossScene: ${path} 의 길이가 ${length} 가 아니다`);
  return v.map((x, i) => num(x, `${path}[${i}]`));
}

function needCells(scene: InterpolateAcrossScene, type: string): { cells: InsideCell[]; colors: Rgb[] } {
  if (!scene.cells || !scene.colors) throw new Error(`interpolateAcrossScene: ${type} 가 init 보다 먼저 왔다`);
  return { cells: scene.cells, colors: scene.colors };
}

export const interpolateAcrossScene: ScenePlan<InterpolateAcrossScene> = {
  initial(initialData: unknown): InterpolateAcrossScene {
    const data = narrowInterpolateAcrossData(initialData);
    return {
      width: data.width,
      height: data.height,
      vertices: data.vertices.map((v) => ({ id: v.id, x: v.x, y: v.y, color: [...v.color] as Rgb })),
      probe: { c: data.probe.c, r: data.probe.r },
      cells: null,
      colors: null,
      poured: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: InterpolateAcrossScene, event: FacetRuntimeEvent): InterpolateAcrossScene {
    const p = event.payload;
    if (!isRecord(p)) throw new Error(`interpolateAcrossScene: ${event.type} 의 payload 가 객체가 아니다`);
    switch (event.type) {
      case 'init': {
        num(p.area, 'init.area');
        if (!Array.isArray(p.cells) || p.cells.length === 0) throw new Error('interpolateAcrossScene: init.cells 가 비었다');
        const cells: InsideCell[] = [];
        const colors: Rgb[] = [];
        for (const [i, raw] of p.cells.entries()) {
          if (!isRecord(raw)) throw new Error(`interpolateAcrossScene: init.cells[${i}] 가 객체가 아니다`);
          const c = index(raw.c, scene.width, `init.cells[${i}].c`);
          const r = index(raw.r, scene.height, `init.cells[${i}].r`);
          cells.push({ c, r, weights: rgb(raw.weights, `init.cells[${i}].weights`) });
          colors.push(rgb(raw.color, `init.cells[${i}].color`));
        }
        return { ...scene, cells, colors, poured: 0, step: { kind: 'start' } };
      }
      case 'pour': {
        const { cells, colors } = needCells(scene, 'pour');
        const vertex = index(p.vertex, scene.vertices.length, 'pour.vertex');
        if (vertex !== scene.poured) throw new Error(`interpolateAcrossScene: pour.vertex ${vertex} 는 차례 ${scene.poured} 가 아니다`);
        const shares = numbers(p.shares, cells.length, 'pour.shares');
        if (!Array.isArray(p.colors) || p.colors.length !== cells.length) {
          throw new Error('interpolateAcrossScene: pour.colors 의 길이가 안쪽 칸 수와 다르다');
        }
        const next = p.colors.map((col, i) => rgb(col, `pour.colors[${i}]`));
        return {
          ...scene,
          colors: next,
          poured: scene.poured + 1,
          step: {
            kind: 'pour',
            vertex,
            shares,
            was: colors.map((col) => [...col] as Rgb),
            strongest: index(p.strongest, cells.length, 'pour.strongest'),
            faintest: index(p.faintest, cells.length, 'pour.faintest'),
          },
        };
      }
      case 'probe': {
        const { cells } = needCells(scene, 'probe');
        const cell = index(p.cell, cells.length, 'probe.cell');
        const at = cells[cell]!;
        if (at.c !== scene.probe.c || at.r !== scene.probe.r) {
          throw new Error('interpolateAcrossScene: probe.cell 이 자료의 읽을 칸이 아니다');
        }
        return {
          ...scene,
          step: {
            kind: 'probe',
            cell,
            x: num(p.x, 'probe.x'),
            y: num(p.y, 'probe.y'),
            weights: rgb(p.weights, 'probe.weights'),
            color: rgb(p.color, 'probe.color'),
            sum: num(p.sum, 'probe.sum'),
          },
        };
      }
      default:
        throw new Error(`interpolateAcrossScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
