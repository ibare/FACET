/**
 * look-at-direction — 눈 · 바라보는 점 · 대강의 위쪽 셋에서 카메라의 세 축이 차례로 선다.
 *
 * 좌표계는 오른손, y 가 위. 카메라는 −z 를 본다. 외적은 오른손:
 * a × b = (a_y b_z − a_z b_y, a_z b_x − a_x b_z, a_x b_y − a_y b_x).
 * 세상의 점은 옮기지 않는다 — 축을 세우는 일만 한다.
 *
 * 걸음 0 은 장면의 `initial()` 이 자료(눈 · 바라보는 점 · 주어진 위쪽)에서 세운다.
 * 걸음 0 에 읽을 것이 있으므로 첫 발신 앞에 stepMs 를 한 번 둔다.
 *
 * 이벤트 (모두 silent 아님, 한 걸음 = 축 하나 · 마지막은 바라보는 점 읽기):
 *   sight      { d: Vec3, length: number, f: Vec3 }
 *              d = 바라보는 점 − 눈, length = |d|, f = d / |d|
 *   right      { cross: Vec3, length: number, r: Vec3 }
 *              cross = f × 위쪽, length = |cross| (0 이면 던진다), r = cross / |cross|
 *   trueUp     { u: Vec3, tiltDeg: number, pitchDeg: number }
 *              u = r × f (정규화하지 않는다 — r ⊥ f 이고 둘 다 단위),
 *              tiltDeg = 주어진 위쪽(단위)과 u 사이 각, pitchDeg = 시선이 수평 아래로 내려간 각
 *   readTarget { camera: Vec3 }
 *              뷰 회전의 행 r · u · −f 로 (바라보는 점 − 눈) 을 읽은 카메라 좌표
 *
 * Vec3 = [number, number, number]
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec3 = [number, number, number];

export type LookAtDirectionFacetData = {
  type: 'look-at-direction';
  eye: Vec3;
  target: Vec3;
  up: Vec3;
  stepMs: number;
};

const EPS = 1e-9;

function readVec3(value: unknown, path: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`look-at-direction: ${path} 는 수 셋의 배열이어야 한다`);
  }
  const out: number[] = [];
  value.forEach((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) {
      throw new Error(`look-at-direction: ${path}[${i}] 가 유한한 수가 아니다`);
    }
    out.push(x);
  });
  return [out[0] as number, out[1] as number, out[2] as number];
}

/** 자료 좁히개 — 알고리즘 · 장면 · 그림이 함께 쓴다. 어긋나면 던진다. */
export function narrowLookAtData(data: unknown): LookAtDirectionFacetData {
  if (typeof data !== 'object' || data === null) {
    throw new Error('look-at-direction: 자료가 객체가 아니다');
  }
  const rec = data as Record<string, unknown>;
  if (rec.type !== 'look-at-direction') {
    throw new Error(`look-at-direction: type 이 'look-at-direction' 이 아니다 (${String(rec.type)})`);
  }
  const stepMs = rec.stepMs;
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs < 0) {
    throw new Error('look-at-direction: stepMs 가 0 이상의 수가 아니다');
  }
  return {
    type: 'look-at-direction',
    eye: readVec3(rec.eye, 'eye'),
    target: readVec3(rec.target, 'target'),
    up: readVec3(rec.up, 'up'),
    stepMs,
  };
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function norm(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

function scaleBy(a: Vec3, k: number): Vec3 {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function degrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** 단위 벡터끼리의 내적 — 부동소수 끝자리만 [-1, 1] 로 거둔다. 그 밖이면 단위가 아니므로 던진다. */
function unitCos(value: number, what: string): number {
  if (Math.abs(value) > 1 + 1e-9) throw new Error(`look-at-direction: ${what} 가 [-1, 1] 밖이다 (${value})`);
  return Math.min(1, Math.max(-1, value));
}

export async function lookAtDirection(ctx: FacetContext<LookAtDirectionFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<LookAtDirectionFacetData>;
  const data = narrowLookAtData(ctx.data);
  const { eye, target, up, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 걸음 1 — 시선이 뻗고 길이 1 로 줄어든다
  const d = sub(target, eye);
  const dLen = norm(d);
  if (dLen < EPS) throw new Error('look-at-direction: 눈과 바라보는 점이 같은 자리다 — 시선을 셈할 수 없다');
  const f = scaleBy(d, 1 / dLen);
  if (!(await pause())) return;
  await ctx.emit({ type: 'sight', payload: { d, length: dLen, f } });

  // 걸음 2 — 시선 × 위쪽 으로 오른쪽이 선다
  const c = cross(f, up);
  const cLen = norm(c);
  if (cLen < EPS) throw new Error('look-at-direction: 위쪽이 시선과 나란하다 — f × 위쪽 의 길이가 0 이다');
  const r = scaleBy(c, 1 / cLen);
  if (!(await pause())) return;
  await ctx.emit({ type: 'right', payload: { cross: c, length: cLen, r } });

  // 걸음 3 — 오른쪽 × 시선 으로 참 위가 선다
  const u = cross(r, f);
  const upLen = norm(up);
  if (upLen < EPS) throw new Error('look-at-direction: 주어진 위쪽의 길이가 0 이다');
  const cosTilt = unitCos(dot(u, up) / upLen, 'u · 위쪽');
  const tiltDeg = degrees(Math.acos(cosTilt));
  // 수평 아래로 내려간 각 — 주어진 위쪽을 수직으로 본다
  const sinPitch = unitCos(-dot(f, up) / upLen, '−f · 위쪽');
  const pitchDeg = degrees(Math.asin(sinPitch));
  if (!(await pause())) return;
  await ctx.emit({ type: 'trueUp', payload: { u, tiltDeg, pitchDeg } });

  // 걸음 4 — 바라보는 점을 새 축(r · u · −f)으로 읽는다
  const camera: Vec3 = [dot(r, d), dot(u, d), -dot(f, d)];
  if (!(await pause())) return;
  await ctx.emit({ type: 'readTarget', payload: { camera } });
}
