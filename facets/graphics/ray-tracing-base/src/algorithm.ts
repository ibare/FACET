/**
 * 광선 추적의 바탕 — 평면 단면에서 픽셀 12 칸마다 광선 하나를 쏘아 유리 원을 굴절로 지나 벽 띠에 닿게 하고,
 * 닿은 자리에서 빛으로 그림자 광선을 쏘아 칸 색을 정한다. 손잡이는 유리의 굴절률 n 하나다.
 *
 * ── 규약 (공통 안내문 · 사양)
 * - 좌표는 x 오른쪽 · y 위. 눈은 +y 를 본다.
 * - 픽셀 k (0..count−1) 의 중심 x = left + (k + 0.5)·(right − left)/count. 광선은 눈에서 그 중심으로, 방향은 단위 벡터.
 * - 원과의 교차: 판별식 < 0 이면 빗나감(sqrt 전에 가른다). 근 둘 중 작은 것 먼저, ε = 1e−4 보다 큰 첫 근.
 * - 원에 닿는 t 가 벽까지의 t 보다 **작을 때만** 원에 닿는다. 바깥 법선 N = (점 − 중심)/r.
 *   D·N < 0 이면 들어감(법선 N, η = 1/n), 아니면 나옴(법선 −N, η = n) — 법선은 광선이 온 쪽을 본다.
 * - 스넬: cos i = −D·N, k = 1 − η²(1 − cos² i), T = ηD + (η cos i − √k)N 를 정규화. k < 0(전반사)은 던진다.
 * - 벽의 띠 번호 = floor((x − wall.left)/bandWidth). 띠 밖이면 던진다.
 * - 그림자 광선: 벽의 점 → 빛. 빛까지 거리 d 안(ε < t < d)에서 유리에 닿으면 막힘. 유리는 그림자 광선을 막는다.
 * - 칸 색 = 띠 색 × (빛이면 1, 막혔으면 shadowScale).
 * - 각(입사각 · 굴절각 · 꺾인 각)은 표시에만 쓴다 — acos · asin. 꺾인 각 = 처음 방향과 마지막 방향 사이.
 * - 동률 · 스침: 이 데이터에서는 걸리지 않는다 (사양의 여유 — 첫 광선 판별식 ≥ 0.454 · 벽 x 와 띠 경계 ≥ 0.050 ·
 *   그림자 판별식 ≥ 0.470 · 그림자 t 와 d 차 ≥ 10). 원 교차 t 와 벽 t 가 같으면 벽 쪽으로 친다(엄격한 <).
 *   셈할 수 없는 상태(전반사 · 벽에 못 닿음 · 띠 밖 · 원을 세 번 넘게 지남)는 던진다.
 *
 * ── 이벤트 (발신 차례 그대로)
 * - `scene-set` (silent) — 판 머리. 걸음 0 을 갈아 끼운다.
 *     { n: number, motionMs: number,
 *       eye: {x,y}, row: {y,left,right,count}, glass: {cx,cy,r}, light: {x,y},
 *       wall: {y,left,right,bandWidth,bands: [r,g,b][]},
 *       pixels: [{ k, x, straightX }] }            // x = 픽셀 중심, straightX = 곧게 갔다면 닿을 벽 x
 * - `rays-shot` — 걸음 1. 픽셀마다 첫 닿음까지.
 *     { rays: [{ k, from: {x,y}, to: {x,y}, hit: 'glass' | 'wall' }], glass: number, wall: number }
 * - `rays-entered` — 걸음 2. 유리에 닿은 광선이 들어가 나올 점까지.
 *     { rays: [{ k, from, to, angleIn, angleOut }], focus: { k, angleIn, angleOut }, bent: boolean }
 *       // focus = 유리를 지난 맨 왼쪽 픽셀, bent = focus 의 입사각과 굴절각이 소수 첫째에서 갈리는가
 * - `rays-exited` — 걸음 3. 나와서 벽까지.
 *     { rays: [{ k, from, to, straightX, wallX, bend }], maxBend: number, flippedPairs: number, bent: boolean }
 *       // bent = 가장 크게 꺾인 각이 소수 첫째에서 0 이 아닌가 (아니면 곧은 자리에 그대로 닿는다)
 * - `shadow-rays` — 걸음 4. 벽의 점에서 빛으로.
 *     { rays: [{ k, from, to, blocked: boolean }], shadowed: number, total: number }   // 막히면 to = 유리에 닿은 점
 * - `cells-shaded` — 걸음 5. 칸 색.
 *     { cells: [{ k, band, lit: boolean, color: [r,g,b] }], shadowScale: number }       // band 는 0 부터
 *
 * ── phase (irs.ts 와 같은 집합): `shoot` · `enter` · `exit` · `shadow` · `shade` — 각 걸음 발신 **앞에**, silent.
 *
 * ── 계기 (회차마다 이 값 — 누적 채널이라 차이만 보낸다, 모두 정수)
 * - `max-bend` 가장 크게 꺾인 각 (정수 도, 절반은 0 에서 먼 쪽) — 걸음 3
 * - `flipped-pairs` 벽 x 차례가 뒤집힌 이웃 짝 수 (이웃한 픽셀 11 짝 중) — 걸음 3
 * - `shadowed-pixels` 그림자 속 픽셀 수 — 걸음 4
 *   판 머리에서 셋 다 0 으로 되돌린다 (앞 판의 결론을 남기지 않는다).
 *
 * ── 입력: `refractive-index` { value: number } — 사다리(`indices`) 안의 값만. 어긋나면 던진다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RayTracingBaseData = {
  type: 'ray-tracing-base';
  stepMs: number;
  motionMs: number;
  eye: { x: number; y: number };
  row: { y: number; left: number; right: number; count: number };
  glass: { id: string; cx: number; cy: number; r: number };
  wall: { id: string; y: number; left: number; bandWidth: number; bands: number[][] };
  light: { id: string; x: number; y: number };
  shadowScale: number;
  indices: number[];
  defaultIndex: number;
};

export type Vec = { x: number; y: number };
export type Rgb = [number, number, number];

export type Crossing = { kind: 'enter' | 'exit'; point: Vec; t: number; angleIn: number; angleOut: number };

export type TracedPixel = {
  k: number;
  /** 픽셀 중심 x */
  x: number;
  dir0: Vec;
  firstHit: 'glass' | 'wall';
  crossings: Crossing[];
  dir: Vec;
  wallX: number;
  straightX: number;
  band: number;
  bend: number;
  lit: boolean;
  /** 그림자 광선이 끝나는 점 — 막히면 유리에 닿은 점, 아니면 빛 */
  shadowEnd: Vec;
  color: Rgb;
};

export const EPS = 1e-4;

// ───────────────────────── 좁히개

function num(v: unknown, where: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`ray-tracing-base: ${where} 가 수가 아니다`);
  return v;
}

function obj(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`ray-tracing-base: ${where} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function str(v: unknown, where: string): string {
  if (typeof v !== 'string') throw new Error(`ray-tracing-base: ${where} 가 문자열이 아니다`);
  return v;
}

/** ctx.data 를 좁힌다. 모양이 어긋나면 무엇이 어긋났는지 담아 던진다. */
export function readRayTracingBaseData(raw: unknown): RayTracingBaseData {
  const d = obj(raw, 'data');
  if (d.type !== 'ray-tracing-base') throw new Error(`ray-tracing-base: data.type 이 '${String(d.type)}'`);
  const eye = obj(d.eye, 'eye');
  const row = obj(d.row, 'row');
  const glass = obj(d.glass, 'glass');
  const wall = obj(d.wall, 'wall');
  const light = obj(d.light, 'light');
  if (!Array.isArray(wall.bands) || wall.bands.length === 0) throw new Error('ray-tracing-base: wall.bands 가 비었다');
  const bands = wall.bands.map((b, i) => {
    if (!Array.isArray(b) || b.length !== 3) throw new Error(`ray-tracing-base: wall.bands[${i}] 가 [r,g,b] 가 아니다`);
    return b.map((c, j) => num(c, `wall.bands[${i}][${j}]`));
  });
  if (!Array.isArray(d.indices) || d.indices.length === 0) throw new Error('ray-tracing-base: indices 가 비었다');
  const indices = d.indices.map((v, i) => num(v, `indices[${i}]`));
  const count = num(row.count, 'row.count');
  if (!Number.isInteger(count) || count <= 0) throw new Error(`ray-tracing-base: row.count ${count}`);
  const out: RayTracingBaseData = {
    type: 'ray-tracing-base',
    stepMs: num(d.stepMs, 'stepMs'),
    motionMs: num(d.motionMs, 'motionMs'),
    eye: { x: num(eye.x, 'eye.x'), y: num(eye.y, 'eye.y') },
    row: { y: num(row.y, 'row.y'), left: num(row.left, 'row.left'), right: num(row.right, 'row.right'), count },
    glass: { id: str(glass.id, 'glass.id'), cx: num(glass.cx, 'glass.cx'), cy: num(glass.cy, 'glass.cy'), r: num(glass.r, 'glass.r') },
    wall: { id: str(wall.id, 'wall.id'), y: num(wall.y, 'wall.y'), left: num(wall.left, 'wall.left'), bandWidth: num(wall.bandWidth, 'wall.bandWidth'), bands },
    light: { id: str(light.id, 'light.id'), x: num(light.x, 'light.x'), y: num(light.y, 'light.y') },
    shadowScale: num(d.shadowScale, 'shadowScale'),
    indices,
    defaultIndex: num(d.defaultIndex, 'defaultIndex'),
  };
  if (!indices.includes(out.defaultIndex)) throw new Error(`ray-tracing-base: defaultIndex ${out.defaultIndex} 가 사다리에 없다`);
  if (out.glass.r <= 0 || out.wall.bandWidth <= 0) throw new Error('ray-tracing-base: 반지름 · 띠 폭은 양수');
  return out;
}

// ───────────────────────── 셈

function unit(x: number, y: number): Vec {
  const norm = Math.sqrt(x * x + y * y);
  if (norm === 0) throw new Error('ray-tracing-base: 길이 0 벡터');
  return { x: x / norm, y: y / norm };
}

/** ε 보다 큰 첫 근. 없으면 null. 판별식은 sqrt 전에 가른다. */
export function hitCircle(o: Vec, d: Vec, g: { cx: number; cy: number; r: number }): number | null {
  const px = o.x - g.cx;
  const py = o.y - g.cy;
  const b = px * d.x + py * d.y;
  const c = px * px + py * py - g.r * g.r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const tNear = -b - s;
  if (tNear > EPS) return tNear;
  const tFar = -b + s;
  if (tFar > EPS) return tFar;
  return null;
}

/** nrm 은 광선이 온 쪽을 본다. 꺾인 단위 방향과 표시용 각(도). 전반사면 던진다. */
function refract(d: Vec, nrm: Vec, eta: number): { dir: Vec; angleIn: number; angleOut: number } {
  const cosi = -(d.x * nrm.x + d.y * nrm.y);
  if (!(cosi > 0)) throw new Error(`ray-tracing-base: 법선이 광선이 온 쪽을 보지 않는다 (cos i ${cosi})`);
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < 0) throw new Error('ray-tracing-base: 전반사 — 원을 굴절로만 지나는 이 장면에는 없어야 한다');
  const a = eta * cosi - Math.sqrt(k);
  const dir = unit(eta * d.x + a * nrm.x, eta * d.y + a * nrm.y);
  const sinOut = Math.min(1, eta * Math.sqrt(1 - cosi * cosi));
  return { dir, angleIn: (Math.acos(cosi) * 180) / Math.PI, angleOut: (Math.asin(sinOut) * 180) / Math.PI };
}

function angleBetween(a: Vec, b: Vec): number {
  const c = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y));
  return (Math.acos(c) * 180) / Math.PI;
}

export function pixelCenterX(data: RayTracingBaseData, k: number): number {
  const { left, right, count } = data.row;
  return left + ((k + 0.5) * (right - left)) / count;
}

export function tracePixel(data: RayTracingBaseData, k: number, n: number): TracedPixel {
  const { eye, glass, wall, light } = data;
  const x = pixelCenterX(data, k);
  const dir0 = unit(x - eye.x, data.row.y - eye.y);
  let o: Vec = { x: eye.x, y: eye.y };
  let d = dir0;
  const crossings: Crossing[] = [];
  let firstHit: 'glass' | 'wall' | null = null;
  for (;;) {
    const tHit = hitCircle(o, d, glass);
    const tWall = d.y > 0 ? (wall.y - o.y) / d.y : null;
    if (tHit === null || (tWall !== null && tWall <= tHit)) break;
    if (crossings.length >= 2) throw new Error(`ray-tracing-base: 픽셀 ${k + 1} 이 원을 세 번 넘게 지난다`);
    if (firstHit === null) firstHit = 'glass';
    const p = { x: o.x + tHit * d.x, y: o.y + tHit * d.y };
    const nOut = { x: (p.x - glass.cx) / glass.r, y: (p.y - glass.cy) / glass.r };
    const entering = d.x * nOut.x + d.y * nOut.y < 0;
    const r = entering ? refract(d, nOut, 1 / n) : refract(d, { x: -nOut.x, y: -nOut.y }, n);
    crossings.push({ kind: entering ? 'enter' : 'exit', point: p, t: tHit, angleIn: r.angleIn, angleOut: r.angleOut });
    o = p;
    d = r.dir;
  }
  if (firstHit === null) firstHit = 'wall';
  const kinds = crossings.map((c) => c.kind).join(',');
  if (kinds !== '' && kinds !== 'enter,exit') throw new Error(`ray-tracing-base: 픽셀 ${k + 1} 의 지난 면이 [${kinds}]`);
  if (!(d.y > 0)) throw new Error(`ray-tracing-base: 픽셀 ${k + 1} 의 광선이 벽에 닿지 않는다`);
  const tWall = (wall.y - o.y) / d.y;
  const wallX = o.x + tWall * d.x;
  const band = Math.floor((wallX - wall.left) / wall.bandWidth);
  if (band < 0 || band >= wall.bands.length) throw new Error(`ray-tracing-base: 픽셀 ${k + 1} 이 벽 밖 x ${wallX} 에 닿는다`);
  const straightX = eye.x + ((wall.y - eye.y) * dir0.x) / dir0.y;
  // 그림자 광선 — 벽의 점 → 빛
  const wp = { x: wallX, y: wall.y };
  const sx = light.x - wp.x;
  const sy = light.y - wp.y;
  const dist = Math.sqrt(sx * sx + sy * sy);
  const sd = { x: sx / dist, y: sy / dist };
  const tBlock = hitCircle(wp, sd, glass);
  const lit = !(tBlock !== null && tBlock < dist);
  const shadowEnd = lit || tBlock === null ? { x: light.x, y: light.y } : { x: wp.x + tBlock * sd.x, y: wp.y + tBlock * sd.y };
  const scale = lit ? 1 : data.shadowScale;
  const bandColor = wall.bands[band]!;
  const color: Rgb = [bandColor[0]! * scale, bandColor[1]! * scale, bandColor[2]! * scale];
  return { k, x, dir0, firstHit, crossings, dir: d, wallX, straightX, band, bend: angleBetween(dir0, d), lit, shadowEnd, color };
}

export function traceRow(data: RayTracingBaseData, n: number): TracedPixel[] {
  const out: TracedPixel[] = [];
  for (let k = 0; k < data.row.count; k += 1) out.push(tracePixel(data, k, n));
  return out;
}

/** 절반은 0 에서 먼 쪽으로 정수 반올림 */
export function roundHalfAway(v: number): number {
  const r = Math.floor(Math.abs(v) + 0.5);
  return r === 0 ? 0 : Math.sign(v) * r;
}

export type RowSummary = { glass: number; maxBend: number; flippedPairs: number; shadowed: number };

export function summarize(traced: TracedPixel[]): RowSummary {
  let flippedPairs = 0;
  for (let i = 0; i + 1 < traced.length; i += 1) if (traced[i]!.wallX > traced[i + 1]!.wallX) flippedPairs += 1;
  return {
    glass: traced.filter((p) => p.firstHit === 'glass').length,
    maxBend: Math.max(...traced.map((p) => p.bend)),
    flippedPairs,
    shadowed: traced.filter((p) => !p.lit).length,
  };
}

// ───────────────────────── 재생

export async function rayTracingBaseAlgorithm(ctx: FacetContext<RayTracingBaseData>): Promise<void> {
  const rc = ctx as ReactiveContext<RayTracingBaseData>;
  const data = readRayTracingBaseData(ctx.data);
  const { wall } = data;
  const wallRight = wall.left + wall.bandWidth * wall.bands.length;
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    ctx.metric(name, value - (shown.get(name) ?? 0));
    shown.set(name, value);
  };
  let n = data.defaultIndex;

  try {
    while (!ctx.cancelled) {
      const traced = traceRow(data, n);
      const sum = summarize(traced);

      // 걸음 0 — 판 머리
      await ctx.emit({
        type: 'scene-set',
        payload: {
          n,
          motionMs: data.motionMs,
          eye: { ...data.eye },
          row: { ...data.row },
          glass: { cx: data.glass.cx, cy: data.glass.cy, r: data.glass.r },
          light: { x: data.light.x, y: data.light.y },
          wall: { y: wall.y, left: wall.left, right: wallRight, bandWidth: wall.bandWidth, bands: wall.bands.map((b) => [...b]) },
          pixels: traced.map((p) => ({ k: p.k, x: p.x, straightX: p.straightX })),
        },
        silent: true,
      });
      setMetric('max-bend', 0);
      setMetric('flipped-pairs', 0);
      setMetric('shadowed-pixels', 0);
      if (!(await rc.sleep(data.stepMs + data.motionMs))) return;

      // 걸음 1 — 첫 닿음까지
      await phase('shoot');
      await ctx.emit({
        type: 'rays-shot',
        payload: {
          rays: traced.map((p) => ({
            k: p.k,
            from: { ...data.eye },
            to: p.firstHit === 'glass' ? { ...p.crossings[0]!.point } : { x: p.wallX, y: wall.y },
            hit: p.firstHit,
          })),
          glass: sum.glass,
          wall: traced.length - sum.glass,
        },
      });
      if (!(await rc.sleep(data.stepMs))) return;

      // 걸음 2 — 들어가며 꺾여 나올 점까지
      const through = traced.filter((p) => p.crossings.length === 2);
      const focus = through[0];
      if (!focus) throw new Error('ray-tracing-base: 유리를 지나는 광선이 없다');
      await phase('enter');
      await ctx.emit({
        type: 'rays-entered',
        payload: {
          rays: through.map((p) => ({
            k: p.k,
            from: { ...p.crossings[0]!.point },
            to: { ...p.crossings[1]!.point },
            angleIn: p.crossings[0]!.angleIn,
            angleOut: p.crossings[0]!.angleOut,
          })),
          focus: { k: focus.k, angleIn: focus.crossings[0]!.angleIn, angleOut: focus.crossings[0]!.angleOut },
          // 꺾였는가 — 표시 자리(소수 첫째)에서 입사각과 굴절각이 갈리는가를 정수로 견준다
          bent: roundHalfAway((focus.crossings[0]!.angleIn - focus.crossings[0]!.angleOut) * 10) !== 0,
        },
      });
      if (!(await rc.sleep(data.stepMs))) return;

      // 걸음 3 — 나와서 벽까지 (곧은 자리 → 실제 자리)
      await phase('exit');
      await ctx.emit({
        type: 'rays-exited',
        payload: {
          rays: through.map((p) => ({
            k: p.k,
            from: { ...p.crossings[1]!.point },
            to: { x: p.wallX, y: wall.y },
            straightX: p.straightX,
            wallX: p.wallX,
            bend: p.bend,
          })),
          maxBend: sum.maxBend,
          flippedPairs: sum.flippedPairs,
          // 꺾였는가 — 표시 자리(소수 첫째)에서 가장 크게 꺾인 각이 0 이 아닌가를 정수로 견준다
          bent: roundHalfAway(sum.maxBend * 10) !== 0,
        },
      });
      setMetric('max-bend', roundHalfAway(sum.maxBend));
      setMetric('flipped-pairs', sum.flippedPairs);
      if (!(await rc.sleep(data.stepMs))) return;

      // 걸음 4 — 그림자 광선
      await phase('shadow');
      await ctx.emit({
        type: 'shadow-rays',
        payload: {
          rays: traced.map((p) => ({ k: p.k, from: { x: p.wallX, y: wall.y }, to: { ...p.shadowEnd }, blocked: !p.lit })),
          shadowed: sum.shadowed,
          total: traced.length,
        },
      });
      setMetric('shadowed-pixels', sum.shadowed);
      if (!(await rc.sleep(data.stepMs))) return;

      // 걸음 5 — 칸 색
      await phase('shade');
      await ctx.emit({
        type: 'cells-shaded',
        payload: {
          cells: traced.map((p) => ({ k: p.k, band: p.band, lit: p.lit, color: [...p.color] })),
          shadowScale: data.shadowScale,
        },
      });

      // 손잡이 기다림
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rc.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'refractive-index') continue;
        const p = input.payload;
        const value = typeof p === 'object' && p !== null ? (p as { value?: unknown }).value : undefined;
        if (typeof value !== 'number' || !data.indices.includes(value)) {
          throw new Error(`ray-tracing-base: refractive-index 의 값 ${String(value)} 이 사다리 [${data.indices.join(', ')}] 에 없다`);
        }
        n = value;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
