/**
 * depth-test 장면 — 깊이 버퍼와 그 칸을 차지한 판, 그리고 이번에 들어온 한 행.
 *
 * 바탕: 격자 크기 · 판의 식별자와 색 (자료에서 베낀다)
 * 자취: 칸마다 버퍼 깊이 · 차지한 판 (걸음이 쌓는다)
 * 이번 걸음: 들어온 판 · 행 · 칸마다의 시험 결과 (시험 앞 값을 함께 싣는다)
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowDepthTestData } from './algorithm.js';

export type ScenePlate = { id: string; color: [number, number, number] };

export type SceneCell = {
  col: number;
  depth: number;
  was: number;
  wasOwner: string | null;
  pass: boolean;
};

export type DepthTestStep = {
  plate: string;
  row: number;
  cells: SceneCell[];
  wrote: number;
  over: number;
  rejected: number;
};

export type DepthTestScene = {
  cols: number;
  rows: number;
  /** 버퍼가 시작한 깊이 (아직 아무것도 없음). */
  clear: number;
  plates: ScenePlate[];
  /** 행 우선 — depth[r][c]. */
  depth: number[][];
  owner: (string | null)[][];
  step: DepthTestStep | null;
};

function fail(path: string, why: string): never {
  throw new Error(`depthTestScene: ${path} — ${why}`);
}

function field(o: Record<string, unknown>, key: string, path: string): unknown {
  if (!(key in o)) fail(`${path}.${key}`, '없다');
  return o[key];
}

function readNum(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function readCell(raw: unknown, path: string, plateIds: Set<string>): SceneCell {
  if (typeof raw !== 'object' || raw === null) fail(path, '객체가 아니다');
  const o = raw as Record<string, unknown>;
  const col = readNum(field(o, 'col', path), `${path}.col`);
  const depth = readNum(field(o, 'depth', path), `${path}.depth`);
  const was = readNum(field(o, 'was', path), `${path}.was`);
  const wasOwnerRaw = field(o, 'wasOwner', path);
  let wasOwner: string | null;
  if (wasOwnerRaw === null) wasOwner = null;
  else if (typeof wasOwnerRaw === 'string' && plateIds.has(wasOwnerRaw)) wasOwner = wasOwnerRaw;
  else fail(`${path}.wasOwner`, '판 식별자도 null 도 아니다');
  const pass = field(o, 'pass', path);
  if (typeof pass !== 'boolean') fail(`${path}.pass`, '참거짓이 아니다');
  return { col, depth, was, wasOwner, pass };
}

function applyRow(scene: DepthTestScene, payload: unknown): DepthTestScene {
  if (typeof payload !== 'object' || payload === null) fail('row.payload', '객체가 아니다');
  const p = payload as Record<string, unknown>;
  const plateIds = new Set(scene.plates.map((q) => q.id));
  const plate = field(p, 'plate', 'row.payload');
  if (typeof plate !== 'string' || !plateIds.has(plate)) fail('row.payload.plate', `바탕에 없는 판 ${String(plate)}`);
  const row = readNum(field(p, 'row', 'row.payload'), 'row.payload.row');
  const depthRow = scene.depth[row];
  const ownerRow = scene.owner[row];
  if (!Number.isInteger(row) || !depthRow || !ownerRow) fail('row.payload.row', `격자에 없는 행 ${row}`);
  const cellsRaw = field(p, 'cells', 'row.payload');
  if (!Array.isArray(cellsRaw) || cellsRaw.length === 0) fail('row.payload.cells', '비어 있거나 배열이 아니다');

  const nextDepth = depthRow.slice();
  const nextOwner = ownerRow.slice();
  const cells: SceneCell[] = [];
  let wrote = 0;
  let over = 0;
  let rejected = 0;
  cellsRaw.forEach((raw, i) => {
    const path = `row.payload.cells[${i}]`;
    const cell = readCell(raw, path, plateIds);
    const nowDepth = depthRow[cell.col];
    const nowOwner = ownerRow[cell.col];
    if (!Number.isInteger(cell.col) || nowDepth === undefined || nowOwner === undefined) {
      fail(`${path}.col`, `격자에 없는 열 ${cell.col}`);
    }
    // 이벤트가 말하는 시험 앞 값이 지금 장면의 값과 같아야 한다
    if (cell.was !== nowDepth) fail(`${path}.was`, `장면의 깊이 ${nowDepth} 와 다르다`);
    if (cell.wasOwner !== nowOwner) fail(`${path}.wasOwner`, `장면의 판 ${String(nowOwner)} 와 다르다`);
    if (cell.pass) {
      nextDepth[cell.col] = cell.depth;
      nextOwner[cell.col] = plate;
      wrote += 1;
      if (cell.wasOwner !== null) over += 1;
    } else {
      rejected += 1;
    }
    cells.push(cell);
  });

  const depth = scene.depth.map((r, i) => (i === row ? nextDepth : r.slice()));
  const owner = scene.owner.map((r, i) => (i === row ? nextOwner : r.slice()));
  return {
    cols: scene.cols,
    rows: scene.rows,
    clear: scene.clear,
    plates: scene.plates.map((q) => ({ id: q.id, color: [q.color[0], q.color[1], q.color[2]] })),
    depth,
    owner,
    step: { plate, row, cells, wrote, over, rejected },
  };
}

export const depthTestScene: ScenePlan<DepthTestScene> = {
  initial(initialData: unknown): DepthTestScene {
    const data = narrowDepthTestData(initialData);
    const depth: number[][] = [];
    const owner: (string | null)[][] = [];
    for (let r = 0; r < data.rows; r += 1) {
      depth.push(new Array<number>(data.cols).fill(data.clear));
      owner.push(new Array<string | null>(data.cols).fill(null));
    }
    return {
      cols: data.cols,
      rows: data.rows,
      clear: data.clear,
      plates: data.plates.map((q) => ({ id: q.id, color: [q.color[0], q.color[1], q.color[2]] })),
      depth,
      owner,
      step: null,
    };
  },

  reduce(scene: DepthTestScene, event: FacetRuntimeEvent): DepthTestScene {
    switch (event.type) {
      case 'row':
        return applyRow(scene, event.payload);
      default:
        throw new Error(`depthTestScene: 모르는 이벤트 ${event.type}`);
    }
  },
};
