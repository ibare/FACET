/**
 * triangle-to-pixels — 삼각형이 픽셀 격자에서 어느 칸들을 차지하는가.
 *
 * 격자를 위에서 아래로 한 행씩 훑는다. 칸 (열 c, 행 r) 의 중심 (c + 0.5, r + 0.5) 에서
 * 모서리 함수 셋 E_BC · E_CA · E_AB 를 셈해 모두 양수인 칸만 칠한다.
 * E_ab(p) = (b.x − a.x)(p.y − a.y) − (b.y − a.y)(p.x − a.x). 좌표계는 x 오른쪽 · y 아래.
 *
 * 이벤트
 *   init  (silent) payload { area2: number }
 *         — 두 배 넓이 E_AB(C). 양수여야 한다(꼭짓점 차례가 이 부호를 정한다)
 *   row           payload { row: number; cells: Array<{ col: number; inside: boolean; fails: EdgeId[] }>;
 *                           from: number | null; to: number | null; count: number; total: number }
 *         — 한 행을 훑은 결과. fails 는 그 중심에서 E 가 음수인 모서리들(안이면 빈 배열).
 *           from..to 는 칠한 칸이 이어진 토막의 양 끝(없으면 null), count 는 그 행의 칸 수, total 은 누적
 *
 * 셈할 수 없는 상태는 던진다: 두 배 넓이가 0 이하 · 중심이 모서리 위(E = 0) · 한 행의 칠한 칸이 이어지지 않음.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type EdgeId = 'BC' | 'CA' | 'AB';
export type VertexId = 'A' | 'B' | 'C';

export interface Vertex {
  id: VertexId;
  x: number;
  y: number;
}

export interface TriangleToPixelsFacetData {
  type: 'triangle-to-pixels';
  stepMs: number;
  cols: number;
  rows: number;
  vertices: Vertex[];
}

export interface CellOutcome {
  col: number;
  inside: boolean;
  fails: EdgeId[];
}

export const EDGE_IDS: readonly EdgeId[] = ['BC', 'CA', 'AB'];
const VERTEX_IDS: readonly VertexId[] = ['A', 'B', 'C'];

function fail(path: string, why: string): never {
  throw new Error(`triangle-to-pixels: ${path} — ${why}`);
}

function positiveInt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) fail(path, '양의 정수여야 한다');
  return v;
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수여야 한다');
  return v;
}

/** 자료 좁히개 — 알고리즘 · 장면 · 그림이 함께 쓴다. 값을 베껴 새 객체로 돌려준다. */
export function narrowTriangleToPixelsData(raw: unknown): TriangleToPixelsFacetData {
  if (typeof raw !== 'object' || raw === null) fail('data', '객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'triangle-to-pixels') fail('data.type', "'triangle-to-pixels' 가 아니다");
  const stepMs = finite(d.stepMs, 'data.stepMs');
  if (stepMs <= 0) fail('data.stepMs', '양수여야 한다');
  const cols = positiveInt(d.cols, 'data.cols');
  const rows = positiveInt(d.rows, 'data.rows');
  if (!Array.isArray(d.vertices) || d.vertices.length !== 3) fail('data.vertices', '꼭짓점 셋이어야 한다');
  const vertices = d.vertices.map((v: unknown, i: number): Vertex => {
    if (typeof v !== 'object' || v === null) fail(`data.vertices[${i}]`, '객체가 아니다');
    const o = v as Record<string, unknown>;
    const id = VERTEX_IDS[i];
    if (o.id !== id) fail(`data.vertices[${i}].id`, `'${id}' 여야 한다`);
    return { id, x: finite(o.x, `data.vertices[${i}].x`), y: finite(o.y, `data.vertices[${i}].y`) };
  });
  return { type: 'triangle-to-pixels', stepMs, cols, rows, vertices };
}

/** 모서리 함수 E_ab(p). */
export function edgeValue(a: Vertex, b: Vertex, px: number, py: number): number {
  return (b.x - a.x) * (py - a.y) - (b.y - a.y) * (px - a.x);
}

function vertexOf(vertices: Vertex[], id: VertexId): Vertex {
  const v = vertices.find((x) => x.id === id);
  if (v === undefined) fail(`vertices.${id}`, '없다');
  return v;
}

/** 모서리 이름 → 그 모서리의 두 끝 (E_BC 는 B 에서 C 로). 그림도 선을 그을 때 부른다. */
export function edgeEnds(vertices: Vertex[], edge: EdgeId): [Vertex, Vertex] {
  const a = edge[0] as VertexId;
  const b = edge[1] as VertexId;
  return [vertexOf(vertices, a), vertexOf(vertices, b)];
}

export async function triangleToPixels(ctx: FacetContext<TriangleToPixelsFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<TriangleToPixelsFacetData>;
  const data = narrowTriangleToPixelsData(rctx.data);
  const { cols, rows, vertices, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const [ea, eb] = edgeEnds(vertices, 'AB');
  const area2 = edgeValue(ea, eb, vertexOf(vertices, 'C').x, vertexOf(vertices, 'C').y);
  if (!(area2 > 0)) fail('vertices', `두 배 넓이 E_AB(C) = ${area2} — 양수여야 한다`);

  await rctx.emit({ type: 'init', payload: { area2 }, silent: true });

  let total = 0;
  for (let row = 0; row < rows; row += 1) {
    // 걸음 0(빈 격자와 삼각형)을 읽을 틈을 먼저 둔다
    if (!(await pause())) return;
    const py = row + 0.5;
    const cells: CellOutcome[] = [];
    for (let col = 0; col < cols; col += 1) {
      const px = col + 0.5;
      const fails: EdgeId[] = [];
      for (const edge of EDGE_IDS) {
        const [a, b] = edgeEnds(vertices, edge);
        const e = edgeValue(a, b, px, py);
        if (e === 0) fail(`cell(${col}, ${row})`, `중심이 모서리 ${edge} 위에 있다 (E = 0)`);
        if (e < 0) fails.push(edge);
      }
      cells.push({ col, inside: fails.length === 0, fails });
    }
    const filled = cells.filter((c) => c.inside).map((c) => c.col);
    const count = filled.length;
    const from = count > 0 ? filled[0] : null;
    const to = count > 0 ? filled[count - 1] : null;
    if (from !== null && to !== null && to - from + 1 !== count) {
      fail(`row ${row}`, '칠한 칸이 이어진 한 토막이 아니다');
    }
    total += count;
    await rctx.emit({ type: 'row', payload: { row, cells, from, to, count, total } });
  }
}
