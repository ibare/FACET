/**
 * roughness-metallic — 같은 면 · 같은 빛 · 같은 눈 앞에서 재질 값 하나씩만 바꾸며
 * 면 위 점 아홉의 값(퍼진빛 + 번쩍임)을 셈한다.
 *
 * 셈 (점마다, 채널마다):
 *   L = 빛 − 점, V = 눈 − 점, H = L + V (모두 길이 1 로)
 *   α = 거칠기² · D = α² / (π((N·H)²(α² − 1) + 1)²)            (GGX)
 *   k = α / 2 · G1(x) = x / (x(1 − k) + k) · G = G1(N·L) G1(N·V)  (Smith, Schlick-GGX)
 *   F0 = 0.04(1 − 금속성) + 바탕색 · 금속성 · F = F0 + (1 − F0)(1 − V·H)^5
 *   번쩍임 = D F G / (4 N·L N·V) · E · N·L
 *   퍼진빛 = (1 − F)(1 − 금속성) · 바탕색 / π · E · N·L
 *   합 = 퍼진빛 + 번쩍임  (자르지 않은 선형 값 — 1 을 넘는다)
 * 봉우리 = 번쩍임(빨강)이 가장 큰 점. 번진 자리 = 번쩍임(빨강)이 봉우리의 절반 이상인 점.
 *
 * 이벤트 (reactive):
 *   'material'  (silent 아님) 재질 하나를 얹은 걸음. 재질마다 한 번.
 *     payload: {
 *       id: string,                    재질 식별자 (initialData.materials[].id)
 *       metallic: number, roughness: number,
 *       changed: 'first' | 'metallic' | 'roughness',   앞 재질과 견줘 바뀐 값 (첫 재질은 'first')
 *       from: number | null,           바뀐 값의 앞 값 (첫 재질은 null)
 *       rows: { x: number, diffuse: [r,g,b], specular: [r,g,b], total: [r,g,b] }[]   점 아홉, 자료 차례
 *       peakX: number,                 봉우리 점의 x
 *       half: number,                  봉우리 번쩍임(빨강)의 절반
 *       spread: number[]               번쩍임(빨강) ≥ half 인 점의 x, 자료 차례
 *     }
 *
 * 걸음 0 은 장면의 initial() 이 initialData 에서 세운다 (면 · 점 · 빛 · 눈 · 바탕색). 그 화면이
 * 이미 읽을 것이 있어 첫 발신 앞에 stepMs 를 둔다. 자동 재생을 마치면 그냥 돌아온다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec3 = readonly [number, number, number];

export type RoughnessMetallicMaterial = {
  readonly id: string;
  readonly metallic: number;
  readonly roughness: number;
};

export type RoughnessMetallicFacetData = {
  readonly type: 'roughness-metallic';
  readonly stepMs: number;
  /** 면의 법선 */
  readonly normal: Vec3;
  /** 면 위 점들의 x (y = 0, z = 0) */
  readonly points: readonly number[];
  /** 점광원의 자리 */
  readonly light: Vec3;
  /** 눈의 자리 */
  readonly eye: Vec3;
  /** 빛의 세기 E (거리 감쇠 없음) */
  readonly lightIntensity: number;
  /** 바탕색 (r, g, b) — 선형 값 */
  readonly base: Vec3;
  /** 차례대로 얹을 재질 */
  readonly materials: readonly RoughnessMetallicMaterial[];
};

export type ShadedRow = {
  readonly x: number;
  readonly diffuse: Vec3;
  readonly specular: Vec3;
  readonly total: Vec3;
};

/** 금속이 아닌 면의 수직 반사율 — Schlick 근사의 흔한 값 (규약의 0.04) */
const F0_DIELECTRIC = 0.04;

// ---------------------------------------------------------------- 좁히개

function fail(path: string, why: string): never {
  throw new Error(`roughness-metallic: ${path} — ${why}`);
}

function finiteAt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function unitAt(v: unknown, path: string): number {
  const n = finiteAt(v, path);
  if (n < 0 || n > 1) fail(path, '0..1 밖이다');
  return n;
}

function vec3At(v: unknown, path: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3) fail(path, '수 셋의 배열이 아니다');
  return [finiteAt(v[0], `${path}[0]`), finiteAt(v[1], `${path}[1]`), finiteAt(v[2], `${path}[2]`)];
}

/** initialData 를 검사해 베낀다. 어긋나면 필드 경로를 담아 던진다. */
export function narrowRoughnessMetallicData(raw: unknown): RoughnessMetallicFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'roughness-metallic') fail('initialData.type', "'roughness-metallic' 이 아니다");
  const stepMs = finiteAt(o.stepMs, 'initialData.stepMs');
  if (stepMs < 0) fail('initialData.stepMs', '음수다');
  if (!Array.isArray(o.points) || o.points.length === 0) fail('initialData.points', '빈 배열이거나 배열이 아니다');
  const points = o.points.map((p, i) => finiteAt(p, `initialData.points[${i}]`));
  if (new Set(points).size !== points.length) fail('initialData.points', '같은 x 가 둘 있다');
  const base = vec3At(o.base, 'initialData.base');
  base.forEach((c, i) => unitAt(c, `initialData.base[${i}]`));
  const lightIntensity = finiteAt(o.lightIntensity, 'initialData.lightIntensity');
  if (lightIntensity <= 0) fail('initialData.lightIntensity', '0 이하다');
  if (!Array.isArray(o.materials) || o.materials.length === 0) fail('initialData.materials', '빈 배열이거나 배열이 아니다');
  const materials = o.materials.map((m, i): RoughnessMetallicMaterial => {
    const path = `initialData.materials[${i}]`;
    if (typeof m !== 'object' || m === null) fail(path, '객체가 아니다');
    const r = m as Record<string, unknown>;
    if (typeof r.id !== 'string' || r.id === '') fail(`${path}.id`, '빈 문자열이거나 문자열이 아니다');
    const roughness = unitAt(r.roughness, `${path}.roughness`);
    if (roughness === 0) fail(`${path}.roughness`, '0 이면 GGX 의 α 가 0 이라 D 를 셈할 수 없다');
    return { id: r.id, metallic: unitAt(r.metallic, `${path}.metallic`), roughness };
  });
  if (new Set(materials.map((m) => m.id)).size !== materials.length) fail('initialData.materials', '같은 id 가 둘 있다');
  return {
    type: 'roughness-metallic',
    stepMs,
    normal: vec3At(o.normal, 'initialData.normal'),
    points,
    light: vec3At(o.light, 'initialData.light'),
    eye: vec3At(o.eye, 'initialData.eye'),
    lightIntensity,
    base,
    materials,
  };
}

// ---------------------------------------------------------------- 셈

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function unit(a: Vec3, what: string): Vec3 {
  const n = Math.sqrt(dot(a, a));
  if (n === 0) fail(what, '길이 0 벡터는 길이 1 로 맞출 수 없다');
  return [a[0] / n, a[1] / n, a[2] / n];
}

/** 표시 색의 한 채널 — 값 / (1 + 값). 셈은 자르지 않은 값으로 하고 칠할 때만 이것을 쓴다. */
export function displayTone(v: number): number {
  if (!Number.isFinite(v) || v < 0) fail('displayTone', `음수이거나 유한하지 않은 값 ${v}`);
  return v / (1 + v);
}

/** 면 위 점 하나(x, 0, 0)의 퍼진빛 · 번쩍임 · 합. */
export function shadePoint(data: RoughnessMetallicFacetData, x: number, mat: RoughnessMetallicMaterial): ShadedRow {
  const N = unit(data.normal, 'normal');
  const P: Vec3 = [x, 0, 0];
  const L = unit([data.light[0] - P[0], data.light[1] - P[1], data.light[2] - P[2]], `L at x=${x}`);
  const V = unit([data.eye[0] - P[0], data.eye[1] - P[1], data.eye[2] - P[2]], `V at x=${x}`);
  const NL = dot(N, L);
  const NV = dot(N, V);
  if (NL <= 0) fail(`x=${x}`, '빛이 면 뒤에 있다 (N·L ≤ 0)');
  if (NV <= 0) fail(`x=${x}`, '눈이 면 뒤에 있다 (N·V ≤ 0)');
  const H = unit([L[0] + V[0], L[1] + V[1], L[2] + V[2]], `H at x=${x}`);
  const NH = dot(N, H);
  const VH = dot(V, H);
  const alpha = mat.roughness * mat.roughness;
  const a2 = alpha * alpha;
  const D = a2 / (Math.PI * (NH * NH * (a2 - 1) + 1) ** 2);
  const k = alpha / 2;
  const g1 = (c: number): number => c / (c * (1 - k) + k);
  const G = g1(NL) * g1(NV);
  const E = data.lightIntensity;
  const channel = (c: number): { d: number; s: number } => {
    const F0 = F0_DIELECTRIC * (1 - mat.metallic) + c * mat.metallic;
    const F = F0 + (1 - F0) * (1 - VH) ** 5;
    const spec = (D * F * G) / (4 * NL * NV);
    const kd = (1 - F) * (1 - mat.metallic);
    return { d: ((kd * c) / Math.PI) * E * NL, s: spec * E * NL };
  };
  const r = channel(data.base[0]);
  const g = channel(data.base[1]);
  const b = channel(data.base[2]);
  return {
    x,
    diffuse: [r.d, g.d, b.d],
    specular: [r.s, g.s, b.s],
    total: [r.d + r.s, g.d + g.s, b.d + b.s],
  };
}

type Changed = 'first' | 'metallic' | 'roughness';

function changeOf(prev: RoughnessMetallicMaterial | null, next: RoughnessMetallicMaterial, i: number): { changed: Changed; from: number | null } {
  if (prev === null) return { changed: 'first', from: null };
  const dm = prev.metallic !== next.metallic;
  const dr = prev.roughness !== next.roughness;
  if (dm && dr) fail(`initialData.materials[${i}]`, '금속성과 거칠기가 함께 바뀌었다 — 한 걸음에 값 하나만');
  if (dm) return { changed: 'metallic', from: prev.metallic };
  if (dr) return { changed: 'roughness', from: prev.roughness };
  return fail(`initialData.materials[${i}]`, '앞 재질과 값이 같다');
}

export async function roughnessMetallic(ctx0: FacetContext<RoughnessMetallicFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<RoughnessMetallicFacetData>;
  const data = narrowRoughnessMetallicData(ctx.data);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(data.stepMs)) && !ctx.cancelled;
  }

  let prev: RoughnessMetallicMaterial | null = null;
  for (const [i, mat] of data.materials.entries()) {
    // 걸음 0 도 읽을 화면이라 첫 재질 앞에도 문을 둔다
    if (!(await pause())) return;
    const rows = data.points.map((x) => shadePoint(data, x, mat));
    const peak = rows.reduce((best, row) => (row.specular[0] > best.specular[0] ? row : best));
    const half = peak.specular[0] / 2;
    const spread = rows.filter((row) => row.specular[0] >= half).map((row) => row.x);
    const { changed, from } = changeOf(prev, mat, i);
    await ctx.emit({
      type: 'material',
      payload: {
        id: mat.id,
        metallic: mat.metallic,
        roughness: mat.roughness,
        changed,
        from,
        rows,
        peakX: peak.x,
        half,
        spread,
      },
    });
    prev = mat;
  }
}
