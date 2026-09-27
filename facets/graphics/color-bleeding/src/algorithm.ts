/**
 * color-bleeding — 흰 바닥이 빨간 벽 가까이에서 붉어진다 (평면 래디오시티, 한 번 더 튐).
 *
 * 규약
 *   - 형태 계수 F(i→j) 는 교차 끈 방법(Hottel):
 *       F = (교차한 두 끈의 합 − 교차하지 않은 두 끈의 합) / (2 · i 의 길이)
 *     방이 볼록이라 가림이 없고, 볼록 사각형에서 교차한 두 끈의 합은 교차하지 않은
 *     두 끈의 합보다 작지 않다(삼각 부등식). 그래서 두 합의 큰 쪽이 교차한 끈이다.
 *     한 직선 위의 두 선분은 두 합이 같아 F = 0.
 *   - 각 패치에서 나머지 전부로의 F 합이 1 이 아니면 닫힌 볼록 방이 아니다 — 던진다.
 *   - 직접광 B₁ = ρ · F(→빛) · E (채널마다 곱).
 *   - 모음 B = B₁ + ρ · Σ_벽 F(→벽) · B₁(벽). 보내는 쪽은 senders 의 B₁ 이다.
 *
 * 이벤트
 *   direct   (silent 아님) 빛을 내지 않는 패치 전부의 직접광.
 *            payload: { items: { id: string; formToLight: number; value: [r, g, b] }[] }
 *            items 의 차례는 initialData.patches 의 차례다.
 *   gather   (silent 아님) 받는 패치 하나가 벽들의 B₁ 을 모은다. receivers 차례로 한 번씩.
 *            payload: { id: string;
 *                       parts: { from: string; form: number }[];   // senders 차례
 *                       added: [r, g, b];                           // ρ · Σ F · B₁(벽)
 *                       before: [r, g, b];                          // 그 패치의 B₁
 *                       after: [r, g, b];                           // before + added
 *                       redMinusGreen: number }                     // after 의 R − G
 *
 * 걸음: 0 처음(방 · 패치, 아직 빛 없음) · 1 direct · 2.. gather (receivers 수만큼).
 * 걸음 0 이 읽을 것이 있는 화면이라 첫 발신 앞에도 stepMs 를 둔다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Vec2 = readonly [number, number];
export type Rgb = readonly [number, number, number];

export type Emitter = { id: string; a: Vec2; b: Vec2; emission: Rgb };
export type Patch = { id: string; a: Vec2; b: Vec2; rho: Rgb };

export type ColorBleedingFacetData = {
  type: 'color-bleeding';
  stepMs: number;
  emitter: Emitter;
  patches: Patch[];
  /** 한 번 더 튄 빛을 모으는 패치 (차례대로) */
  receivers: string[];
  /** 모을 때 빛을 보내는 패치 */
  senders: string[];
};

const FORM_SUM_TOL = 1e-9;

function fail(path: string, why: string): never {
  throw new Error(`color-bleeding: ${path} — ${why}`);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function narrowNum(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function narrowVec2(v: unknown, path: string): Vec2 {
  if (!Array.isArray(v) || v.length !== 2) fail(path, '(x, y) 둘이 아니다');
  return [narrowNum(v[0], `${path}[0]`), narrowNum(v[1], `${path}[1]`)];
}

function narrowRgb(v: unknown, path: string): Rgb {
  if (!Array.isArray(v) || v.length !== 3) fail(path, 'RGB 셋이 아니다');
  const out: [number, number, number] = [0, 0, 0];
  for (let ch = 0; ch < 3; ch += 1) {
    const x = narrowNum(v[ch], `${path}[${ch}]`);
    if (x < 0 || x > 1) fail(`${path}[${ch}]`, '0..1 밖이다');
    out[ch] = x;
  }
  return out;
}

function narrowId(v: unknown, path: string): string {
  if (typeof v !== 'string' || v.length === 0) fail(path, '식별자가 아니다');
  return v;
}

function narrowIdList(v: unknown, path: string, known: ReadonlySet<string>): string[] {
  if (!Array.isArray(v) || v.length === 0) fail(path, '식별자 목록이 아니다');
  const seen = new Set<string>();
  return v.map((x, i) => {
    const id = narrowId(x, `${path}[${i}]`);
    if (!known.has(id)) fail(`${path}[${i}]`, `패치에 없는 식별자 ${id}`);
    if (seen.has(id)) fail(`${path}[${i}]`, `겹친 식별자 ${id}`);
    seen.add(id);
    return id;
  });
}

/** initialData 좁히개 — 알고리즘 · 장면 · 그림이 같이 쓴다. 어긋나면 던진다. */
export function narrowColorBleedingData(raw: unknown): ColorBleedingFacetData {
  if (!isRecord(raw)) fail('data', '객체가 아니다');
  if (raw.type !== 'color-bleeding') fail('data.type', "'color-bleeding' 이 아니다");
  const stepMs = narrowNum(raw.stepMs, 'data.stepMs');
  if (stepMs <= 0) fail('data.stepMs', '0 보다 커야 한다');
  const e = raw.emitter;
  if (!isRecord(e)) fail('data.emitter', '객체가 아니다');
  const emitter: Emitter = {
    id: narrowId(e.id, 'data.emitter.id'),
    a: narrowVec2(e.a, 'data.emitter.a'),
    b: narrowVec2(e.b, 'data.emitter.b'),
    emission: narrowRgb(e.emission, 'data.emitter.emission'),
  };
  if (!Array.isArray(raw.patches) || raw.patches.length === 0) fail('data.patches', '배열이 아니다');
  const ids = new Set<string>([emitter.id]);
  const patches: Patch[] = raw.patches.map((p: unknown, i: number) => {
    const path = `data.patches[${i}]`;
    if (!isRecord(p)) fail(path, '객체가 아니다');
    const id = narrowId(p.id, `${path}.id`);
    if (ids.has(id)) fail(`${path}.id`, `겹친 식별자 ${id}`);
    ids.add(id);
    return {
      id,
      a: narrowVec2(p.a, `${path}.a`),
      b: narrowVec2(p.b, `${path}.b`),
      rho: narrowRgb(p.rho, `${path}.rho`),
    };
  });
  const patchIds = new Set(patches.map((p) => p.id));
  const receivers = narrowIdList(raw.receivers, 'data.receivers', patchIds);
  const senders = narrowIdList(raw.senders, 'data.senders', patchIds);
  for (const r of receivers) {
    if (senders.includes(r)) fail('data.receivers', `${r} 가 보내는 쪽에도 있다`);
  }
  return { type: 'color-bleeding', stepMs, emitter, patches, receivers, senders };
}

function dist(p: Vec2, q: Vec2): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1]);
}

/** 교차 끈 방법의 형태 계수 F(from→to). 길이 0 인 선분이면 던진다. */
export function formFactor(from: { a: Vec2; b: Vec2 }, to: { a: Vec2; b: Vec2 }): number {
  const len = dist(from.a, from.b);
  if (len === 0) fail('formFactor', '길이 0 인 패치');
  if (dist(to.a, to.b) === 0) fail('formFactor', '길이 0 인 패치');
  const straight = dist(from.a, to.a) + dist(from.b, to.b);
  const swapped = dist(from.a, to.b) + dist(from.b, to.a);
  const crossed = Math.max(straight, swapped);
  const uncrossed = Math.min(straight, swapped);
  return (crossed - uncrossed) / (2 * len);
}

function requirePatch(data: ColorBleedingFacetData, id: string): Patch {
  const p = data.patches.find((x) => x.id === id);
  if (p === undefined) fail('patch', `없는 식별자 ${id}`);
  return p;
}

export async function colorBleeding(ctxBase: FacetContext<ColorBleedingFacetData>): Promise<void> {
  const ctx = ctxBase as ReactiveContext<ColorBleedingFacetData>;
  const data = narrowColorBleedingData(ctx.data);
  const stepMs = data.stepMs;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 닫힌 볼록 방인가 — 각 패치에서 나머지 전부로의 F 합이 1
  const all: { id: string; a: Vec2; b: Vec2 }[] = [data.emitter, ...data.patches];
  for (const p of data.patches) {
    let sum = 0;
    for (const q of all) {
      if (q.id === p.id) continue;
      sum += formFactor(p, q);
    }
    if (Math.abs(sum - 1) > FORM_SUM_TOL) fail(`patch ${p.id}`, `형태 계수 합이 1 이 아니다 (${sum})`);
  }

  // 걸음 1 — 직접광
  const direct = new Map<string, Rgb>();
  const items = data.patches.map((p) => {
    const form = formFactor(p, data.emitter);
    const value: Rgb = [
      p.rho[0] * form * data.emitter.emission[0],
      p.rho[1] * form * data.emitter.emission[1],
      p.rho[2] * form * data.emitter.emission[2],
    ];
    direct.set(p.id, value);
    return { id: p.id, formToLight: form, value };
  });

  if (!(await pause())) return;
  await ctx.emit({ type: 'direct', payload: { items } });

  // 걸음 2.. — 받는 패치 하나씩 벽들의 B₁ 을 모은다
  for (const rid of data.receivers) {
    if (!(await pause())) return;
    const receiver = requirePatch(data, rid);
    const before = direct.get(rid);
    if (before === undefined) fail(`receiver ${rid}`, '직접광이 없다');
    const added: [number, number, number] = [0, 0, 0];
    const parts = data.senders.map((sid) => {
      const sender = requirePatch(data, sid);
      const sent = direct.get(sid);
      if (sent === undefined) fail(`sender ${sid}`, '직접광이 없다');
      const form = formFactor(receiver, sender);
      for (let ch = 0; ch < 3; ch += 1) added[ch] += receiver.rho[ch] * form * sent[ch];
      return { from: sid, form };
    });
    const after: Rgb = [before[0] + added[0], before[1] + added[1], before[2] + added[2]];
    await ctx.emit({
      type: 'gather',
      payload: { id: rid, parts, added, before, after, redMinusGreen: after[0] - after[1] },
    });
  }
}
