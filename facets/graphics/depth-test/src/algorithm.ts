/**
 * depth-test 알고리즘 — 판 둘을 한 행씩 깊이 버퍼에 그린다.
 *
 * 판마다 차지하는 칸(직사각형)과 깊이 평면이 자료로 주어진다. 칸 (c, r) 의 깊이는 평면 식에
 * 픽셀 중심 (c + 0.5, r + 0.5) 을 넣은 값이다. 새 깊이가 버퍼 깊이보다 작을 때만 통과해 버퍼와
 * 색을 덮어쓰고, 아니면 버린다. 버퍼는 모든 칸이 `clear` 에서 시작한다.
 *
 * 발신 이벤트 (걸음 0 은 장면의 `initial` 이 자료에서 세운다 — 발신 없음):
 *
 * - `row` (silent 아님) — 한 판의 한 행을 시험한 결과. 걸음 하나.
 *   payload: {
 *     plate: string,              // 판 식별자 (자료의 plates[].id)
 *     row: number,                // 행 번호
 *     cells: Array<{
 *       col: number,              // 열 번호 — 판의 열 범위를 왼쪽부터 차례로
 *       depth: number,            // 이 판이 이 칸에 내놓은 깊이 (반올림하지 않은 값)
 *       was: number,              // 시험 앞 버퍼 깊이
 *       wasOwner: string | null,  // 시험 앞 그 칸을 차지한 판 (없으면 null)
 *       pass: boolean,            // depth < was 이면 참 — 덮어쓴다
 *     }>
 *   }
 *
 * `ctx.metric` 은 부르지 않는다. 겹친 칸의 깊이 차가 `TIE_GAP` 보다 가까우면 던진다 (같은 깊이는 모형 밖).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 판의 깊이 평면 — 깊이 = base + dx·x + dy·y (x · y 는 픽셀 좌표). */
export type DepthPlane = { base: number; dx: number; dy: number };

/** 판 하나 — 식별자 · 차지하는 칸(양끝 포함) · 깊이 평면 · 선형 색(0..1). */
export type Plate = {
  id: string;
  cols: [number, number];
  rows: [number, number];
  depth: DepthPlane;
  color: [number, number, number];
};

export type DepthTestFacetData = {
  type: 'depth-test';
  stepMs: number;
  /** 격자 열 수 · 행 수. */
  cols: number;
  rows: number;
  /** 버퍼가 시작하는 깊이 (아직 아무것도 없음). */
  clear: number;
  /** 그리는 차례대로. */
  plates: Plate[];
};

export type RowCell = {
  col: number;
  depth: number;
  was: number;
  wasOwner: string | null;
  pass: boolean;
};

/** 이보다 가까운 두 깊이는 견주지 않는다 — 같은 깊이는 모형에 없다. */
export const TIE_GAP = 0.02;

function fail(path: string, why: string): never {
  throw new Error(`depth-test: ${path} — ${why}`);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function int(v: unknown, path: string): number {
  const n = num(v, path);
  if (!Number.isInteger(n)) fail(path, '정수가 아니다');
  return n;
}

function span(v: unknown, path: string, limit: number): [number, number] {
  if (!Array.isArray(v) || v.length !== 2) fail(path, '[처음, 끝] 두 칸이 아니다');
  const lo = int(v[0], `${path}[0]`);
  const hi = int(v[1], `${path}[1]`);
  if (lo < 0 || hi >= limit || lo > hi) fail(path, `0..${limit - 1} 안의 오름차순 범위가 아니다`);
  return [lo, hi];
}

/** `ctx.data` 와 장면의 `initialData` 를 함께 좁힌다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowDepthTestData(raw: unknown): DepthTestFacetData {
  if (typeof raw !== 'object' || raw === null) fail('data', '객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'depth-test') fail('data.type', "'depth-test' 가 아니다");
  const stepMs = num(o.stepMs, 'data.stepMs');
  const cols = int(o.cols, 'data.cols');
  const rows = int(o.rows, 'data.rows');
  if (cols < 1 || rows < 1) fail('data.cols/rows', '1 보다 작다');
  const clear = num(o.clear, 'data.clear');
  if (!Array.isArray(o.plates) || o.plates.length === 0) fail('data.plates', '비어 있거나 배열이 아니다');
  const seen = new Set<string>();
  const plates = o.plates.map((p, i): Plate => {
    const path = `data.plates[${i}]`;
    if (typeof p !== 'object' || p === null) fail(path, '객체가 아니다');
    const q = p as Record<string, unknown>;
    if (typeof q.id !== 'string' || q.id === '') fail(`${path}.id`, '빈 식별자');
    if (seen.has(q.id)) fail(`${path}.id`, `식별자 ${q.id} 가 겹친다`);
    seen.add(q.id);
    const d = q.depth;
    if (typeof d !== 'object' || d === null) fail(`${path}.depth`, '객체가 아니다');
    const dd = d as Record<string, unknown>;
    const c = q.color;
    if (!Array.isArray(c) || c.length !== 3) fail(`${path}.color`, '세 성분이 아니다');
    const color = c.map((x, k) => {
      const v = num(x, `${path}.color[${k}]`);
      if (v < 0 || v > 1) fail(`${path}.color[${k}]`, '0..1 밖');
      return v;
    }) as [number, number, number];
    return {
      id: q.id,
      cols: span(q.cols, `${path}.cols`, cols),
      rows: span(q.rows, `${path}.rows`, rows),
      depth: {
        base: num(dd.base, `${path}.depth.base`),
        dx: num(dd.dx, `${path}.depth.dx`),
        dy: num(dd.dy, `${path}.depth.dy`),
      },
      color,
    };
  });
  return { type: 'depth-test', stepMs, cols, rows, clear, plates };
}

/** 칸 (c, r) 에서 판의 깊이 — 픽셀 중심 (c + 0.5, r + 0.5) 을 평면 식에 넣는다. */
export function plateDepth(plate: Plate, col: number, row: number): number {
  const z = plate.depth.base + plate.depth.dx * (col + 0.5) + plate.depth.dy * (row + 0.5);
  if (!(z > 0 && z < 1)) fail(`plate ${plate.id} (${col}, ${row})`, `깊이 ${z} 가 0..1 밖`);
  return z;
}

export async function depthTest(ctxBase: FacetContext<DepthTestFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<DepthTestFacetData>;
  const data = narrowDepthTestData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const buffer: number[][] = [];
  const owner: (string | null)[][] = [];
  for (let r = 0; r < data.rows; r += 1) {
    if (ctx.cancelled) return;
    buffer.push(new Array<number>(data.cols).fill(data.clear));
    owner.push(new Array<string | null>(data.cols).fill(null));
  }

  for (const plate of data.plates) {
    if (ctx.cancelled) return;
    for (let r = plate.rows[0]; r <= plate.rows[1]; r += 1) {
      // 걸음 0 은 빈 버퍼를 읽는 화면이라 첫 발신 앞에도 머문다
      if (!(await pause())) return;
      const bufRow = buffer[r];
      const ownRow = owner[r];
      if (!bufRow || !ownRow) fail(`plate ${plate.id} row ${r}`, '격자 밖');
      const cells: RowCell[] = [];
      for (let c = plate.cols[0]; c <= plate.cols[1]; c += 1) {
        if (ctx.cancelled) return;
        const depth = plateDepth(plate, c, r);
        const was = bufRow[c];
        const wasOwner = ownRow[c];
        if (was === undefined || wasOwner === undefined) fail(`plate ${plate.id} (${c}, ${r})`, '격자 밖');
        if (Math.abs(depth - was) < TIE_GAP) {
          fail(`plate ${plate.id} (${c}, ${r})`, `깊이 ${depth} 와 버퍼 ${was} 가 ${TIE_GAP} 보다 가깝다`);
        }
        const pass = depth < was;
        if (pass) {
          bufRow[c] = depth;
          ownRow[c] = plate.id;
        }
        cells.push({ col: c, depth, was, wasOwner, pass });
      }
      await ctx.emit({ type: 'row', payload: { plate: plate.id, row: r, cells } });
    }
  }
}
