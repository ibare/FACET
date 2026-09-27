/**
 * 외적 — 둘 다에 수직인 방향 (조각).
 *
 * 3차원 오른손 좌표계의 두 벡터 a · b 에서 c = a × b 를 셈하고, c 가 a · b 둘 다와
 * 내적 0 · 사이각 90° 인지 차례로 셈한다. 마지막에 차례를 바꾼 b × a 를 셈한다.
 *
 * 이벤트
 *
 *  - `init` (silent) — 걸음 0 을 채운다.
 *      { angle: number }                          a 와 b 사이각(도)
 *  - `cross` — c = a × b 를 세 성분 한꺼번에.
 *      { name: string; label: string; v: Vec3;
 *        rows: { p; q; r; s; value }[3] }        성분 i = p×q − r×s = value
 *  - `dot` (두 번 — a 와 c, b 와 c) — 입력 벡터 하나와 c 의 내적.
 *      { with: string; expr: string; terms: [number, number][3]; value: number; angle: number }
 *  - `swap` — 차례를 바꾼 b × a.
 *      { label: string; v: Vec3; opposite: boolean; negLabel: string;
 *        checks: { expr: string; value: number }[2] }   a·(b × a) · b·(b × a)
 *
 * 걸음 0 뒤 첫 발신 앞에도 stepMs 를 둔다 — 걸음 0 이 이미 읽을 것(a · b · 사이각)이 있는 화면이다.
 * 그림의 틀(정사영 · 원판 · 범위)은 싣지 않는다 — 무대가 a · b 에서 `viewSpec` 으로 셈한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec3 = readonly [number, number, number];

export interface NamedVec {
  readonly name: string;
  readonly v: Vec3;
}

export interface CrossProductPerpendicularFacetData {
  readonly type: 'cross-product-perpendicular';
  readonly stepMs: number;
  readonly a: NamedVec;
  readonly b: NamedVec;
  /** a × b 에 붙일 이름 (기호) */
  readonly crossName: string;
}

export interface Frame {
  readonly right: Vec3;
  readonly up: Vec3;
  readonly toward: Vec3;
}

export interface PlaneDisc {
  readonly e1: Vec3;
  readonly e2: Vec3;
  readonly radius: number;
}

export interface Bounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

export interface ViewSpec {
  readonly frame: Frame;
  readonly plane: PlaneDisc;
  readonly bounds: Bounds;
}

// ── 좁히개 ───────────────────────────────────────────────

function readVec3(raw: unknown, path: string): Vec3 {
  if (!Array.isArray(raw) || raw.length !== 3) throw new Error(`${path}: 성분 셋인 배열이 아니다`);
  const out = raw.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`${path}[${i}]: 수가 아니다`);
    return x;
  });
  return [out[0] as number, out[1] as number, out[2] as number];
}

function readNamed(raw: unknown, path: string): NamedVec {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${path}: 객체가 아니다`);
  const rec = raw as Record<string, unknown>;
  if (typeof rec.name !== 'string' || rec.name === '') throw new Error(`${path}.name: 이름이 없다`);
  return { name: rec.name, v: readVec3(rec.v, `${path}.v`) };
}

/** initialData 를 좁힌다. 어긋나면 필드 경로를 담아 던진다. 장면의 initial 도 이것을 부른다. */
export function readCrossData(raw: unknown): CrossProductPerpendicularFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('initialData: 객체가 아니다');
  const rec = raw as Record<string, unknown>;
  if (rec.type !== 'cross-product-perpendicular') throw new Error('initialData.type: cross-product-perpendicular 가 아니다');
  if (typeof rec.stepMs !== 'number' || !(rec.stepMs > 0)) throw new Error('initialData.stepMs: 양수가 아니다');
  if (typeof rec.crossName !== 'string' || rec.crossName === '') throw new Error('initialData.crossName: 이름이 없다');
  return {
    type: 'cross-product-perpendicular',
    stepMs: rec.stepMs,
    a: readNamed(rec.a, 'initialData.a'),
    b: readNamed(rec.b, 'initialData.b'),
    crossName: rec.crossName,
  };
}

// ── 벡터 셈 ──────────────────────────────────────────────

export function cross(u: Vec3, w: Vec3): Vec3 {
  return [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
}

export function dot(u: Vec3, w: Vec3): number {
  return u[0] * w[0] + u[1] * w[1] + u[2] * w[2];
}

function scale(k: number, u: Vec3): Vec3 {
  return [k * u[0], k * u[1], k * u[2]];
}

function add(u: Vec3, w: Vec3): Vec3 {
  return [u[0] + w[0], u[1] + w[1], u[2] + w[2]];
}

function length(u: Vec3): number {
  return Math.sqrt(dot(u, u));
}

function unit(u: Vec3, path: string): Vec3 {
  const len = length(u);
  if (len < 1e-9) throw new Error(`${path}: 길이 0 인 벡터는 방향이 없다`);
  return scale(1 / len, u);
}

/** 사이각(도). acos 의 인자는 부동소수 끝자리로 ±1 을 넘을 수 있어 그 안으로 묶는다. */
export function angleDeg(u: Vec3, w: Vec3): number {
  const cos = dot(u, w) / (length(u) * length(w));
  if (!Number.isFinite(cos)) throw new Error('angleDeg: 길이 0 인 벡터의 사이각');
  return (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
}

// ── 그림이 함께 쓰는 셈 (정사영 · 호) ───────────────────────

/** 판 위로 올려다보는 높이(도). 이 높이에서 원판이 납작한 타원으로 보이고 a × b 는 곧게 선다. */
const ELEVATION_DEG = 28;
/** 원판의 반지름 — a · b 가운데 긴 쪽의 몇 배 */
const PLANE_MARGIN = 1.3;
const DISC_SEGMENTS = 48;

/**
 * 정사영의 틀. 보는 이는 a · b 의 이등분선 반대쪽, 판에서 ELEVATION_DEG 만큼 a × b 쪽으로
 * 올라선 자리에 있다. right × up = toward 인 오른손 틀이라 거울상이 되지 않는다.
 * right 가 판 안에 놓이므로 a × b 는 화면에서 곧게 위로 선다.
 */
export function viewFrame(a: Vec3, b: Vec3): Frame {
  const n = unit(cross(a, b), 'a × b');
  const front = scale(-1, unit(add(unit(a, 'a'), unit(b, 'b')), 'a, b 의 이등분선'));
  const th = (ELEVATION_DEG * Math.PI) / 180;
  const toward = add(scale(Math.cos(th), front), scale(Math.sin(th), n));
  const up = add(scale(-Math.sin(th), front), scale(Math.cos(th), n));
  const right = cross(up, toward);
  return { right, up, toward };
}

export function project(p: Vec3, frame: Frame): { x: number; y: number } {
  return { x: dot(p, frame.right), y: dot(p, frame.up) };
}

export function discPoint(plane: PlaneDisc, i: number, count: number): Vec3 {
  const phi = (2 * Math.PI * i) / count;
  return add(scale(plane.radius * Math.cos(phi), plane.e1), scale(plane.radius * Math.sin(phi), plane.e2));
}

/** u 에서 w 로 도는 호 위의 점 — 반지름 radius, 비율 s (0..1). 구면 보간이라 사이각이 그대로 보인다. */
export function arcPoint(u: Vec3, w: Vec3, radius: number, s: number): Vec3 {
  const uu = unit(u, 'arc.u');
  const ww = unit(w, 'arc.w');
  const omega = Math.acos(Math.min(1, Math.max(-1, dot(uu, ww))));
  if (omega < 1e-9) throw new Error('arcPoint: 두 벡터가 같은 방향이라 호가 없다');
  const k = 1 / Math.sin(omega);
  const dir = add(scale(Math.sin((1 - s) * omega) * k, uu), scale(Math.sin(s * omega) * k, ww));
  return scale(radius, dir);
}

/** 그림의 틀 전체 — 바탕(a · b)에서 정해지는 작은 셈이라 무대가 가져다 부른다. */
export function viewSpec(a: Vec3, b: Vec3): ViewSpec {
  const frame = viewFrame(a, b);
  const n = unit(cross(a, b), 'a × b');
  const e1 = scale(-1, unit(add(unit(a, 'a'), unit(b, 'b')), 'a, b 의 이등분선'));
  const plane: PlaneDisc = { e1, e2: cross(n, e1), radius: PLANE_MARGIN * Math.max(length(a), length(b)) };
  const c = cross(a, b);
  const pts: Vec3[] = [[0, 0, 0], a, b, c, scale(-1, c)];
  for (let i = 0; i < DISC_SEGMENTS; i += 1) pts.push(discPoint(plane, i, DISC_SEGMENTS));
  const xy = pts.map((p) => project(p, frame));
  return {
    frame,
    plane,
    bounds: {
      minX: Math.min(...xy.map((q) => q.x)),
      maxX: Math.max(...xy.map((q) => q.x)),
      minY: Math.min(...xy.map((q) => q.y)),
      maxY: Math.max(...xy.map((q) => q.y)),
    },
  };
}

// ── 수 표기 ──────────────────────────────────────────────

const MINUS = '−';

function snap(n: number): number {
  return Math.abs(n) < 1e-9 ? 0 : n;
}

/** 정수 그대로 · 음수는 빼기 기호 */
export function formatInt(n: number): string {
  const v = snap(n);
  return v < 0 ? `${MINUS}${String(-v)}` : String(v);
}

/** 소수 자릿수 고정 · −0.0 이 나오지 않게 먼저 0 으로 붙인다 */
export function formatFixed(n: number, digits: number): string {
  const text = snap(n).toFixed(digits);
  const zero = (0).toFixed(digits);
  if (text === `-${zero}`) return zero;
  return text.startsWith('-') ? `${MINUS}${text.slice(1)}` : text;
}

/** 식 안의 인수 — 음수는 괄호로 감싼다 */
export function formatFactor(n: number): string {
  return snap(n) < 0 ? `(${formatInt(n)})` : formatInt(n);
}

export function formatVec(v: Vec3): string {
  return `(${v.map(formatInt).join(', ')})`;
}

// ── 알고리즘 ─────────────────────────────────────────────

export async function crossProductPerpendicular(
  base: FacetContext<CrossProductPerpendicularFacetData>,
): Promise<void> {
  const ctx = base as ReactiveContext<CrossProductPerpendicularFacetData>;
  const data = readCrossData(ctx.data);
  const stepMs = data.stepMs;
  const a = data.a;
  const b = data.b;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 0 — a · b 와 그 사이각
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { angle: angleDeg(a.v, b.v) },
  });
  if (!(await pause())) return;

  // 걸음 1 — c = a × b, 세 성분 한꺼번에
  const c = cross(a.v, b.v);
  const crossLabel = `${a.name} × ${b.name}`;
  const rows = [
    { p: a.v[1], q: b.v[2], r: a.v[2], s: b.v[1], value: c[0] },
    { p: a.v[2], q: b.v[0], r: a.v[0], s: b.v[2], value: c[1] },
    { p: a.v[0], q: b.v[1], r: a.v[1], s: b.v[0], value: c[2] },
  ];
  await ctx.emit({ type: 'cross', payload: { name: data.crossName, label: crossLabel, v: c, rows } });

  // 걸음 2 · 3 — 입력 벡터마다 c 와의 내적과 사이각
  for (const input of [a, b]) {
    if (!(await pause())) return;
    const terms = [0, 1, 2].map((i) => [input.v[i] as number, c[i] as number]);
    await ctx.emit({
      type: 'dot',
      payload: {
        with: input.name,
        expr: `${input.name}·${data.crossName}`,
        terms,
        value: dot(input.v, c),
        angle: angleDeg(input.v, c),
      },
    });
  }
  if (!(await pause())) return;

  // 걸음 4 — 차례를 바꾼 b × a
  const swapped = cross(b.v, a.v);
  const swapLabel = `${b.name} × ${a.name}`;
  const opposite = swapped.every((x, i) => x === -(c[i] as number));
  await ctx.emit({
    type: 'swap',
    payload: {
      label: swapLabel,
      v: swapped,
      opposite,
      negLabel: `${MINUS}(${crossLabel})`,
      checks: [a, b].map((input) => ({ expr: `${input.name}·(${swapLabel})`, value: dot(input.v, swapped) })),
    },
  });
}
