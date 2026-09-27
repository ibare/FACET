/**
 * reflect-distribution — 한 방향에서 들어온 빛이 나가는 방향마다 얼마씩 튀는가 (수정 퐁 BRDF).
 *
 * 한 점, 법선 N. 들어오는 쪽 θi 는 고정이다. 나가는 쪽을 데이터의 차례대로 하나씩 재어
 * BRDF 값 f(θi, θo) 를 셈한다. 끝으로 데이터가 정한 짝의 들어옴과 나감을 맞바꿔 두 값을 함께 낸다.
 *
 * 규약 — f = k_d/π + k_s · (n + 2)/(2π) · max(0, R·V)^n.
 *   L = 방향(θi) · V = 방향(θo) · R = 2(N·L)N − L. 방향(θ) = (sin θ, cos θ, 0), 모두 면에서 나가는 쪽.
 *   R·V 는 거울 자리와 나가는 쪽 사이 각 α 의 cos 이다. 반구 밖(N·방향 ≤ 0)은 셈하지 않고 던진다.
 *
 * 이벤트 (payload 는 모두 수 — 문안이 아니다)
 *   init    silent  { floor: number, top: number }
 *           floor = k_d/π (cos α ≤ 0 인 쪽의 값), top = k_d/π + k_s(n+2)/(2π) (cos α = 1 일 때의 값, 그림의 축척)
 *   measure         { out: number, f: number, mirror: boolean }
 *           out = 이번에 잰 나가는 쪽 (도), f = 그 쪽의 BRDF 값, mirror = out 이 들어온 쪽의 거울 자리인가
 *   swap            { a: number, b: number, forward: number, backward: number }
 *           forward = f(들어옴 a, 나감 b), backward = f(들어옴 b, 나감 a)
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec3 = readonly [number, number, number];

export type Material = { kd: number; ks: number; n: number };

export type ReflectDistributionFacetData = {
  type: 'reflect-distribution';
  stepMs: number;
  normal: Vec3;
  incoming: number;
  outgoing: number[];
  material: Material;
  swap: { incoming: number; outgoing: number };
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`reflect-distribution: ${path} 가 유한한 수가 아니다`);
  }
  return v;
}

function angle(v: unknown, path: string): number {
  const a = num(v, path);
  if (!Number.isInteger(a) || a <= -90 || a >= 90) {
    throw new Error(`reflect-distribution: ${path} = ${String(a)} 는 면 위 반구 안의 정수 도가 아니다`);
  }
  return a;
}

/** 자료의 모양을 검사하고 어긋나면 던진다. 알고리즘과 장면이 함께 부른다. */
export function narrowReflectDistribution(raw: unknown): ReflectDistributionFacetData {
  if (!isRecord(raw)) throw new Error('reflect-distribution: 자료가 객체가 아니다');
  if (raw.type !== 'reflect-distribution') throw new Error('reflect-distribution: type 이 다르다');
  const stepMs = num(raw.stepMs, 'stepMs');
  if (!Array.isArray(raw.normal) || raw.normal.length !== 3) {
    throw new Error('reflect-distribution: normal 은 수 셋이어야 한다');
  }
  const normal: Vec3 = [num(raw.normal[0], 'normal[0]'), num(raw.normal[1], 'normal[1]'), num(raw.normal[2], 'normal[2]')];
  if (normal[0] !== 0 || normal[1] !== 1 || normal[2] !== 0) {
    // 부호 있는 각 θ 의 방향 (sin θ, cos θ, 0) 은 법선이 y 축일 때의 약속이다
    throw new Error('reflect-distribution: normal 은 (0, 1, 0) 이어야 한다 — 각도의 기준이다');
  }
  const incoming = angle(raw.incoming, 'incoming');
  if (!Array.isArray(raw.outgoing) || raw.outgoing.length === 0) {
    throw new Error('reflect-distribution: outgoing 이 비었다');
  }
  const outgoing = raw.outgoing.map((v, i) => angle(v, `outgoing[${i}]`));
  if (new Set(outgoing).size !== outgoing.length) throw new Error('reflect-distribution: outgoing 에 겹친 방향이 있다');
  if (!isRecord(raw.material)) throw new Error('reflect-distribution: material 이 객체가 아니다');
  const material: Material = {
    kd: num(raw.material.kd, 'material.kd'),
    ks: num(raw.material.ks, 'material.ks'),
    n: num(raw.material.n, 'material.n'),
  };
  if (material.kd < 0 || material.ks < 0 || material.n <= 0) {
    throw new Error('reflect-distribution: material 값이 범위 밖이다');
  }
  if (!isRecord(raw.swap)) throw new Error('reflect-distribution: swap 이 객체가 아니다');
  const swap = { incoming: angle(raw.swap.incoming, 'swap.incoming'), outgoing: angle(raw.swap.outgoing, 'swap.outgoing') };
  return { type: 'reflect-distribution', stepMs, normal, incoming, outgoing, material, swap };
}

/** 법선에서 잰 부호 있는 각 θ(도) 의 방향 (sin θ, cos θ, 0). 그림도 이 함수로 자리를 잡는다. */
export function direction(deg: number): Vec3 {
  const r = (deg * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r), 0];
}

/** 부호 있는 각으로 본 거울 자리 — 법선을 사이에 둔 맞은편. */
export function mirrorAngle(deg: number): number {
  return -deg;
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function unit(a: Vec3): Vec3 {
  const len = Math.sqrt(dot(a, a));
  if (len === 0) throw new Error('reflect-distribution: 길이 0 벡터는 맞출 수 없다');
  return [a[0] / len, a[1] / len, a[2] / len];
}

/** 수정 퐁 BRDF 값 f(θi, θo). 반구 밖이면 던진다. */
export function phongBrdf(normal: Vec3, thetaIn: number, thetaOut: number, m: Material): number {
  const N = unit(normal);
  const L = unit(direction(thetaIn));
  const V = unit(direction(thetaOut));
  const nl = dot(N, L);
  const nv = dot(N, V);
  if (nl <= 0) throw new Error(`reflect-distribution: 들어오는 쪽 ${thetaIn}° 가 면 뒤다`);
  if (nv <= 0) throw new Error(`reflect-distribution: 나가는 쪽 ${thetaOut}° 가 면 뒤다`);
  const R: Vec3 = [2 * nl * N[0] - L[0], 2 * nl * N[1] - L[1], 2 * nl * N[2] - L[2]];
  const cosA = Math.max(0, dot(R, V));
  return m.kd / Math.PI + ((m.ks * (m.n + 2)) / (2 * Math.PI)) * cosA ** m.n;
}

export async function reflectDistribution(
  context: FacetContext<ReflectDistributionFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ReflectDistributionFacetData>;
  const data = narrowReflectDistribution(ctx.data);
  const { normal, incoming, outgoing, material, swap } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  const floor = material.kd / Math.PI;
  const top = floor + (material.ks * (material.n + 2)) / (2 * Math.PI);
  await ctx.emit({ type: 'init', payload: { floor, top }, silent: true });

  for (const out of outgoing) {
    if (!(await pause())) return;
    const f = phongBrdf(normal, incoming, out, material);
    await ctx.emit({ type: 'measure', payload: { out, f, mirror: out === mirrorAngle(incoming) } });
  }

  if (!(await pause())) return;
  const forward = phongBrdf(normal, swap.incoming, swap.outgoing, material);
  const backward = phongBrdf(normal, swap.outgoing, swap.incoming, material);
  await ctx.emit({ type: 'swap', payload: { a: swap.incoming, b: swap.outgoing, forward, backward } });
}
