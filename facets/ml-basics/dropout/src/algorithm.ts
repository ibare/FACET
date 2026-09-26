/**
 * dropout — 뒤집은 드롭아웃. 쉬게 하고 ÷(1 − p) 로 메우면 출력의 기댓값은 모두 켠 값에 머물고
 * 흩어짐만 커진다. 메우지 않으면(되살림 끔) 무리가 통째로 (1 − p) 배 자리로 내려간다.
 *
 * 1차 데이터: 칸 여섯의 h · v, 뽑힌 수 u 마흔 벌 × 여섯(한 번 뽑아 고정 — 모든 p 에 같은 u),
 * 손잡이 사다리 둘. 마스크 k 의 칸 i 는 u[k][i] ≥ p 면 켜진다. 기댓값 · y · 표본 평균 · 흩어짐 ·
 * 쉰 칸 · 쉰 몫 · y 범위 · 눈금은 모두 여기서 셈한다.
 *
 * 셈은 IR(`irs.ts`) 의 세 함수 `dropoutRun` · `maskedOutput` · `expectedOutput` 를 TS 로 한 줄씩 옮긴
 * 것이다. 판 머리에서 `dropoutRun` 을 한 번 돌리며 갈고리로 마스크마다의 켜짐 · y 를 모으고, 그 기록을
 * 걸음으로 나눠 재생한다 (같은 셈을 두 번 짜지 않는다).
 *
 * 동률 규칙: 켜짐은 `u ≥ p` (같으면 켜짐). 이 데이터의 u 는 둘째 자리이고 사다리의 p(0 · 0.1 · 0.4 · 0.7)와
 * 같은 값은 0 을 뺀 셋에서 하나도 없다 — p 0 에서는 모든 u 가 p 보다 커서 역시 동률이 걸리지 않는다.
 *
 * 이벤트 (payload 스키마 · silent 여부):
 *   init      silent — 무대의 뼈대. { cells: number, shares: number[] (hᵢ·vᵢ), shareMax: number
 *                      (사다리 전체에서 가장 큰 |몫|), yLo: number, yHi: number (사다리 전체의 y 범위),
 *                      ticks: number[], maskCount: number }
 *   all-on    걸음 0 — 모두 켠 앞먹임. { p, rescale, allOn: number (Σ hᵢ·vᵢ), expected: number,
 *                      shares: number[] (나누기 없는 hᵢ·vᵢ) }
 *   masks     걸음 1…8 — 마스크 다섯 벌. { p, rescale, from: number, to: number (1 부터),
 *                      masks: { k: number (1 부터), y, binY, slot, on: boolean[], shares: number[] }[],
 *                      off: number (지금까지 쉰 칸), seen: number (지금까지 지나간 마스크) }
 *   summary   걸음 9 — 모음. { mean, sd, expected, allOn, off, total (칸 × 마스크), pct (쉰 몫 %) }
 *   phase     silent — { phase: 'expect' | 'drop' | 'spread' }. 걸음 발신 바로 앞에 보낸다
 *
 * phase 어휘 (irs.ts 와 같다): expect · drop · spread
 *   #0 expect · #1 … #8 drop · #9 spread
 *
 * 계기 (누적 채널 — 지금 값을 쥐고 차이만 보낸다. 판 머리에서 0 으로):
 *   masks      지금까지 지나간 마스크 (0 … 40)
 *   units-off  지금까지 쉰 칸 수 (판 끝 0 · 21 · 90 · 165)
 *
 * 입력: `dropRate` (value = p 그대로, 사다리 0 · 0.1 · 0.4 · 0.7) · `rescale` (value 1 켬 · 0 끔).
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type DropoutData = {
  type: 'dropout';
  stepMs: number;
  /** 칸마다 은닉 출력 hᵢ */
  h: number[];
  /** 칸마다 출력 무게 vᵢ */
  v: number[];
  /** 뽑힌 수 — 마스크 마흔 벌 × 칸 여섯 */
  us: number[][];
  /** 한 걸음에 지나가는 마스크 수 */
  batch: number;
  /** 쉴 확률 p 사다리 (손잡이 value 와 같다) */
  dropRates: number[];
  /** 되살림 사다리 — 1 켬 · 0 끔 (손잡이 value 와 같다) */
  rescales: number[];
  defaultDropRate: number;
  defaultRescale: number;
};

/** 모르는 되살림 종류에 IR 이 돌려주는 표지. 정상 y 는 −0.80 … 2.97 이라 겹치지 않는다. */
export const DROPOUT_MARK = -999.0;

/** 무리 그림의 한 칸 높이 (y 값 단위). 같은 칸에 든 점은 옆으로 쌓인다 — 그리기 격자일 뿐 셈에는 쓰지 않는다. */
export const DOT_BIN = 0.1;

/** 눈금 간격 (y 값 단위). */
const TICK_STEP = 0.5;

function checkRescale(rescale: number): void {
  if (rescale !== 0 && rescale !== 1) throw new Error(`dropout: 모르는 되살림 종류 ${rescale}`);
}

/** IR `expectedOutput` — 기댓값 Σ (1 − p)·hᵢ·vᵢ, 되살림이면 ÷ (1 − p). 표본에서 얻지 않고 셈으로 얻는다. */
export function expectedOutput(h: number[], v: number[], p: number, rescale: number): number {
  checkRescale(rescale);
  let e = 0.0;
  for (let i = 0; i < h.length; i++) {
    e += (1.0 - p) * h[i]! * v[i]!;
  }
  if (rescale === 1) return e / (1.0 - p);
  return e;
}

/**
 * IR `maskedOutput` — 마스크 k 하나로 앞먹임 한 번. 칸 i 는 us[len(h)·k + i] ≥ p 면 켜짐.
 * 쉬는 칸 수를 offs[0] 에 더한다. `onUnit` 은 그림을 위한 갈고리(IR 에는 없다).
 */
export function maskedOutput(
  h: number[],
  v: number[],
  us: number[],
  k: number,
  p: number,
  rescale: number,
  offs: number[],
  onUnit?: (i: number, on: boolean) => void,
): number {
  checkRescale(rescale);
  let s = 0.0;
  for (let i = 0; i < h.length; i++) {
    const on = us[h.length * k + i]! >= p;
    if (on) s += h[i]! * v[i]!;
    else offs[0] = offs[0]! + 1;
    onUnit?.(i, on);
  }
  if (rescale === 1) return s / (1.0 - p);
  return s;
}

/**
 * IR 진입 `dropoutRun` — 마스크 K 벌의 y 를 ys 에, stats = [기댓값, 표본 평균, 흩어짐(모집단 sd)],
 * offs = [쉰 칸, 쉰 몫 %]. 표본 평균을 돌려준다. `onMask` 는 그림을 위한 갈고리(IR 에는 없다).
 */
export function dropoutRun(
  h: number[],
  v: number[],
  us: number[],
  p: number,
  rescale: number,
  ys: number[],
  stats: number[],
  offs: number[],
  onMask?: (k: number, y: number, on: boolean[]) => void,
): number {
  stats[0] = expectedOutput(h, v, p, rescale);
  offs[0] = 0;
  for (let k = 0; k < ys.length; k++) {
    const on: boolean[] = [];
    ys[k] = maskedOutput(h, v, us, k, p, rescale, offs, (_i, isOn) => on.push(isOn));
    onMask?.(k, ys[k]!, on);
  }
  let total = 0.0;
  for (let k = 0; k < ys.length; k++) total += ys[k]!;
  const count = ys.length;
  const mean = total / count;
  let q = 0.0;
  for (let k = 0; k < ys.length; k++) q += (ys[k]! - mean) * (ys[k]! - mean);
  stats[1] = mean;
  stats[2] = Math.sqrt(q / count);
  const n = h.length * ys.length;
  offs[1] = Math.floor((offs[0]! * 100 + Math.floor(n / 2)) / n);
  return mean;
}

/** 뽑힌 수를 IR 이 받는 평평한 꼴(us[6k + i])로 편다. */
export function flattenDraws(us: number[][]): number[] {
  return us.flat();
}

export type DropoutRecord = {
  p: number;
  rescale: number;
  ys: number[];
  on: boolean[][];
  /** 마스크마다 쉰 칸 수 */
  offEach: number[];
  expected: number;
  mean: number;
  sd: number;
  off: number;
  pct: number;
};

/** 한 판의 셈 — `dropoutRun` 을 한 번 돌리며 마스크마다의 켜짐과 쉰 칸을 모은다. */
export function computeRun(d: DropoutData, p: number, rescale: number): DropoutRecord {
  const us = flattenDraws(d.us);
  const ys = new Array<number>(d.us.length).fill(0);
  const stats = [0, 0, 0];
  const offs = [0, 0];
  const on: boolean[][] = [];
  const offEach: number[] = [];
  let before = 0;
  dropoutRun(d.h, d.v, us, p, rescale, ys, stats, offs, (_k, _y, flags) => {
    on.push(flags);
    offEach.push(offs[0]! - before);
    before = offs[0]!;
  });
  return {
    p,
    rescale,
    ys,
    on,
    offEach,
    expected: stats[0]!,
    mean: stats[1]!,
    sd: stats[2]!,
    off: offs[0]!,
    pct: offs[1]!,
  };
}

/** 모두 켠 출력 Σ hᵢ·vᵢ — 나누기 없음 (p 0 · 되살림 켬의 기댓값과 같은 셈). */
export function allOnOutput(d: DropoutData): number {
  return expectedOutput(d.h, d.v, 0, 1);
}

/** 사다리 전체(모든 p × 되살림)에서 y 의 가장 작은 값 · 가장 큰 값 — 축을 판 사이에 고정한다. */
export function outputRange(d: DropoutData): { lo: number; hi: number } {
  let lo = Infinity;
  let hi = -Infinity;
  for (const p of d.dropRates) {
    for (const r of d.rescales) {
      for (const y of computeRun(d, p, r).ys) {
        if (y < lo) lo = y;
        if (y > hi) hi = y;
      }
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) throw new Error('dropout: y 범위를 셈할 수 없다');
  return { lo, hi };
}

/** 범위 안의 눈금 — TICK_STEP 의 배수. */
export function outputTicks(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let j = Math.ceil(lo / TICK_STEP); j * TICK_STEP <= hi; j++) out.push(j * TICK_STEP);
  return out;
}

/** 칸마다 몫 — 켜졌으면 hᵢ·vᵢ (되살림이면 ÷(1 − p)), 쉬면 0. */
export function unitShares(d: DropoutData, p: number, rescale: number, on: boolean[]): number[] {
  checkRescale(rescale);
  return d.h.map((hi, i) => {
    if (!on[i]) return 0;
    const s = hi * d.v[i]!;
    return rescale === 1 ? s / (1.0 - p) : s;
  });
}

/** 사다리 전체에서 가장 큰 |몫| — 몫 막대의 자를 판 사이에 고정한다. */
export function shareMax(d: DropoutData): number {
  let m = 0;
  const all = d.h.map(() => true);
  for (const p of d.dropRates) {
    for (const r of d.rescales) {
      for (const s of unitShares(d, p, r, all)) m = Math.max(m, Math.abs(s));
    }
  }
  return m;
}

/** 무리 그림의 칸 가운데 값 (y 축 위치). */
export function binCenter(y: number, lo: number): number {
  return lo + (Math.floor((y - lo) / DOT_BIN) + 0.5) * DOT_BIN;
}

function checkData(d: DropoutData): void {
  if (d.h.length === 0 || d.h.length !== d.v.length) throw new Error('dropout: h · v 길이가 맞지 않는다');
  if (d.us.length === 0) throw new Error('dropout: 뽑힌 수가 없다');
  for (const row of d.us) {
    if (row.length !== d.h.length) throw new Error('dropout: 뽑힌 수 한 벌의 길이가 칸 수와 다르다');
  }
  if (!(d.batch > 0) || d.us.length % d.batch !== 0) throw new Error('dropout: 마스크 수가 걸음 묶음으로 나뉘지 않는다');
  if (!d.dropRates.includes(d.defaultDropRate)) throw new Error('dropout: 기본 p 가 사다리 밖이다');
  if (!d.rescales.includes(d.defaultRescale)) throw new Error('dropout: 기본 되살림이 사다리 밖이다');
  for (const p of d.dropRates) if (!(p >= 0 && p < 1)) throw new Error(`dropout: p ${p} 는 0 이상 1 미만이어야 한다`);
  for (const r of d.rescales) checkRescale(r);
}

function readValue(payload: unknown): number | null {
  if (typeof payload !== 'object' || payload === null || !('value' in payload)) return null;
  const value = (payload as { value: unknown }).value;
  return typeof value === 'number' ? value : null;
}

type MetricName = 'masks' | 'units-off';

export async function dropoutAlgorithm(base: FacetContext<DropoutData>): Promise<void> {
  const ctx = base as ReactiveContext<DropoutData>;
  const d = ctx.data;
  checkData(d);

  const shown: Record<MetricName, number> = { masks: 0, 'units-off': 0 };
  const setMetric = (name: MetricName, value: number) => {
    ctx.metric(name, value - shown[name]);
    shown[name] = value;
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const range = outputRange(d);
  const allOn = allOnOutput(d);
  const rawShares = d.h.map((hi, i) => hi * d.v[i]!);

  let p = d.defaultDropRate;
  let rescale = d.defaultRescale;

  try {
    await ctx.emit({
      type: 'init',
      payload: {
        cells: d.h.length,
        shares: rawShares,
        shareMax: shareMax(d),
        yLo: range.lo,
        yHi: range.hi,
        ticks: outputTicks(range.lo, range.hi),
        maskCount: d.us.length,
      },
      silent: true,
    });

    for (;;) {
      if (ctx.cancelled) return;
      const run = computeRun(d, p, rescale);

      // 걸음 0 — 모두 켬 · 기댓값
      setMetric('masks', 0);
      setMetric('units-off', 0);
      await phase('expect');
      await ctx.emit({
        type: 'all-on',
        payload: { p, rescale, allOn, expected: run.expected, shares: rawShares },
      });
      if (!(await ctx.sleep(d.stepMs))) return;

      // 걸음 1 … — 마스크 다섯 벌씩
      const slots = new Map<number, number>();
      let off = 0;
      for (let from = 0; from < run.ys.length; from += d.batch) {
        if (ctx.cancelled) return;
        const masks = [];
        for (let k = from; k < from + d.batch; k++) {
          const y = run.ys[k]!;
          const bin = Math.floor((y - range.lo) / DOT_BIN);
          // 같은 칸에 먼저 든 점의 수 = 이 점이 옆으로 놓일 자리
          const slot = slots.has(bin) ? slots.get(bin)! : 0;
          slots.set(bin, slot + 1);
          off += run.offEach[k]!;
          masks.push({
            k: k + 1,
            y,
            binY: binCenter(y, range.lo),
            slot,
            on: run.on[k]!,
            shares: unitShares(d, p, rescale, run.on[k]!),
          });
        }
        const seen = from + d.batch;
        setMetric('masks', seen);
        setMetric('units-off', off);
        await phase('drop');
        await ctx.emit({
          type: 'masks',
          payload: { p, rescale, from: from + 1, to: seen, masks, off, seen },
        });
        if (!(await ctx.sleep(d.stepMs))) return;
      }
      if (off !== run.off) throw new Error('dropout: 걸음마다 센 쉰 칸이 판의 셈과 다르다');

      // 마지막 걸음 — 모음
      await phase('spread');
      await ctx.emit({
        type: 'summary',
        payload: {
          mean: run.mean,
          sd: run.sd,
          expected: run.expected,
          allOn,
          off: run.off,
          total: d.h.length * d.us.length,
          pct: run.pct,
        },
      });

      // 손잡이를 기다린다
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const value = readValue(input.payload);
        if (value === null) continue;
        if (input.type === 'dropRate' && d.dropRates.includes(value)) {
          p = value;
          break;
        }
        if (input.type === 'rescale' && d.rescales.includes(value)) {
          rescale = value;
          break;
        }
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
