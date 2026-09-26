/**
 * local-minimum — 경사 하강이 멈춘 곳은 가장 낮은 곳인가.
 *
 * 무게 하나 w 를 네제곱 손실 L(w) = a4·w⁴ + a2·w² + a1·w 위에서 w ← w − η·g(w) 로 옮긴다.
 * g 는 갱신 전 자리에서 셈한다. 갱신 뒤 자리의 |g| 가 문턱(stopBelow) 아래면 그 갱신에서 멈춘다.
 * "가장 낮은 곳" 은 격자 훑기로 셈한다 — w_i = i / div (i 는 정수, 구간 끝을 div 배 한 값 사이).
 *
 * 이벤트
 *
 *   init    (silent: true)  바탕 — 걸음 0 을 갈아 끼운다
 *     payload {
 *       samples: { w: number; l: number }[]   // 그릴 창 안의 격자 표본 (w 오름차순)
 *       lLo: number; lHi: number             // 창 안 L 의 가장 작은 값 · 가장 큰 값
 *       lowest: { w: number; l: number }      // 격자에서 L 이 가장 작은 자리
 *       start: { w: number; l: number; g: number; gap: number }  // 처음 자리. gap = l − lowest.l
 *       stopBelow: number
 *     }
 *
 *   update  (silent 아님)   갱신 한 번 = 걸음 하나
 *     payload {
 *       k: number                                               // 몇 번째 갱신 (1 부터)
 *       from: { w: number; l: number; g: number; gap: number }  // 갱신 전 자리
 *       to:   { w: number; l: number; g: number; gap: number }  // 갱신 뒤 자리
 *       moved: number                                           // |to.w − from.w|
 *       stopped: boolean                                        // |to.g| < stopBelow
 *       hill: { w: number; l: number } | null                   // 멈춘 갱신에서만 — 가장 낮은 곳과 멈춘 자리 사이 격자 중 L 이 가장 큰 자리
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LossCoefficients = { a4: number; a2: number; a1: number };

export type LocalMinimumFacetData = {
  type: 'local-minimum';
  stepMs: number;
  /** L(w) = a4·w⁴ + a2·w² + a1·w */
  loss: LossCoefficients;
  eta: number;
  w0: number;
  /** 갱신 뒤 자리의 |g| 가 이것보다 작으면 멈춘다 */
  stopBelow: number;
  /** 훑는 구간과 격자 — w_i = i / div, i 는 scanFrom·div … scanTo·div 의 정수 */
  scanFrom: number;
  scanTo: number;
  scanDiv: number;
};

export type Spot = { w: number; l: number };
export type Point = { w: number; l: number; g: number; gap: number };

/** 멈춤 문턱에 끝내 닿지 않는 자료를 가르는 안전 상한. 이 자료에서는 닿지 않는다. */
const MAX_UPDATES = 30;

function num(o: Record<string, unknown>, key: string, where: string): number {
  const v = o[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`local-minimum: ${where}.${key} 는 유한한 수여야 한다 (받은 값 ${String(v)})`);
  }
  return v;
}

/** initialData 좁히개 — 알고리즘과 장면이 함께 부른다. 값을 베껴 새 객체로 돌려준다. */
export function narrowLocalMinimumData(raw: unknown): LocalMinimumFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('local-minimum: initialData 가 객체가 아니다');
  const o = raw as Record<string, unknown>;
  if (o.type !== 'local-minimum') throw new Error(`local-minimum: initialData.type 이 'local-minimum' 이 아니다 (${String(o.type)})`);
  const lossRaw = o.loss;
  if (typeof lossRaw !== 'object' || lossRaw === null) throw new Error('local-minimum: initialData.loss 가 객체가 아니다');
  const lo = lossRaw as Record<string, unknown>;
  const data: LocalMinimumFacetData = {
    type: 'local-minimum',
    stepMs: num(o, 'stepMs', 'initialData'),
    loss: { a4: num(lo, 'a4', 'initialData.loss'), a2: num(lo, 'a2', 'initialData.loss'), a1: num(lo, 'a1', 'initialData.loss') },
    eta: num(o, 'eta', 'initialData'),
    w0: num(o, 'w0', 'initialData'),
    stopBelow: num(o, 'stopBelow', 'initialData'),
    scanFrom: num(o, 'scanFrom', 'initialData'),
    scanTo: num(o, 'scanTo', 'initialData'),
    scanDiv: num(o, 'scanDiv', 'initialData'),
  };
  if (data.eta <= 0) throw new Error('local-minimum: initialData.eta 는 0 보다 커야 한다');
  if (data.stopBelow <= 0) throw new Error('local-minimum: initialData.stopBelow 는 0 보다 커야 한다');
  if (!(data.scanFrom < data.scanTo)) throw new Error('local-minimum: initialData.scanFrom 은 scanTo 보다 작아야 한다');
  if (!Number.isInteger(data.scanDiv) || data.scanDiv <= 0) throw new Error('local-minimum: initialData.scanDiv 는 양의 정수여야 한다');
  if (!Number.isInteger(data.scanFrom * data.scanDiv) || !Number.isInteger(data.scanTo * data.scanDiv)) {
    throw new Error('local-minimum: 훑는 구간 끝이 격자 위에 있지 않다 (scanFrom·scanDiv, scanTo·scanDiv 가 정수여야 한다)');
  }
  if (data.w0 < data.scanFrom || data.w0 > data.scanTo) throw new Error('local-minimum: initialData.w0 가 훑는 구간 밖이다');
  return data;
}

export function lossAt(c: LossCoefficients, w: number): number {
  return c.a4 * w ** 4 + c.a2 * w ** 2 + c.a1 * w;
}

export function slopeAt(c: LossCoefficients, w: number): number {
  return 4 * c.a4 * w ** 3 + 2 * c.a2 * w + c.a1;
}

/** 격자 자리 — 정수 i 를 만들고 나눈다 (0.01 을 거듭 더하면 끝자리가 흐른다). */
function gridPoints(d: LocalMinimumFacetData): number[] {
  const out: number[] = [];
  for (let i = d.scanFrom * d.scanDiv; i <= d.scanTo * d.scanDiv; i += 1) out.push(i / d.scanDiv);
  return out;
}

export async function localMinimum(ctx0: FacetContext<LocalMinimumFacetData>): Promise<void> {
  const ctx = ctx0 as ReactiveContext<LocalMinimumFacetData>;
  const d = narrowLocalMinimumData(ctx.data);
  const c = d.loss;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(d.stepMs)) && !ctx.cancelled;
  }

  // 격자 훑기 — 가장 낮은 자리. 동률이면 가를 규약이 없으니 던진다.
  const grid = gridPoints(d);
  let lowest: Spot | null = null;
  let tied = false;
  for (const w of grid) {
    const l = lossAt(c, w);
    if (lowest === null || l < lowest.l) {
      lowest = { w, l };
      tied = false;
    } else if (l === lowest.l) {
      tied = true;
    }
  }
  if (lowest === null) throw new Error('local-minimum: 훑을 격자 자리가 없다');
  if (tied) throw new Error(`local-minimum: 격자에서 가장 낮은 자리가 둘 이상이다 (L ${lowest.l})`);
  const floor = lowest;

  // 그릴 창 — 처음 자리의 L 보다 낮거나 같은 격자 자리의 왼쪽 끝부터 오른쪽 끝까지
  const l0 = lossAt(c, d.w0);
  let first = -1;
  let last = -1;
  grid.forEach((w, i) => {
    if (lossAt(c, w) <= l0) {
      if (first < 0) first = i;
      last = i;
    }
  });
  if (first < 0) throw new Error('local-minimum: 처음 자리보다 낮은 격자 자리가 없다');
  const samples: Spot[] = grid.slice(first, last + 1).map((w) => ({ w, l: lossAt(c, w) }));
  let lLo = Infinity;
  let lHi = -Infinity;
  for (const s of samples) {
    if (s.l < lLo) lLo = s.l;
    if (s.l > lHi) lHi = s.l;
  }

  const at = (w: number): Point => {
    const l = lossAt(c, w);
    return { w, l, g: slopeAt(c, w), gap: l - floor.l };
  };

  const start = at(d.w0);
  await ctx.emit({
    type: 'init',
    silent: true,
    payload: { samples, lLo, lHi, lowest: floor, start, stopBelow: d.stopBelow },
  });

  let now = start;
  for (let k = 1; ; k += 1) {
    // 걸음 0 은 이미 곡선과 처음 자리가 서 있는 화면이다 — 첫 갱신 앞에도 읽을 틈을 둔다
    if (!(await pause())) return;
    if (k > MAX_UPDATES) throw new Error(`local-minimum: 갱신 ${MAX_UPDATES} 번 안에 |g| 가 문턱 아래로 오지 않았다`);
    const next = at(now.w - d.eta * now.g);
    const stopped = Math.abs(next.g) < d.stopBelow;
    let hill: Spot | null = null;
    if (stopped) {
      const lo = Math.min(floor.w, next.w);
      const hi = Math.max(floor.w, next.w);
      for (const w of grid) {
        if (w <= lo || w >= hi) continue;
        const l = lossAt(c, w);
        if (hill === null || l > hill.l) hill = { w, l };
      }
      if (hill === null) throw new Error('local-minimum: 가장 낮은 곳과 멈춘 자리 사이에 격자 자리가 없다');
    }
    await ctx.emit({
      type: 'update',
      payload: { k, from: now, to: next, moved: Math.abs(next.w - now.w), stopped, hill },
    });
    now = next;
    if (stopped) return;
  }
}
