/**
 * vector-as-arrow — 숫자쌍이 화살표가 된다.
 *
 * 원점에서 가로로 v 의 첫 성분만큼, 이어 세로로 둘째 성분만큼 걸어 간 끝이 머리다.
 * 원점(꼬리)에서 그 머리까지가 화살표다. 그다음 같은 화살표를 데이터의 꼬리 셋으로
 * 차례로 옮기고, 옮길 때마다 머리 − 꼬리 를 셈해 싣는다.
 *
 * 이벤트 (좌표는 모두 수학 좌표 [x, y], 위가 +y):
 *   init   (silent)  { name: string; v: [x, y]; origin: [x, y];
 *                      bounds: { xMin; xMax; yMin; yMax } }
 *                    — 걸음 0. 숫자쌍과 원점. bounds 는 걸음 전체가 닿는 좌표의 범위
 *   walk-x           { from: [x, y]; to: [x, y]; n: number }
 *                    — 원점에서 가로로 n 만큼 걷는다 (n = v 의 첫 성분)
 *   walk-y           { from: [x, y]; to: [x, y]; n: number; arrow: Arrow }
 *                    — 이어 세로로 n 만큼 걷는다. 닿은 곳이 머리, 원점 → 머리 가 화살표
 *   place            { index: number; arrow: Arrow }
 *                    — index 번째 꼬리로 같은 화살표를 옮긴다
 *
 *   Arrow = { tail: [x, y]; corner: [x, y]; head: [x, y]; diff: [x, y] }
 *     corner = 꼬리에서 가로 성분만 걸은 자리, head = 꼬리 + v, diff = head − tail
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Pt = readonly [number, number];

export type VectorAsArrowFacetData = {
  type: 'vector-as-arrow';
  stepMs: number;
  /** 벡터의 기호 (화면에 그대로 뜬다) */
  name: string;
  v: Pt;
  /** 화살표를 옮겨 놓을 꼬리들 (차례대로) */
  tails: readonly Pt[];
};

export type Arrow = { tail: Pt; corner: Pt; head: Pt; diff: Pt };

export type Bounds = { xMin: number; xMax: number; yMin: number; yMax: number };

/** 벡터의 꼬리를 두는 자리 — 원점. */
const ORIGIN: Pt = [0, 0];

/** [x, y] 하나를 좁힌다. 장면도 payload 를 읽을 때 이것을 부른다. */
export function readPoint(value: unknown, path: string): Pt {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error(`vector-as-arrow: ${path} 는 [x, y] 여야 한다`);
  }
  const [x, y] = value as unknown[];
  if (typeof x !== 'number' || !Number.isFinite(x) || typeof y !== 'number' || !Number.isFinite(y)) {
    throw new Error(`vector-as-arrow: ${path} 의 성분이 유한한 수가 아니다`);
  }
  return [x, y];
}

/** initialData 를 좁힌다. 어긋나면 필드 경로를 담아 던진다. 값은 베낀다. */
export function narrowVectorAsArrowData(data: unknown): VectorAsArrowFacetData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('vector-as-arrow: initialData 가 객체가 아니다');
  }
  const d = data as Record<string, unknown>;
  if (d.type !== 'vector-as-arrow') {
    throw new Error(`vector-as-arrow: type 이 'vector-as-arrow' 가 아니다 (${String(d.type)})`);
  }
  if (typeof d.stepMs !== 'number' || !(d.stepMs > 0)) {
    throw new Error('vector-as-arrow: stepMs 는 양수여야 한다');
  }
  if (typeof d.name !== 'string' || d.name === '') {
    throw new Error('vector-as-arrow: name 이 비었다');
  }
  if (!Array.isArray(d.tails) || d.tails.length === 0) {
    throw new Error('vector-as-arrow: tails 는 비지 않은 배열이어야 한다');
  }
  return {
    type: 'vector-as-arrow',
    stepMs: d.stepMs,
    name: d.name,
    v: readPoint(d.v, 'v'),
    tails: d.tails.map((p, i) => readPoint(p, `tails[${i}]`)),
  };
}

/** 셈한 값의 부동소수 찌꺼기와 −0 을 0 으로 붙인다. */
function snap(x: number): number {
  return Math.abs(x) < 1e-9 ? 0 : x;
}

/** 꼬리에 v 를 놓은 화살표 — 가로로 걸은 자리 · 머리 · 머리 − 꼬리. */
export function arrowAt(tail: Pt, v: Pt): Arrow {
  const corner: Pt = [snap(tail[0] + v[0]), tail[1]];
  const head: Pt = [snap(tail[0] + v[0]), snap(tail[1] + v[1])];
  const diff: Pt = [snap(head[0] - tail[0]), snap(head[1] - tail[1])];
  return { tail, corner, head, diff };
}

function boundsOf(points: readonly Pt[]): Bounds {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
    yMin: Math.min(...ys),
    yMax: Math.max(...ys),
  };
}

export async function vectorAsArrow(ctx: FacetContext<VectorAsArrowFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<VectorAsArrowFacetData>;
  const data = narrowVectorAsArrowData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const first = arrowAt(ORIGIN, data.v);
  const moved = data.tails.map((tail) => arrowAt(tail, data.v));
  const all = [first, ...moved].flatMap((a) => [a.tail, a.corner, a.head]);

  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { name: data.name, v: data.v, origin: ORIGIN, bounds: boundsOf(all) },
  });

  // 걸음 0 은 숫자쌍과 원점이 이미 읽을 것이라 첫 발신 앞에 읽을 틈을 둔다.
  if (!(await pause())) return;
  await ctx.emit({
    type: 'walk-x',
    payload: { from: first.tail, to: first.corner, n: first.diff[0] },
  });

  if (!(await pause())) return;
  await ctx.emit({
    type: 'walk-y',
    payload: { from: first.corner, to: first.head, n: first.diff[1], arrow: first },
  });

  for (let index = 0; index < moved.length; index += 1) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'place', payload: { index, arrow: moved[index] } });
  }

  // 마지막 걸음도 읽을 틈을 두고 끝낸다.
  await pause();
}
