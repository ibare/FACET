/**
 * rotate-turns — 회전 행렬로 원점 밖의 삼각형을 돌린다.
 *
 * 걸음 k 의 좌표는 늘 처음 도형에 R(stepDeg·k) 를 곱해 셈한다 (앞 걸음 결과에 거듭 곱하지 않는다).
 * R(θ) = [[cos θ, −sin θ], [sin θ, cos θ]], θ 는 도 · 반시계가 +, 좌표는 y 가 위.
 * 거리 · 변 길이 · 꼭짓점 각 · 무게중심은 걸음마다 새 좌표에서 다시 셈해 싣는다.
 *
 * 이벤트
 *   init   (silent) — 걸음 0 의 바탕과 잰 값.
 *     payload: { reach: number, measure: Measure }
 *       reach    꼭짓점 가운데 원점에서 가장 먼 거리 (그림의 축척을 정한다)
 *   turn            — 원점 둘레로 stepDeg 만큼 더 돈다. 한 걸음.
 *     payload: { from: number, by: number, measure: Measure }
 *       from     돌기 전 누적 각(도) · by 이번 걸음의 각(도) · measure.deg = from + by
 *
 * Measure = {
 *   deg: number,                                   누적 각(도)
 *   points: { id: string, x: number, y: number, r: number }[],   꼭짓점 좌표와 원점까지 거리
 *   sides: { from: string, to: string, len: number }[],          변 (꼭짓점 차례로 이어 끝에서 처음으로)
 *   corners: { id: string, deg: number }[],                      꼭짓점 각(도)
 *   centroid: { x: number, y: number, r: number }                무게중심과 원점까지 거리
 * }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vertex = { id: string; x: number; y: number };

export type RotateTurnsFacetData = {
  type: 'rotate-turns';
  stepMs: number;
  /** 삼각형 꼭짓점 셋, 처음 좌표 (y 가 위) */
  vertices: Vertex[];
  /** 한 걸음의 각 (도, 반시계가 +) */
  stepDeg: number;
  /** 걸음 수 (걸음 0 을 빼고) */
  steps: number;
};

export type MeasuredPoint = { id: string; x: number; y: number; r: number };
export type Side = { from: string; to: string; len: number };
export type Corner = { id: string; deg: number };
export type Measure = {
  deg: number;
  points: MeasuredPoint[];
  sides: Side[];
  corners: Corner[];
  centroid: { x: number; y: number; r: number };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function finite(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`rotate-turns: ${path} 는 유한한 수여야 한다`);
  return v;
}

/** initialData 좁히개 — 모양이 어긋나면 필드 경로를 담아 던진다. 값을 베껴 돌려준다. */
export function readRotateTurnsData(raw: unknown): RotateTurnsFacetData {
  if (!isRecord(raw)) throw new Error('rotate-turns: initialData 가 객체가 아니다');
  if (raw.type !== 'rotate-turns') throw new Error('rotate-turns: initialData.type 이 rotate-turns 가 아니다');
  const stepMs = finite(raw.stepMs, 'initialData.stepMs');
  const stepDeg = finite(raw.stepDeg, 'initialData.stepDeg');
  const steps = finite(raw.steps, 'initialData.steps');
  if (!Number.isInteger(steps) || steps < 1) throw new Error('rotate-turns: initialData.steps 는 1 이상의 정수여야 한다');
  if (!Array.isArray(raw.vertices)) throw new Error('rotate-turns: initialData.vertices 가 배열이 아니다');
  if (raw.vertices.length !== 3) throw new Error('rotate-turns: initialData.vertices 는 꼭짓점 셋이어야 한다');
  const seen = new Set<string>();
  const vertices = raw.vertices.map((v: unknown, i: number): Vertex => {
    if (!isRecord(v)) throw new Error(`rotate-turns: initialData.vertices[${i}] 가 객체가 아니다`);
    if (typeof v.id !== 'string' || v.id === '') throw new Error(`rotate-turns: initialData.vertices[${i}].id 가 비었다`);
    if (seen.has(v.id)) throw new Error(`rotate-turns: initialData.vertices[${i}].id 가 겹친다`);
    seen.add(v.id);
    return { id: v.id, x: finite(v.x, `initialData.vertices[${i}].x`), y: finite(v.y, `initialData.vertices[${i}].y`) };
  });
  return { type: 'rotate-turns', stepMs, stepDeg, steps, vertices };
}

/** R(deg) · p — 원점 둘레로 deg 도 반시계로 돌린다. 그림이 호를 따라 가는 자리도 이것으로 셈한다. */
export function rotatePoint(p: { x: number; y: number }, deg: number): { x: number; y: number } {
  const rad = (deg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: c * p.x - s * p.y, y: s * p.x + c * p.y };
}

function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/** 좌표에서 거리 · 변 · 꼭짓점 각 · 무게중심을 새로 잰다. */
function measure(deg: number, vertices: Vertex[]): Measure {
  const points = vertices.map((v) => {
    const q = rotatePoint(v, deg);
    return { id: v.id, x: q.x, y: q.y, r: Math.hypot(q.x, q.y) };
  });
  const n = points.length;
  const sides: Side[] = [];
  const corners: Corner[] = [];
  for (let i = 0; i < n; i += 1) {
    const p = points[i];
    const q = points[(i + 1) % n];
    const o = points[(i + n - 1) % n];
    if (!p || !q || !o) throw new Error(`rotate-turns: 꼭짓점 ${i} 을 찾을 수 없다`);
    const len = distance(p.x, p.y, q.x, q.y);
    if (len === 0) throw new Error(`rotate-turns: 변 ${p.id}${q.id} 의 길이가 0 이다`);
    sides.push({ from: p.id, to: q.id, len });
    const ux = q.x - p.x;
    const uy = q.y - p.y;
    const vx = o.x - p.x;
    const vy = o.y - p.y;
    const lu = Math.hypot(ux, uy);
    const lv = Math.hypot(vx, vy);
    if (lu === 0 || lv === 0) throw new Error(`rotate-turns: 꼭짓점 ${p.id} 의 각을 잴 변의 길이가 0 이다`);
    const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy) / (lu * lv)));
    corners.push({ id: p.id, deg: (Math.acos(cos) * 180) / Math.PI });
  }
  const cx = points.reduce((s, p) => s + p.x, 0) / n;
  const cy = points.reduce((s, p) => s + p.y, 0) / n;
  return { deg, points, sides, corners, centroid: { x: cx, y: cy, r: Math.hypot(cx, cy) } };
}

export async function rotateTurns(context: FacetContext<RotateTurnsFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<RotateTurnsFacetData>;
  const data = readRotateTurnsData(ctx.data);
  const { stepMs, stepDeg, steps, vertices } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const first = measure(0, vertices);
  const reach = Math.max(...first.points.map((p) => p.r));
  await ctx.emit({ type: 'init', payload: { reach, measure: first }, silent: true });

  for (let k = 1; k <= steps; k += 1) {
    // 걸음 0 에 읽을 것이 있으니 첫 turn 앞에도 머문다
    if (!(await pause())) return;
    const from = stepDeg * (k - 1);
    // 늘 처음 도형에 곱한다 — 앞 걸음 좌표를 다시 돌리지 않는다
    await ctx.emit({ type: 'turn', payload: { from, by: stepDeg, measure: measure(stepDeg * k, vertices) } });
  }
}
