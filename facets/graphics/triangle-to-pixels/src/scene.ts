/**
 * triangle-to-pixels 의 장면.
 *
 * 바탕: 격자 크기 · 꼭짓점 셋 (initialData) · 두 배 넓이 (silent init)
 * 자취: 훑은 행들의 결과 (행 차례)
 * 이번 걸음: 처음 · 어느 행
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { EDGE_IDS, narrowTriangleToPixelsData } from './algorithm.js';
import type { CellOutcome, EdgeId, Vertex } from './algorithm.js';

export interface RowOutcome {
  row: number;
  cells: CellOutcome[];
  from: number | null;
  to: number | null;
  count: number;
  total: number;
}

export type TriangleToPixelsStep = { kind: 'start' } | { kind: 'row'; row: number };

export interface TriangleToPixelsScene {
  cols: number;
  rows: number;
  vertices: Vertex[];
  /** 두 배 넓이 E_AB(C). init 전에는 아직 셈하지 않았다 — null. */
  area2: number | null;
  scanned: RowOutcome[];
  step: TriangleToPixelsStep;
}

function bad(path: string, why: string): never {
  throw new Error(`triangleToPixelsScene: ${path} — ${why}`);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(path, '수가 아니다');
  return v;
}

function intOrNull(v: unknown, path: string): number | null {
  if (v === null) return null;
  const n = num(v, path);
  if (!Number.isInteger(n)) bad(path, '정수가 아니다');
  return n;
}

function isEdgeId(v: unknown): v is EdgeId {
  return typeof v === 'string' && (EDGE_IDS as readonly string[]).includes(v);
}

function readCells(v: unknown, cols: number, path: string): CellOutcome[] {
  if (!Array.isArray(v) || v.length !== cols) bad(path, `칸 ${cols} 개의 배열이어야 한다`);
  return v.map((c: unknown, i: number): CellOutcome => {
    if (typeof c !== 'object' || c === null) bad(`${path}[${i}]`, '객체가 아니다');
    const o = c as Record<string, unknown>;
    if (o.col !== i) bad(`${path}[${i}].col`, `${i} 여야 한다`);
    if (typeof o.inside !== 'boolean') bad(`${path}[${i}].inside`, '참거짓이 아니다');
    if (!Array.isArray(o.fails) || !o.fails.every(isEdgeId)) bad(`${path}[${i}].fails`, '모서리 이름 배열이 아니다');
    const fails: EdgeId[] = [...o.fails];
    if (o.inside !== (fails.length === 0)) bad(`${path}[${i}]`, 'inside 와 fails 가 어긋난다');
    return { col: i, inside: o.inside, fails };
  });
}

export const triangleToPixelsScene: ScenePlan<TriangleToPixelsScene> = {
  initial(initialData: unknown): TriangleToPixelsScene {
    const d = narrowTriangleToPixelsData(initialData);
    return {
      cols: d.cols,
      rows: d.rows,
      vertices: d.vertices.map((v) => ({ ...v })),
      area2: null,
      scanned: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: TriangleToPixelsScene, event: FacetRuntimeEvent): TriangleToPixelsScene {
    const p = event.payload;
    if (typeof p !== 'object' || p === null) bad(`${event.type}.payload`, '객체가 아니다');
    const o = p as Record<string, unknown>;
    switch (event.type) {
      case 'init': {
        const area2 = num(o.area2, 'init.payload.area2');
        if (!(area2 > 0)) bad('init.payload.area2', '양수여야 한다');
        return { ...scene, area2, scanned: [], step: { kind: 'start' } };
      }
      case 'row': {
        const row = intOrNull(o.row, 'row.payload.row');
        if (row === null) bad('row.payload.row', '없다');
        if (row !== scene.scanned.length) bad('row.payload.row', `다음 행은 ${scene.scanned.length} 이다`);
        if (row >= scene.rows) bad('row.payload.row', '격자 밖이다');
        const cells = readCells(o.cells, scene.cols, 'row.payload.cells');
        const from = intOrNull(o.from, 'row.payload.from');
        const to = intOrNull(o.to, 'row.payload.to');
        const count = num(o.count, 'row.payload.count');
        const total = num(o.total, 'row.payload.total');
        const inside = cells.filter((c) => c.inside).length;
        if (inside !== count) bad('row.payload.count', `칠한 칸 ${inside} 과 어긋난다`);
        if ((count === 0) !== (from === null || to === null)) bad('row.payload.from', '토막 끝과 칸 수가 어긋난다');
        const before = scene.scanned.length > 0 ? scene.scanned[scene.scanned.length - 1].total : 0;
        if (total !== before + count) bad('row.payload.total', `앞 누적 ${before} 에 ${count} 를 더한 값이 아니다`);
        const outcome: RowOutcome = { row, cells, from, to, count, total };
        return { ...scene, scanned: [...scene.scanned, outcome], step: { kind: 'row', row } };
      }
      default:
        bad('event.type', `모르는 이벤트 '${event.type}'`);
    }
  },
};
