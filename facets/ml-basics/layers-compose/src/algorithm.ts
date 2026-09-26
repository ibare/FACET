/**
 * layers-compose — 곧은 선만 긋는 단위들을 겹치면 어떻게 굽은 경계가 나오는가.
 *
 * 입력 평면 x = (x1, x2) ∈ [−box, box]². 첫 층 단위 j 는 hⱼ = max(0, aⱼ·x1 + bⱼ·x2 + dⱼ) (ReLU),
 * 둘째 층은 o = c + Σ vⱼ·hⱼ 이고 o > 0 이면 켜짐. 걸음 k 는 둘째 층의 합에 단위 1..k 까지 든 모습이다.
 * 경계(o = 0)는 켜짐 무늬가 같은 영역마다 곧은 선분이라, 영역마다 반평면으로 잘라 그 안에서 o = 0 을 자른다.
 * 망은 앞으로 셈만 한다 — 무게는 주어진 그대로다.
 *
 * 이벤트 (발신 순서):
 *   init  silent  payload { hinges: Pt[][], start: Snapshot }
 *                 hinges[j] = 단위 j+1 의 꺾임선(aⱼ·x1 + bⱼ·x2 + dⱼ = 0)을 평면으로 자른 두 끝.
 *                 start = 합에 단위가 없는(o = c) 모습. 걸음 0 을 채운다.
 *   add           payload { unit: number, shape: Snapshot, frames: Snapshot[] }
 *                 unit = 이번에 합에 더한 단위 번호(1 부터). shape = 더한 뒤 모습.
 *                 frames = 그 단위의 무게를 0 에서 vⱼ 까지 고르게 키운 모습들(처음 = 앞 모습, 끝 = shape).
 *
 * Snapshot = { lines: Pt[][], corners: Pt[], on: Pt[][], probeO: number[] }
 *   lines   = 경계 꺾은선들(왼쪽 끝부터). corners = 방향이 바뀌는 이음점(평면 가장자리에서 잘린 끝은 아니다).
 *   on      = 켜진 쪽(o > 0) 다각형들. probeO = 고정된 짚는 자리마다의 o.
 * Pt = [x1, x2]
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Pt = readonly [number, number];

export type LayersUnit = { a: number; b: number; d: number; v: number };

export type LayersComposeFacetData = {
  type: 'layers-compose';
  stepMs: number;
  /** 입력 평면의 반폭 — 평면은 [−box, box]² */
  box: number;
  /** 둘째 층의 치우침 */
  c: number;
  units: LayersUnit[];
  /** 값을 짚어 볼 고정 자리 */
  probes: Pt[];
};

export type Snapshot = {
  lines: Pt[][];
  corners: Pt[];
  on: Pt[][];
  probeO: number[];
};

/** 한 걸음 운동을 이루는 모습 수 − 1 (무게를 이만큼 나누어 키운다) */
export const MORPH_DIVISIONS = 20;

const EPS = 1e-9;

function finite(x: unknown, path: string): number {
  if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`layers-compose: ${path} 가 유한한 수가 아니다`);
  return x;
}

function record(x: unknown, path: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) throw new Error(`layers-compose: ${path} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}

function list(x: unknown, path: string): unknown[] {
  if (!Array.isArray(x)) throw new Error(`layers-compose: ${path} 가 배열이 아니다`);
  return x;
}

export function narrowPt(x: unknown, path: string): Pt {
  const arr = list(x, path);
  if (arr.length !== 2) throw new Error(`layers-compose: ${path} 는 [x1, x2] 여야 한다`);
  return [finite(arr[0], `${path}[0]`), finite(arr[1], `${path}[1]`)];
}

function narrowPts(x: unknown, path: string): Pt[] {
  return list(x, path).map((p, i) => narrowPt(p, `${path}[${i}]`));
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 쓴다 */
export function narrowLayersComposeData(raw: unknown): LayersComposeFacetData {
  const r = record(raw, 'data');
  if (r.type !== 'layers-compose') throw new Error('layers-compose: data.type 이 layers-compose 가 아니다');
  const stepMs = finite(r.stepMs, 'data.stepMs');
  const box = finite(r.box, 'data.box');
  if (box <= 0) throw new Error('layers-compose: data.box 는 양수여야 한다');
  const c = finite(r.c, 'data.c');
  const units = list(r.units, 'data.units').map((u, i) => {
    const o = record(u, `data.units[${i}]`);
    const unit = {
      a: finite(o.a, `data.units[${i}].a`),
      b: finite(o.b, `data.units[${i}].b`),
      d: finite(o.d, `data.units[${i}].d`),
      v: finite(o.v, `data.units[${i}].v`),
    };
    if (Math.abs(unit.a) < EPS && Math.abs(unit.b) < EPS) {
      throw new Error(`layers-compose: data.units[${i}] 의 a · b 가 모두 0 이라 꺾임선이 없다`);
    }
    return unit;
  });
  if (units.length === 0) throw new Error('layers-compose: data.units 가 비었다');
  const probes = narrowPts(r.probes, 'data.probes');
  return { type: 'layers-compose', stepMs, box, c, units, probes };
}

/** 모습 좁히개 — 장면이 payload 를 받을 때 */
export function narrowSnapshot(x: unknown, path: string): Snapshot {
  const r = record(x, path);
  return {
    lines: list(r.lines, `${path}.lines`).map((l, i) => narrowPts(l, `${path}.lines[${i}]`)),
    corners: narrowPts(r.corners, `${path}.corners`),
    on: list(r.on, `${path}.on`).map((l, i) => narrowPts(l, `${path}.on[${i}]`)),
    probeO: list(r.probeO, `${path}.probeO`).map((v, i) => finite(v, `${path}.probeO[${i}]`)),
  };
}

export function narrowHinges(x: unknown, path: string): Pt[][] {
  return list(x, path).map((l, i) => {
    const pts = narrowPts(l, `${path}[${i}]`);
    if (pts.length !== 2) throw new Error(`layers-compose: ${path}[${i}] 는 두 끝이어야 한다`);
    return pts;
  });
}

// ─── 셈 ──────────────────────────────────────────────────────────────

type Term = { a: number; b: number; d: number; w: number };

function tidy(x: number): number {
  const r = Math.round(x * 1e9) / 1e9;
  return r === 0 ? 0 : r;
}

function square(box: number): Pt[] {
  return [
    [-box, -box],
    [box, -box],
    [box, box],
    [-box, box],
  ];
}

/** a·x1 + b·x2 + c ≥ 0 쪽만 남긴다 */
function clipHalf(poly: Pt[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const P = poly[i];
    const Q = poly[(i + 1) % n];
    const fp = a * P[0] + b * P[1] + c;
    const fq = a * Q[0] + b * Q[1] + c;
    if (fp >= 0) out.push(P);
    if (fp >= 0 !== fq >= 0) {
      const s = fp / (fp - fq);
      out.push([P[0] + s * (Q[0] - P[0]), P[1] + s * (Q[1] - P[1])]);
    }
  }
  return out;
}

function area(p: Pt[]): number {
  let s = 0;
  for (let i = 0; i < p.length; i += 1) {
    const P = p[i];
    const Q = p[(i + 1) % p.length];
    s += P[0] * Q[1] - Q[0] * P[1];
  }
  return Math.abs(s) / 2;
}

/** 다각형 안에서 A·x1 + B·x2 + C = 0 이 지나는 자리 (부호가 바뀌는 변만 — 가장자리에 붙은 0 은 세지 않는다) */
function crossings(poly: Pt[], A: number, B: number, C: number): Pt[] {
  const seen = new Map<string, Pt>();
  const n = poly.length;
  for (let i = 0; i < n; i += 1) {
    const P = poly[i];
    const Q = poly[(i + 1) % n];
    const fp = A * P[0] + B * P[1] + C;
    const fq = A * Q[0] + B * Q[1] + C;
    if (fp > 0 !== fq > 0) {
      const s = fp / (fp - fq);
      const pt: Pt = [tidy(P[0] + s * (Q[0] - P[0])), tidy(P[1] + s * (Q[1] - P[1]))];
      seen.set(`${pt[0]},${pt[1]}`, pt);
    }
  }
  return [...seen.values()].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

function same(p: Pt, q: Pt): boolean {
  return p[0] === q[0] && p[1] === q[1];
}

/** 선분들을 이음점으로 이어 꺾은선들로 */
function chain(segs: Pt[][]): Pt[][] {
  const rest = segs.map((s) => [...s]);
  const lines: Pt[][] = [];
  while (rest.length > 0) {
    const first = rest.shift();
    if (first === undefined) throw new Error('layers-compose: 이을 선분이 없다');
    const line: Pt[] = first;
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < rest.length; i += 1) {
        const [p, q] = rest[i];
        const head = line[0];
        const tail = line[line.length - 1];
        if (same(p, tail)) line.push(q);
        else if (same(q, tail)) line.push(p);
        else if (same(q, head)) line.unshift(p);
        else if (same(p, head)) line.unshift(q);
        else continue;
        rest.splice(i, 1);
        grew = true;
        break;
      }
    }
    const a = line[0];
    const z = line[line.length - 1];
    if (a[0] > z[0] || (a[0] === z[0] && a[1] > z[1])) line.reverse();
    lines.push(line);
  }
  return lines;
}

function cornersOf(line: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (let i = 1; i < line.length - 1; i += 1) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    const [x2, y2] = line[i + 1];
    const cross = (x1 - x0) * (y2 - y1) - (y1 - y0) * (x2 - x1);
    if (Math.abs(cross) > EPS) out.push(line[i]);
  }
  return out;
}

function probeValue(c: number, terms: Term[], p: Pt): number {
  let o = c;
  for (const u of terms) o += u.w * Math.max(0, u.a * p[0] + u.b * p[1] + u.d);
  return o;
}

/** o = c + Σ wⱼ·relu(aⱼ·x1 + bⱼ·x2 + dⱼ) 의 경계 · 모서리 · 켜진 쪽 · 짚는 자리의 o */
function snapshot(box: number, c: number, terms: Term[], probes: Pt[]): Snapshot {
  const segs: Pt[][] = [];
  const on: Pt[][] = [];
  const k = terms.length;
  for (let pat = 0; pat < 1 << k; pat += 1) {
    let poly = square(box);
    let A = 0;
    let B = 0;
    let C = c;
    for (let j = 0; j < k; j += 1) {
      const u = terms[j];
      const active = (pat >> j) & 1;
      poly = active ? clipHalf(poly, u.a, u.b, u.d) : clipHalf(poly, -u.a, -u.b, -u.d);
      if (poly.length < 3) break;
      if (active) {
        A += u.w * u.a;
        B += u.w * u.b;
        C += u.w * u.d;
      }
    }
    if (poly.length < 3 || area(poly) < EPS) continue;
    if (Math.abs(A) < EPS && Math.abs(B) < EPS) {
      if (C > 0) on.push(poly.map((p) => [tidy(p[0]), tidy(p[1])] as Pt));
      continue;
    }
    const pts = crossings(poly, A, B, C);
    if (pts.length === 2) segs.push(pts);
    else if (pts.length !== 0) throw new Error(`layers-compose: 한 영역에서 경계가 ${pts.length} 자리를 지난다`);
    const lit = clipHalf(poly, A, B, C);
    if (lit.length >= 3 && area(lit) > EPS) on.push(lit.map((p) => [tidy(p[0]), tidy(p[1])] as Pt));
  }
  const lines = chain(segs);
  return {
    lines,
    corners: lines.flatMap(cornersOf),
    on,
    probeO: probes.map((p) => probeValue(c, terms, p)),
  };
}

/** 단위의 꺾임선을 평면으로 자른 두 끝 */
function hinge(box: number, u: LayersUnit, j: number): Pt[] {
  const pts = crossings(square(box), u.a, u.b, u.d);
  if (pts.length !== 2) throw new Error(`layers-compose: 단위 ${j + 1} 의 꺾임선이 평면을 지나지 않는다`);
  return pts;
}

function termsUpTo(units: LayersUnit[], k: number, lastScale: number): Term[] {
  return units.slice(0, k).map((u, j) => ({ a: u.a, b: u.b, d: u.d, w: j === k - 1 ? u.v * lastScale : u.v }));
}

export async function layersCompose(ctx: FacetContext<LayersComposeFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<LayersComposeFacetData>;
  const data = narrowLayersComposeData(ctx.data);
  const { box, c, units, probes, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      hinges: units.map((u, j) => hinge(box, u, j)),
      start: snapshot(box, c, [], probes),
    },
  });

  // 걸음 0 은 평면과 o = c 가 이미 있는 화면이라 첫 단위 앞에도 읽을 틈을 둔다
  for (let k = 1; k <= units.length; k += 1) {
    if (!(await pause())) return;
    const frames: Snapshot[] = [];
    for (let i = 0; i <= MORPH_DIVISIONS; i += 1) {
      if (ctx.cancelled) return;
      frames.push(snapshot(box, c, termsUpTo(units, k, i / MORPH_DIVISIONS), probes));
    }
    await ctx.emit({
      type: 'add',
      payload: { unit: k, shape: snapshot(box, c, termsUpTo(units, k, 1), probes), frames },
    });
  }
}
