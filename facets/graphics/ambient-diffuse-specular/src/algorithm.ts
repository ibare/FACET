/**
 * ambient-diffuse-specular — 한 점의 색에 세 몫(바탕빛 · 퍼진빛 · 번쩍임)이 차례로 얹힌다.
 *
 * 모형 (퐁 반사 모델, 한 점에서의 식):
 *   바탕빛 몫 = C ⊙ A                       (채널마다 곱, 방향을 보지 않는다)
 *   퍼진빛 몫 = k_d · C ⊙ I · max(0, N·L)    (물체 색을 띤다)
 *   R = 2(N·L)N − L
 *   번쩍임 몫 = k_s · I · max(0, R·V)^n      (빛의 색을 띤다 — 물체 색을 곱하지 않는다)
 *   점의 색 = 세 몫의 합
 * 방향 벡터는 모두 면에서 나가는 쪽. 법선에서 잰 부호 있는 각 θ 의 방향은 (sin θ, cos θ, 0).
 *
 * 이벤트 (발신 차례대로):
 *   init      silent  { sum: [r, g, b] }
 *             점의 색의 출발값. 식이 정하는 값(세 몫을 얹기 전)이라 알고리즘이 보낸다.
 *   add-part          { part: 'ambient' | 'diffuse' | 'specular', amount: [r, g, b],
 *                       sum: [r, g, b], factor: number | null }
 *             한 몫을 얹는다. amount 는 그 몫, sum 은 얹은 뒤 점의 색.
 *             factor 는 그 몫이 따르는 값 — diffuse 는 max(0, N·L), specular 는 max(0, R·V)^n,
 *             ambient 는 따르는 방향이 없어 null.
 *   reflect           { dir: [x, y, z], rv: number }
 *             반사 방향 R(길이 1)과 R·V 를 셈한다. 색은 바뀌지 않는다.
 *
 * 걸음 다섯 (걸음 0 포함): 처음 · 바탕빛 · 퍼진빛 · 반사 방향 · 번쩍임.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec3 = readonly [number, number, number];
export type Rgb = readonly [number, number, number];
export type PartId = 'ambient' | 'diffuse' | 'specular';

export type AmbientDiffuseSpecularFacetData = {
  type: 'ambient-diffuse-specular';
  /** 면의 법선 */
  normal: Vec3;
  /** 빛 쪽 L — 법선에서 잰 부호 있는 각(도) */
  lightDeg: number;
  /** 눈 쪽 V — 법선에서 잰 부호 있는 각(도) */
  eyeDeg: number;
  /** 물체 색 C */
  objectColor: Rgb;
  /** 바탕빛 A */
  ambientLight: Rgb;
  /** 빛 색 I */
  lightColor: Rgb;
  kd: number;
  ks: number;
  /** 광택 지수 n */
  shininess: number;
  stepMs: number;
};

function triple(raw: unknown, path: string): Vec3 {
  if (!Array.isArray(raw) || raw.length !== 3) throw new Error(`${path}: 세 수의 배열이어야 한다`);
  const out = raw.map((x, i) => {
    if (typeof x !== 'number' || !Number.isFinite(x)) throw new Error(`${path}[${i}]: 수가 아니다`);
    return x;
  });
  return [out[0]!, out[1]!, out[2]!];
}

function colorTriple(raw: unknown, path: string): Rgb {
  const c = triple(raw, path);
  c.forEach((x, i) => {
    if (x < 0 || x > 1) throw new Error(`${path}[${i}]: 0..1 밖이다 (${x})`);
  });
  return c;
}

function finite(raw: unknown, path: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw new Error(`${path}: 수가 아니다`);
  return raw;
}

/** `ctx.data` · 장면 `initial` 이 함께 쓰는 좁히개. 모양이 어긋나면 던진다. */
export function narrowAdsData(raw: unknown): AmbientDiffuseSpecularFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('initialData: 객체가 아니다');
  const r = raw as Record<string, unknown>;
  if (r.type !== 'ambient-diffuse-specular') throw new Error(`initialData.type: ambient-diffuse-specular 가 아니다 (${String(r.type)})`);
  const lightDeg = finite(r.lightDeg, 'initialData.lightDeg');
  const eyeDeg = finite(r.eyeDeg, 'initialData.eyeDeg');
  if (Math.abs(lightDeg) >= 90) throw new Error(`initialData.lightDeg: 빛이 면 뒤에 있다 (${lightDeg}°)`);
  if (Math.abs(eyeDeg) >= 90) throw new Error(`initialData.eyeDeg: 눈이 면 뒤에 있다 (${eyeDeg}°)`);
  const shininess = finite(r.shininess, 'initialData.shininess');
  if (shininess <= 0) throw new Error(`initialData.shininess: 0 보다 커야 한다 (${shininess})`);
  const stepMs = finite(r.stepMs, 'initialData.stepMs');
  if (stepMs < 0) throw new Error(`initialData.stepMs: 음수다 (${stepMs})`);
  return {
    type: 'ambient-diffuse-specular',
    normal: unit(triple(r.normal, 'initialData.normal'), 'initialData.normal'),
    lightDeg,
    eyeDeg,
    objectColor: colorTriple(r.objectColor, 'initialData.objectColor'),
    ambientLight: colorTriple(r.ambientLight, 'initialData.ambientLight'),
    lightColor: colorTriple(r.lightColor, 'initialData.lightColor'),
    kd: finite(r.kd, 'initialData.kd'),
    ks: finite(r.ks, 'initialData.ks'),
    shininess,
    stepMs,
  };
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/** 길이 1 로 맞춘다. 길이 0 이면 던진다. */
export function unit(v: Vec3, path: string): Vec3 {
  const len = Math.sqrt(dot(v, v));
  if (len === 0) throw new Error(`${path}: 길이 0 벡터는 맞출 수 없다`);
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** 법선에서 잰 부호 있는 각(도)의 방향 (sin θ, cos θ, 0) — 바탕에서 정해지는 작은 셈이라 그림도 부른다. */
export function dirOf(deg: number): Vec3 {
  const r = (deg * Math.PI) / 180;
  return unit([Math.sin(r), Math.cos(r), 0], `dirOf(${deg})`);
}

/** R = 2(N·L)N − L (L 은 면에서 나가는 쪽) */
function reflectAbout(l: Vec3, n: Vec3): Vec3 {
  const k = 2 * dot(n, l);
  return [k * n[0] - l[0], k * n[1] - l[1], k * n[2] - l[2]];
}

function addRgb(a: Rgb, b: Rgb): Rgb {
  const s: Rgb = [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  s.forEach((x, i) => {
    if (x > 1) throw new Error(`점의 색 채널 ${i}: 1 을 넘는다 (${x}) — 이 조각은 자르기를 다루지 않는다`);
  });
  return s;
}

export async function ambientDiffuseSpecular(
  ctx: FacetContext<AmbientDiffuseSpecularFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<AmbientDiffuseSpecularFacetData>;
  const data = narrowAdsData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const n = data.normal;
  const l = dirOf(data.lightDeg);
  const v = dirOf(data.eyeDeg);
  const nl = dot(n, l);
  if (nl <= 0) throw new Error(`빛이 면 뒤에 있다 (N·L ${nl})`);
  if (dot(n, v) <= 0) throw new Error(`눈이 면 뒤에 있다 (N·V ${dot(n, v)})`);
  const c = data.objectColor;
  const a = data.ambientLight;
  const i = data.lightColor;

  let sum: Rgb = [0, 0, 0];
  await rctx.emit({ type: 'init', silent: true, payload: { sum } });

  // 걸음 0 은 이미 점 · 법선 · 빛 · 눈이 선 화면이다 — 읽을 틈을 준다.
  if (!(await pause())) return;

  // 1 바탕빛 — 방향을 보지 않는다
  const ambient: Rgb = [c[0] * a[0], c[1] * a[1], c[2] * a[2]];
  sum = addRgb(sum, ambient);
  await rctx.emit({ type: 'add-part', payload: { part: 'ambient', amount: ambient, sum, factor: null } });
  if (!(await pause())) return;

  // 2 퍼진빛 — N·L 을 따르고 물체 색을 띤다
  const lambert = Math.max(0, nl);
  const diffuse: Rgb = [
    data.kd * c[0] * i[0] * lambert,
    data.kd * c[1] * i[1] * lambert,
    data.kd * c[2] * i[2] * lambert,
  ];
  sum = addRgb(sum, diffuse);
  await rctx.emit({ type: 'add-part', payload: { part: 'diffuse', amount: diffuse, sum, factor: lambert } });
  if (!(await pause())) return;

  // 3 반사 방향 R — 색은 그대로
  const r = unit(reflectAbout(l, n), 'R');
  const rv = dot(r, v);
  await rctx.emit({ type: 'reflect', payload: { dir: r, rv } });
  if (!(await pause())) return;

  // 4 번쩍임 — R·V 를 따르고 빛의 색을 띤다
  const power = Math.max(0, rv) ** data.shininess;
  const specular: Rgb = [data.ks * i[0] * power, data.ks * i[1] * power, data.ks * i[2] * power];
  sum = addRgb(sum, specular);
  await rctx.emit({ type: 'add-part', payload: { part: 'specular', amount: specular, sum, factor: power } });
}
