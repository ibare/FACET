/**
 * shrink-all — L2 벌점은 무게를 0 으로 만드는가.
 *
 * 무게 둘을 벌점 없이 맞춘 자리 a 에서 출발시켜, 손실
 *   ½·Σ(wᵢ − aᵢ)² + (λ/2)·Σwᵢ²
 * 의 경사로 갱신을 정해진 횟수만큼 한다. 갱신 한 번은
 *   wᵢ ← wᵢ − η·(wᵢ − aᵢ) − η·λ·wᵢ
 * 이고 "L2 몫" 은 갱신 앞의 무게로 셈한 η·λ·wᵢ 다.
 *
 * 이벤트
 *
 * - `init` (silent) — 걸음 0 의 셈값. 알고리즘이 셈한 처음 비율과 비.
 *   payload `{ w: [number, number]; ratio: [number, number]; quotient: number }`
 *   - `w`        시작 무게 (= a)
 *   - `ratio`    처음 대비 남은 비율 wᵢ / aᵢ
 *   - `quotient` 두 무게의 비 w₁ / w₂
 *
 * - `update` — 갱신 한 번 (걸음 하나).
 *   payload `{ k: number; from: [number, number]; w: [number, number];
 *              decay: [number, number]; ratio: [number, number]; quotient: number }`
 *   - `k`     갱신 번호 (1 부터)
 *   - `from`  갱신 앞의 무게
 *   - `w`     갱신 뒤의 무게
 *   - `decay` L2 몫 η·λ·wᵢ (갱신 앞의 무게로)
 *   - `ratio` · `quotient` 은 `init` 과 같은 뜻, 갱신 뒤의 값
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Pair = [number, number];

export type ShrinkAllFacetData = {
  type: 'shrink-all';
  stepMs: number;
  /** 무게 둘의 식별자 */
  ids: [string, string];
  /** 벌점 없이 맞춘 무게 a — 시작 무게이기도 하다 */
  fit: Pair;
  /** 학습률 η */
  eta: number;
  /** 벌점 세기 λ */
  lambda: number;
  /** 갱신 횟수 */
  updates: number;
};

function fail(path: string, why: string): never {
  throw new Error(`shrink-all: ${path} — ${why}`);
}

function finiteAt(v: unknown, path: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(path, '유한한 수가 아니다');
  return v;
}

function pairAt(v: unknown, path: string): Pair {
  if (!Array.isArray(v) || v.length !== 2) fail(path, '수 둘의 배열이 아니다');
  return [finiteAt(v[0], `${path}[0]`), finiteAt(v[1], `${path}[1]`)];
}

/** `initialData` 좁히개 — 알고리즘 · 장면 · 무대가 함께 쓴다. */
export function narrowShrinkAllData(raw: unknown): ShrinkAllFacetData {
  if (typeof raw !== 'object' || raw === null) fail('initialData', '객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'shrink-all') fail('initialData.type', `'shrink-all' 이 아니다`);
  const stepMs = finiteAt(d.stepMs, 'initialData.stepMs');
  if (stepMs <= 0) fail('initialData.stepMs', '양수가 아니다');
  const idsRaw = d.ids;
  if (!Array.isArray(idsRaw) || idsRaw.length !== 2) fail('initialData.ids', '식별자 둘이 아니다');
  const ids: [string, string] = [
    typeof idsRaw[0] === 'string' && idsRaw[0] !== '' ? idsRaw[0] : fail('initialData.ids[0]', '빈 식별자'),
    typeof idsRaw[1] === 'string' && idsRaw[1] !== '' ? idsRaw[1] : fail('initialData.ids[1]', '빈 식별자'),
  ];
  const fit = pairAt(d.fit, 'initialData.fit');
  if (!(fit[0] > 0 && fit[1] > 0)) fail('initialData.fit', '양수 무게가 아니다 — 남은 비율 w / a 를 셈할 수 없다');
  const eta = finiteAt(d.eta, 'initialData.eta');
  const lambda = finiteAt(d.lambda, 'initialData.lambda');
  if (!(eta > 0 && lambda > 0)) fail('initialData.eta · lambda', '양수가 아니다');
  const updates = finiteAt(d.updates, 'initialData.updates');
  if (!Number.isInteger(updates) || updates < 1) fail('initialData.updates', '1 이상의 정수가 아니다');
  return { type: 'shrink-all', stepMs, ids, fit, eta, lambda, updates };
}

/** 한 무게의 갱신 한 번 — 새 무게와 L2 몫. */
function stepOne(w: number, a: number, eta: number, lambda: number): { next: number; decay: number } {
  const decay = eta * lambda * w;
  return { next: w - eta * (w - a) - decay, decay };
}

export async function shrinkAll(rawCtx: FacetContext<ShrinkAllFacetData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<ShrinkAllFacetData>;
  const data = narrowShrinkAllData(ctx.data);
  const { fit, eta, lambda, updates, stepMs } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let w: Pair = [fit[0], fit[1]];
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { w: [w[0], w[1]], ratio: [w[0] / fit[0], w[1] / fit[1]], quotient: w[0] / w[1] },
  });

  for (let k = 1; k <= updates; k += 1) {
    // 걸음 0 은 이미 읽을 것이 있는 화면이라 첫 갱신 앞에도 머문다
    if (!(await pause())) return;
    const s0 = stepOne(w[0], fit[0], eta, lambda);
    const s1 = stepOne(w[1], fit[1], eta, lambda);
    if (!(s0.next > 0 && s1.next > 0)) {
      throw new Error(`shrink-all: 갱신 ${k} — 무게가 0 이하가 되었다. 남은 비율을 셈할 수 없다`);
    }
    const from: Pair = w;
    w = [s0.next, s1.next];
    await ctx.emit({
      type: 'update',
      payload: {
        k,
        from: [from[0], from[1]],
        w: [w[0], w[1]],
        decay: [s0.decay, s1.decay],
        ratio: [w[0] / fit[0], w[1] / fit[1]],
        quotient: w[0] / w[1],
      },
    });
  }
}
