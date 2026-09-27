/**
 * shootRayPerPixel 의 장면.
 *
 * - 바탕 `base` — 격자 · 눈 · 화면 판 · 공 · 바탕 색. initial() 이 자료에서 베낀다
 * - 자취 `filled` — 지금까지 나간 줄들. 줄마다 칸 여덟의 광선 방향과 답
 * - 이번 걸음 `step` — 처음인가, 어느 줄이 방금 나갔는가
 *
 * 셈(방향 · 교차)은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowShootRayData, type RayCell, type ShootRayPerPixelFacetData, type Vec3 } from './algorithm.js';

export type ShootRayBase = Omit<ShootRayPerPixelFacetData, 'type' | 'stepMs'>;

export type ShootRayRow = { row: number; cells: readonly RayCell[] };

export type ShootRayStep = { kind: 'start' } | { kind: 'row'; row: number };

export type ShootRayScene = {
  base: ShootRayBase;
  filled: readonly ShootRayRow[];
  step: ShootRayStep;
};

function fail(path: string, why: string): never {
  throw new Error(`shootRayPerPixelScene: ${path} — ${why}`);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function vec(v: unknown, path: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) fail(path, '수 셋이 아니다');
  return [num(v[0], `${path}[0]`), num(v[1], `${path}[1]`), num(v[2], `${path}[2]`)];
}

function readCell(v: unknown, base: ShootRayBase, col: number, path: string): RayCell {
  if (typeof v !== 'object' || v === null) fail(path, '객체가 아니다');
  const c = v as Record<string, unknown>;
  if (c.col !== col) fail(`${path}.col`, `열 ${col} 자리에 ${String(c.col)} 이 왔다`);
  const dir = vec(c.dir, `${path}.dir`);
  const hitId = c.hitId;
  const tHit = c.tHit;
  if (hitId === null) {
    if (tHit !== null) fail(`${path}.tHit`, '맞은 것이 없는데 t 가 있다');
    return { col, dir, hitId: null, tHit: null };
  }
  if (typeof hitId !== 'string') fail(`${path}.hitId`, '식별자가 아니다');
  if (hitId !== base.sphere.id) fail(`${path}.hitId`, `장면에 없는 물체 ${hitId}`);
  const t = num(tHit, `${path}.tHit`);
  if (t <= 0) fail(`${path}.tHit`, '맞은 t 가 양수가 아니다');
  return { col, dir, hitId, tHit: t };
}

export const shootRayPerPixelScene: ScenePlan<ShootRayScene> = {
  initial(initialData: unknown): ShootRayScene {
    const d = narrowShootRayData(initialData);
    return {
      base: {
        cols: d.cols,
        rows: d.rows,
        eye: [...d.eye],
        plane: { ...d.plane },
        sphere: {
          id: d.sphere.id,
          center: [...d.sphere.center],
          radius: d.sphere.radius,
          color: [...d.sphere.color],
        },
        background: [...d.background],
      },
      filled: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: ShootRayScene, event: FacetRuntimeEvent): ShootRayScene {
    switch (event.type) {
      case 'row': {
        const p = event.payload;
        if (typeof p !== 'object' || p === null) fail('row.payload', '객체가 아니다');
        const { row, cells } = p as { row?: unknown; cells?: unknown };
        const j = num(row, 'row.payload.row');
        // 줄은 위에서 아래로 하나씩 — 다음 줄이 아니면 어휘가 어긋났다
        if (j !== scene.filled.length) fail('row.payload.row', `다음 줄은 ${scene.filled.length} 인데 ${j} 이 왔다`);
        if (j >= scene.base.rows) fail('row.payload.row', `줄 ${j} 이 격자 밖이다`);
        if (!Array.isArray(cells)) fail('row.payload.cells', '배열이 아니다');
        if (cells.length !== scene.base.cols) {
          fail('row.payload.cells', `칸 ${scene.base.cols} 에 광선 ${cells.length} — 칸마다 광선 하나여야 한다`);
        }
        const read = cells.map((c, i) => readCell(c, scene.base, i, `row.payload.cells[${i}]`));
        return {
          base: scene.base,
          filled: [...scene.filled, { row: j, cells: read }],
          step: { kind: 'row', row: j },
        };
      }
      default:
        fail('event.type', `모르는 이벤트 ${event.type}`);
    }
  },
};
