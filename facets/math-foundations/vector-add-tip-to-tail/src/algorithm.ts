/**
 * 벡터 덧셈 — 꼬리를 머리에 잇는다.
 *
 * 원점에 꼬리를 둔 화살표들 가운데 첫째는 제자리에서 이음의 첫 마디가 되고, 나머지는
 * 차례대로 꼬리를 앞 머리(누적)로 옮겨 붙는다. 붙을 때마다 누적 = 앞 누적 + 이번 벡터
 * (성분끼리). 마지막에 원점에서 마지막 머리까지 합 화살표 하나를 긋는다.
 *
 * 이벤트
 *   init   (silent) 걸음 0 의 바탕.
 *          payload {
 *            vectors: { name: string; x: number; y: number }[]   데이터의 화살표 (잇는 차례)
 *            tails: { x: number; y: number }[]                     화살표마다 꼬리 (모두 원점)
 *            heads: { x: number; y: number }[]                     화살표마다 머리 (꼬리 + 벡터)
 *            cumulative: { x: number; y: number }                 첫 마디의 머리 = 처음 누적
 *            bounds: { minX: number; maxX: number; minY: number; maxY: number }
 *                     원점 · 모든 꼬리 · 모든 머리 · 합의 끝을 담는 범위
 *          }
 *   attach 화살표 하나를 앞 머리에 잇는다 (둘째부터 한 번씩).
 *          payload {
 *            index: number                    잇는 화살표의 자리
 *            from: { x: number; y: number }   옮기기 전 꼬리 (원점)
 *            tail: { x: number; y: number }   새 꼬리 = 앞 누적
 *            head: { x: number; y: number }   새 머리 = 새 누적
 *          }
 *   sum    처음 꼬리에서 마지막 머리까지 합 화살표.
 *          payload {
 *            head: { x: number; y: number }   합의 끝 (성분끼리 더한 수)
 *            label: string                     합의 기호 ('a + b + c')
 *            exprX: string                     x 성분 식 ('3 + 1 + (−2) = 2')
 *            exprY: string                     y 성분 식
 *            pathLength: number                이은 길 길이의 합
 *            sumLength: number                 합 화살표의 길이
 *          }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = { x: number; y: number };
export type NamedVec = { name: string; x: number; y: number };
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

export type VectorAddTipToTailFacetData = {
  type: 'vector-add-tip-to-tail';
  vectors: NamedVec[];
  stepMs: number;
};

function fail(path: string, why: string): never {
  throw new Error(`vector-add-tip-to-tail: ${path} ${why}`);
}

function finiteAt(obj: Record<string, unknown>, key: string, path: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${path}.${key}`, '는 유한한 수여야 한다');
  return v;
}

/** 자료 좁히개 — 알고리즘과 장면이 함께 부른다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowVectorAddTipToTailData(raw: unknown): VectorAddTipToTailFacetData {
  if (typeof raw !== 'object' || raw === null) fail('data', '가 객체가 아니다');
  const obj = raw as Record<string, unknown>;
  if (obj.type !== 'vector-add-tip-to-tail') fail('data.type', `이 어긋났다: ${String(obj.type)}`);
  const stepMs = finiteAt(obj, 'stepMs', 'data');
  if (stepMs < 800) fail('data.stepMs', '는 800 이상이어야 한다');
  const list = obj.vectors;
  if (!Array.isArray(list) || list.length < 2) fail('data.vectors', '는 화살표 둘 이상의 배열이어야 한다');
  const vectors: NamedVec[] = list.map((item: unknown, i: number) => {
    const path = `data.vectors[${i}]`;
    if (typeof item !== 'object' || item === null) fail(path, '가 객체가 아니다');
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== 'string' || rec.name.length === 0) fail(`${path}.name`, '이 비었다');
    return { name: rec.name, x: finiteAt(rec, 'x', path), y: finiteAt(rec, 'y', path) };
  });
  return { type: 'vector-add-tip-to-tail', vectors, stepMs };
}

/** |x| < 1e-9 를 0 으로 붙인다 — `-0` 과 부동소수 끝자리가 글자를 가르지 않게. */
function snap(n: number): number {
  return Math.abs(n) < 1e-9 ? 0 : n;
}

/** 좌표 · 성분 한 수 — 주어진 그대로, 음수는 빼기 기호(−). */
export function formatNum(n: number): string {
  return String(snap(n)).replace('-', '−');
}

/** 식 안의 항 — 음수는 괄호로 감싼다. */
function formatTerm(n: number): string {
  const s = formatNum(n);
  return snap(n) < 0 ? `(${s})` : s;
}

/** 점 하나 — `(4, 3)` */
export function formatPoint(p: Vec2): string {
  return `(${formatNum(p.x)}, ${formatNum(p.y)})`;
}

/** 길이 — 소수 둘째. */
export function formatLength(n: number): string {
  return snap(n).toFixed(2);
}

function add(p: Vec2, q: Vec2): Vec2 {
  return { x: snap(p.x + q.x), y: snap(p.y + q.y) };
}

function length(v: Vec2): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

export async function vectorAddTipToTail(
  ctx: FacetContext<VectorAddTipToTailFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<VectorAddTipToTailFacetData>;
  const data = narrowVectorAddTipToTailData(rctx.data);
  const { vectors, stepMs } = data;
  const [first, ...rest] = vectors;
  if (first === undefined) fail('data.vectors', '가 비었다');

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  // 걸음마다 붙을 자리를 먼저 셈한다 — 범위는 이 자리들에서 나온다.
  const origin: Vec2 = { x: 0, y: 0 };
  const firstHead: Vec2 = { x: first.x, y: first.y };
  const links: { index: number; tail: Vec2; head: Vec2 }[] = [];
  let cumulative = firstHead;
  rest.forEach((v, k) => {
    const head = add(cumulative, v);
    links.push({ index: k + 1, tail: cumulative, head });
    cumulative = head;
  });
  const sumHead = cumulative;

  const points: Vec2[] = [origin, sumHead, ...vectors, ...links.flatMap((l) => [l.tail, l.head])];
  const bounds: Bounds = {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };

  await rctx.emit({
    type: 'init',
    silent: true,
    payload: {
      vectors: vectors.map((v) => ({ name: v.name, x: v.x, y: v.y })),
      tails: vectors.map(() => origin),
      heads: vectors.map((v) => add(origin, v)),
      cumulative: firstHead,
      bounds,
    },
  });

  // 걸음 0 은 세 화살표가 이미 서 있는 화면이다 — 첫 이음 앞에 읽을 틈을 둔다.
  for (const link of links) {
    if (!(await pause())) return;
    await rctx.emit({
      type: 'attach',
      payload: { index: link.index, from: origin, tail: link.tail, head: link.head },
    });
  }

  if (!(await pause())) return;
  const xs = vectors.map((v) => v.x);
  const ys = vectors.map((v) => v.y);
  await rctx.emit({
    type: 'sum',
    payload: {
      head: sumHead,
      label: vectors.map((v) => v.name).join(' + '),
      exprX: `${xs.map(formatTerm).join(' + ')} = ${formatNum(sumHead.x)}`,
      exprY: `${ys.map(formatTerm).join(' + ')} = ${formatNum(sumHead.y)}`,
      pathLength: vectors.reduce((acc, v) => acc + length(v), 0),
      sumLength: length(sumHead),
    },
  });
}
