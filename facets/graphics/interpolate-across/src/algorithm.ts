/**
 * 무게중심 보간 — 꼭짓점 셋의 색이 삼각형 안의 칸으로 번진다.
 *
 * 격자는 x 가 오른쪽, y 가 아래다. 열 c · 행 r 의 칸 중심은 (c + 0.5, r + 0.5).
 * 모서리 함수 E_ab(p) = (b.x − a.x)(p.y − a.y) − (b.y − a.y)(p.x − a.x),
 * 두 배 넓이 = E_AB(C). 칸의 몫은 λ_A = E_BC(p)/넓이 · λ_B = E_CA(p)/넓이 · λ_C = E_AB(p)/넓이.
 * 세 몫이 모두 양수인 칸이 안쪽이다. 중심이 모서리 위(E = 0)면 던진다 — top-left 규칙을 두지 않는다.
 *
 * 이벤트
 *   init   (silent) 바탕 — 두 배 넓이와 안쪽 칸. 칸의 색은 아직 붓지 않은 (0, 0, 0)
 *          payload: { area: number,
 *                     cells: { c: number; r: number; weights: [number, number, number];
 *                              color: [number, number, number] }[] }
 *   pour   꼭짓점 하나가 제 색을 몫만큼 모든 안쪽 칸에 더한다 (걸음 1..3)
 *          payload: { vertex: number,                       // 꼭짓점 차례 0..2
 *                     shares: number[],                     // 안쪽 칸 차례대로 그 꼭짓점의 몫
 *                     colors: [number, number, number][],   // 더한 뒤 칸의 색
 *                     strongest: number, faintest: number } // 몫이 가장 큰 · 작은 칸의 차례
 *   probe  칸 하나를 골라 세 몫과 섞인 색을 읽는다 (걸음 4)
 *          payload: { cell: number,                         // 안쪽 칸 차례
 *                     x: number, y: number,                 // 칸 중심
 *                     weights: [number, number, number],
 *                     color: [number, number, number],
 *                     sum: number }                         // 세 몫의 합
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Rgb = [number, number, number];

export type Vertex = { id: string; x: number; y: number; color: Rgb };

export type InterpolateAcrossFacetData = {
  type: 'interpolate-across';
  stepMs: number;
  width: number;
  height: number;
  vertices: [Vertex, Vertex, Vertex];
  probe: { c: number; r: number };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`interpolate-across: ${path} 는 유한한 수여야 한다`);
  return v;
}

function count(v: unknown, path: string): number {
  const n = finite(v, path);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`interpolate-across: ${path} 는 양의 정수여야 한다`);
  return n;
}

function narrowRgb(v: unknown, path: string): Rgb {
  if (!Array.isArray(v) || v.length !== 3) throw new Error(`interpolate-across: ${path} 는 수 셋이어야 한다`);
  const out = v.map((x, i) => finite(x, `${path}[${i}]`));
  for (const [i, x] of out.entries()) {
    if (x < 0 || x > 1) throw new Error(`interpolate-across: ${path}[${i}] 는 0..1 이어야 한다`);
  }
  return [out[0]!, out[1]!, out[2]!];
}

function narrowVertex(v: unknown, path: string): Vertex {
  if (!isRecord(v)) throw new Error(`interpolate-across: ${path} 가 객체가 아니다`);
  if (typeof v.id !== 'string' || v.id === '') throw new Error(`interpolate-across: ${path}.id 가 없다`);
  return { id: v.id, x: finite(v.x, `${path}.x`), y: finite(v.y, `${path}.y`), color: narrowRgb(v.color, `${path}.color`) };
}

/** 자료의 모양을 보고 어긋나면 던진다. 장면의 `initial` 도 이것을 부른다. */
export function narrowInterpolateAcrossData(raw: unknown): InterpolateAcrossFacetData {
  if (!isRecord(raw)) throw new Error('interpolate-across: 자료가 객체가 아니다');
  if (raw.type !== 'interpolate-across') throw new Error('interpolate-across: type 이 interpolate-across 가 아니다');
  const stepMs = count(raw.stepMs, 'stepMs');
  const width = count(raw.width, 'width');
  const height = count(raw.height, 'height');
  if (!Array.isArray(raw.vertices) || raw.vertices.length !== 3) {
    throw new Error('interpolate-across: vertices 는 꼭짓점 셋이어야 한다');
  }
  const vs = raw.vertices.map((v, i) => narrowVertex(v, `vertices[${i}]`));
  const vertices: [Vertex, Vertex, Vertex] = [vs[0]!, vs[1]!, vs[2]!];
  if (!isRecord(raw.probe)) throw new Error('interpolate-across: probe 가 없다');
  const pc = finite(raw.probe.c, 'probe.c');
  const pr = finite(raw.probe.r, 'probe.r');
  if (!Number.isInteger(pc) || !Number.isInteger(pr) || pc < 0 || pr < 0 || pc >= width || pr >= height) {
    throw new Error('interpolate-across: probe 가 격자 밖이다');
  }
  return { type: 'interpolate-across', stepMs, width, height, vertices, probe: { c: pc, r: pr } };
}

type Pt = { x: number; y: number };

/** 모서리 함수 E_ab(p). */
export function edgeFn(a: Pt, b: Pt, p: Pt): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

/**
 * 꼭짓점 k 의 몫이 `level` 인 곳 — 맞은편 모서리와 나란한 선분의 두 끝.
 * 두 끝은 k 에서 나가는 두 모서리 위에 있다 (level 1 이면 꼭짓점, 0 이면 맞은편 모서리).
 * 그림이 붓는 앞머리를 세울 때 부른다 — 바탕(꼭짓점)에서 정해지는 작은 셈이다.
 */
export function levelSegment(vertices: readonly Vertex[], k: number, level: number): [Pt, Pt] {
  const v = vertices[k];
  const a = vertices[(k + 1) % 3];
  const b = vertices[(k + 2) % 3];
  if (!v || !a || !b || vertices.length !== 3) throw new Error(`interpolate-across: 꼭짓점 ${k} 가 없다`);
  const s = 1 - level;
  return [
    { x: v.x + (a.x - v.x) * s, y: v.y + (a.y - v.y) * s },
    { x: v.x + (b.x - v.x) * s, y: v.y + (b.y - v.y) * s },
  ];
}

export async function interpolateAcross(context: FacetContext<InterpolateAcrossFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<InterpolateAcrossFacetData>;
  const data = narrowInterpolateAcrossData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const [A, B, C] = data.vertices;
  const area = edgeFn(A, B, C);
  if (area <= 0) throw new Error('interpolate-across: 꼭짓점 차례가 E_AB(C) > 0 이 아니다');

  type Cell = { c: number; r: number; weights: Rgb; color: Rgb };
  const cells: Cell[] = [];
  for (let r = 0; r < data.height; r += 1) {
    if (ctx.cancelled) return;
    for (let c = 0; c < data.width; c += 1) {
      if (ctx.cancelled) return;
      const p = { x: c + 0.5, y: r + 0.5 };
      const eBC = edgeFn(B, C, p);
      const eCA = edgeFn(C, A, p);
      const eAB = edgeFn(A, B, p);
      if (eBC === 0 || eCA === 0 || eAB === 0) {
        throw new Error(`interpolate-across: 칸 (${c}, ${r}) 의 중심이 모서리 위에 있다`);
      }
      if (eBC > 0 && eCA > 0 && eAB > 0) {
        cells.push({ c, r, weights: [eBC / area, eCA / area, eAB / area], color: [0, 0, 0] });
      }
    }
  }
  if (cells.length === 0) throw new Error('interpolate-across: 안쪽 칸이 없다');
  const probeIndex = cells.findIndex((cell) => cell.c === data.probe.c && cell.r === data.probe.r);
  if (probeIndex < 0) throw new Error('interpolate-across: 읽을 칸이 삼각형 밖이다');

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { area, cells: cells.map((cell) => ({ ...cell, weights: [...cell.weights], color: [...cell.color] })) },
  });

  const acc: Rgb[] = cells.map((cell) => [...cell.color]);
  for (const [k, vertex] of data.vertices.entries()) {
    if (!(await pause())) return;
    const shares = cells.map((cell) => cell.weights[k]!);
    for (const [i, share] of shares.entries()) {
      const was = acc[i]!;
      acc[i] = [was[0] + share * vertex.color[0], was[1] + share * vertex.color[1], was[2] + share * vertex.color[2]];
    }
    let strongest = 0;
    let faintest = 0;
    for (const [i, share] of shares.entries()) {
      if (share > shares[strongest]!) strongest = i;
      if (share < shares[faintest]!) faintest = i;
    }
    await ctx.emit({
      type: 'pour',
      payload: { vertex: k, shares, colors: acc.map((col) => [...col]), strongest, faintest },
    });
  }

  if (!(await pause())) return;
  const probe = cells[probeIndex]!;
  const w = probe.weights;
  await ctx.emit({
    type: 'probe',
    payload: {
      cell: probeIndex,
      x: probe.c + 0.5,
      y: probe.r + 0.5,
      weights: [...w],
      color: [...acc[probeIndex]!],
      sum: w[0] + w[1] + w[2],
    },
  });
}
