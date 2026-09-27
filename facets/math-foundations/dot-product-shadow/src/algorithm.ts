/**
 * dot-product-shadow — 길이 5 인 a 가 b 에서 걸음마다 더 벌어지며, b 의 줄 위에 드리운
 * 그림자가 짧아지다 원점을 지나 반대쪽으로 넘어간다. 걸음마다 두 셈을 **따로** 한다.
 *
 *   ① a·b = a₁b₁ + a₂b₂                     (성분 곱의 합)
 *   ② 그림자 = |a| × cos θ                   (θ = a 의 각 − b 의 각 을 0..180° 로 접은 사이각)
 *
 * 그리고 |b| × 그림자 가 ① 과 1e-9 안에서 같은지 확인한다 — 어긋나면 던진다.
 * 그림자는 ① 을 |b| 로 나눠 얻지 않는다 (그러면 주장이 제 꼬리를 문다).
 *
 * 이벤트
 *   init (silent) — 걸음 0 을 세운다. a 의 차례 첫 벡터(b 와 겹친 자리)의 셈을 싣는다.
 *     payload: {
 *       symbols: { a: string; b: string };   // 화면에 찍을 기호 (자료)
 *       b: [number, number];
 *       bLen: number;                        // |b|
 *       extent: number;                      // 가장 긴 벡터의 길이 (틀의 크기)
 *       reading: Reading;                    // 걸음 0 의 a 셈
 *     }
 *   turn — a 가 다음 벡터로 돈다. 걸음 하나.
 *     payload: {
 *       index: number;                       // a 의 차례 안 자리 (1..)
 *       from: [number, number];              // 돌기 전 a (계기값)
 *       change: 'shorter' | 'zero' | 'cross' | 'farLonger';
 *                                            // 앞 그림자와 견준 갈래 (changeOf)
 *       reading: Reading;
 *     }
 *
 *   Reading = { a: [number, number]; aLen: number; sep: number;   // 사이각 (도, 0..180)
 *               shadow: number; dot: number; product: number }    // product = |b| × 그림자
 *
 * 값은 |x| < 1e-9 이면 0 으로 붙여 싣는다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = readonly [number, number];

export type DotProductShadowFacetData = {
  type: 'dot-product-shadow';
  symbols: { a: string; b: string };
  b: Vec2;
  a: readonly Vec2[];
  stepMs: number;
};

export type Reading = {
  a: Vec2;
  aLen: number;
  sep: number;
  shadow: number;
  dot: number;
  product: number;
};

const EPS = 1e-9;

/** |x| < 1e-9 을 0 으로 붙인다 — cos 90° 가 6e-17 로 남지 않게. */
export function snap(x: number): number {
  return Math.abs(x) < EPS ? 0 : x;
}

function fail(path: string, why: string): never {
  throw new Error(`dot-product-shadow: ${path} — ${why}`);
}

function narrowVec(raw: unknown, path: string): Vec2 {
  if (!Array.isArray(raw) || raw.length !== 2) fail(path, '숫자 둘의 배열이어야 한다');
  const [x, y] = raw as unknown[];
  if (typeof x !== 'number' || !Number.isFinite(x)) fail(`${path}[0]`, '유한한 수가 아니다');
  if (typeof y !== 'number' || !Number.isFinite(y)) fail(`${path}[1]`, '유한한 수가 아니다');
  return [x, y];
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 쓴다. */
export function narrowDotProductShadowData(raw: unknown): DotProductShadowFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d['type'] !== 'dot-product-shadow') fail('initialData.type', `'dot-product-shadow' 가 아니다`);
  const sym = d['symbols'];
  if (typeof sym !== 'object' || sym === null) fail('initialData.symbols', '객체가 아니다');
  const sa = (sym as Record<string, unknown>)['a'];
  const sb = (sym as Record<string, unknown>)['b'];
  if (typeof sa !== 'string' || sa === '') fail('initialData.symbols.a', '빈 글자다');
  if (typeof sb !== 'string' || sb === '') fail('initialData.symbols.b', '빈 글자다');
  const b = narrowVec(d['b'], 'initialData.b');
  if (Math.hypot(b[0], b[1]) < EPS) fail('initialData.b', '길이 0 인 벡터로는 줄을 세울 수 없다');
  const list = d['a'];
  if (!Array.isArray(list) || list.length === 0) fail('initialData.a', '벡터가 하나도 없다');
  const a = list.map((v, i) => narrowVec(v, `initialData.a[${i}]`));
  const stepMs = d['stepMs'];
  if (typeof stepMs !== 'number' || !(stepMs > 0)) fail('initialData.stepMs', '양수가 아니다');
  return { type: 'dot-product-shadow', symbols: { a: sa, b: sb }, b, a, stepMs };
}

export function lengthOf(v: Vec2): number {
  return Math.hypot(v[0], v[1]);
}

/** atan2 로 잰 각 (도, −180..180). */
export function angleOf(v: Vec2): number {
  return (Math.atan2(v[1], v[0]) * 180) / Math.PI;
}

/**
 * 셈 ② — 사이각과 그림자. 성분 곱은 쓰지 않는다.
 * 그림이 돌아가는 도중의 a 에도 같은 셈을 부른다 (그림자의 발).
 */
export function shadowOf(a: Vec2, b: Vec2): { sep: number; shadow: number } {
  const raw = angleOf(a) - angleOf(b);
  const turned = ((raw % 360) + 360) % 360;
  const sep = turned > 180 ? 360 - turned : turned;
  const shadow = lengthOf(a) * Math.cos((sep * Math.PI) / 180);
  return { sep: snap(sep), shadow: snap(shadow) };
}

/** 그림자의 발 — b 의 줄 위, 원점에서 그림자만큼 (부호대로) 간 자리. */
export function footOf(shadow: number, b: Vec2): Vec2 {
  const len = lengthOf(b);
  return [snap((shadow * b[0]) / len), snap((shadow * b[1]) / len)];
}

/** 셈 ① — 성분 곱의 합. */
export function dotOf(a: Vec2, b: Vec2): number {
  return snap(a[0] * b[0] + a[1] * b[1]);
}

export function readingOf(a: Vec2, b: Vec2, index: number): Reading {
  const dot = dotOf(a, b);
  const { sep, shadow } = shadowOf(a, b);
  const product = snap(lengthOf(b) * shadow);
  if (Math.abs(product - dot) >= EPS) {
    throw new Error(
      `dot-product-shadow: a[${index}] — |b| × 그림자 ${product} 가 a·b ${dot} 와 어긋난다`,
    );
  }
  return { a: [a[0], a[1]], aLen: snap(lengthOf(a)), sep, shadow, dot, product };
}

/** 앞 그림자와 견준 갈래. 캡션이 무엇을 말할지 정한다. */
export const SHADOW_CHANGES = ['shorter', 'zero', 'cross', 'farLonger'] as const;
export type ShadowChange = (typeof SHADOW_CHANGES)[number];

/**
 * 앞 그림자 · 사이각과 지금을 견준다.
 *   shorter   — 둘 다 b 쪽(양수)이고 사이각이 커지며 짧아졌다
 *   zero      — 0 이 되었다
 *   cross     — 0 이상에서 음수로 처음 넘어갔다
 *   farLonger — 둘 다 반대쪽(음수)이고 사이각이 커지며 길어졌다
 * 이 넷이 아닌 걸음(되돌아옴 · 그대로)은 이 조각이 말할 문안이 없으니 던진다.
 */
export function changeOf(prev: Reading, next: Reading, index: number): ShadowChange {
  const opens = next.sep > prev.sep;
  if (next.shadow === 0 && prev.shadow !== 0) return 'zero';
  if (prev.shadow >= 0 && next.shadow < 0) return 'cross';
  if (opens && prev.shadow > 0 && next.shadow > 0 && next.shadow < prev.shadow) return 'shorter';
  if (opens && prev.shadow < 0 && next.shadow < 0 && next.shadow < prev.shadow) return 'farLonger';
  throw new Error(
    `dot-product-shadow: a[${index}] — 사이각 ${prev.sep} → ${next.sep}, 그림자 ${prev.shadow} → ${next.shadow} 는 말할 갈래가 없다`,
  );
}

export async function dotProductShadow(
  context: FacetContext<DotProductShadowFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<DotProductShadowFacetData>;
  const data = narrowDotProductShadowData(ctx.data);
  const { b, a, stepMs, symbols } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const extent = Math.max(lengthOf(b), ...a.map(lengthOf));
  const first = a[0];
  if (first === undefined) throw new Error('dot-product-shadow: a[0] — 벡터가 없다');

  let prevReading = readingOf(first, b, 0);
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: {
      symbols: { a: symbols.a, b: symbols.b },
      b: [b[0], b[1]],
      bLen: snap(lengthOf(b)),
      extent,
      reading: prevReading,
    },
  });

  let prev: Vec2 = first;
  for (let i = 1; i < a.length; i += 1) {
    // 걸음 0 이 이미 읽을 것이 있는 화면이라 첫 turn 앞에도 머문다.
    if (!(await pause())) return;
    const next = a[i];
    if (next === undefined) throw new Error(`dot-product-shadow: a[${i}] — 벡터가 없다`);
    const reading = readingOf(next, b, i);
    const change = changeOf(prevReading, reading, i);
    await ctx.emit({
      type: 'turn',
      payload: { index: i, from: [prev[0], prev[1]], change, reading },
    });
    prev = next;
    prevReading = reading;
  }
}
