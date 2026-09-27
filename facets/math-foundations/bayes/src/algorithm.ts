/**
 * bayes — 양성이 연달아 나올 때 "병 : 병 아님" 의 승산이 양성마다 정확히 가능도 비(90 % ÷ 10 % = 9) 배가 되고,
 * 병일 몫이 그만큼 오르는 것을 두 박자(곱해 줄었다가 나눠 다시 1)로 밟는다.
 *
 * 셈의 규약 (IR `ppvPermille` · `firstOverHalf` 와 같은 길)
 *   - 가능도 비 = sensitivityPct // falsePositivePct. 나누어떨어지지 않으면 던진다 (IR 은 −1 표지)
 *   - 승산 num : den — 처음 p : (population − p). 양성 하나마다 num 만 × 가능도 비. 기약하지 않는다
 *   - 병일 몫(‰) = (num × 1000 + total // 2) // total, total = num + den. 실수를 거치지 않는다
 *   - 병 아님의 몫(‰) = 1000 − 병일 몫(‰)
 *   - 절반을 넘는 첫 양성 수 = 0..maxPositives 에서 처음으로 num > den 인 양성 수, 없으면 −1.
 *     **엄격한 비교** — 500 : 500 은 넘지 않은 것으로 센다 (이 데이터에서는 50 % 에서 걸려 답이 1 이 된다)
 *   - 막대 몫(double, 그림용) — 곱하는 박자 = (앞 병 몫 × sens/100, 앞 병 아님 몫 × fpr/100),
 *     나누는 박자 = (num / total, den / total). 글자와 섞지 않는다
 *
 * 이벤트 (payload 스키마 · silent 여부)
 *   init      (silent) 판 머리 — 걸음 0 을 갈아 끼운다
 *             { baseRate, population, sick, healthy, num, den, ppvPermille, healthyPermille,
 *               sickShare, healthyShare, positives, maxPositives, motionMs }
 *   phase     (silent) { phase: 'multiply' | 'normalize' | 'cross' } — 걸음 발신 **앞에**
 *   multiply  양성 i 번째 — 두 조각이 줄어든다
 *             { i, numBefore, num, den, ratio, sensitivityPct, falsePositivePct, sickShare, healthyShare, motionMs }
 *   normalize 합이 1 이 되게 나눈다 — 두 조각이 다시 전체 폭으로
 *             { i, num, den, ppvPermille, healthyPermille, sickShare, healthyShare, motionMs }
 *   cross     끝 — 이 판의 자취와 절반을 넘는 첫 양성 수 { trail: number[] (‰, 양성 0..k), firstOver, maxPositives }
 *
 * phase 어휘: multiply · normalize · cross (irs.ts 와 정확히 같다)
 *
 * 계기 (지금 값을 들고 차이만 보낸다)
 *   odds-factor   판 머리 1 → 곱 걸음마다 × 가능도 비 (1 · 9 · 81 · 729)
 *   ppv-permille  판 머리 병일 몫(‰) → 나눔 걸음마다
 *
 * 손잡이: baseRate (‰ — 1000 명 중 병인 사람 수) · positives (연달아 양성 수).
 * 한 판을 끝까지 재생 → waitForInput → 받은 값으로 다시 재생.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BayesData = {
  type: 'bayes';
  stepMs: number;
  population: number;
  sensitivityPct: number;
  falsePositivePct: number;
  baseRateLadder: number[];
  positivesLadder: number[];
  baseRate: number;
  positives: number;
};

/** 걸음마다 무대가 도는 운동의 길이 (ms, 속도 1 기준). */
export const MOTION_MS = 500;

function isIntList(v: unknown): v is number[] {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number' && Number.isInteger(x));
}

function isPositiveInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

/** ctx.data 를 좁힌다 — 모양이 어긋나면 던진다. */
export function narrowBayesData(raw: unknown): BayesData {
  if (typeof raw !== 'object' || raw === null) throw new Error('bayes: data 가 객체가 아니다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'bayes') throw new Error('bayes: data.type 이 bayes 가 아니다');
  const { stepMs, population, sensitivityPct, falsePositivePct, baseRateLadder, positivesLadder, baseRate, positives } = d;
  if (!isPositiveInt(stepMs)) throw new Error('bayes: stepMs 가 양의 정수가 아니다');
  if (population !== 1000) throw new Error('bayes: population 은 1000 이어야 한다 (기저율이 퍼밀)');
  if (!isPositiveInt(sensitivityPct) || sensitivityPct > 100) throw new Error('bayes: sensitivityPct 가 1..100 이 아니다');
  if (!isPositiveInt(falsePositivePct) || falsePositivePct > 100) throw new Error('bayes: falsePositivePct 가 1..100 이 아니다');
  if (!isIntList(baseRateLadder)) throw new Error('bayes: baseRateLadder 가 정수 목록이 아니다');
  if (!isIntList(positivesLadder)) throw new Error('bayes: positivesLadder 가 정수 목록이 아니다');
  if (typeof baseRate !== 'number' || !baseRateLadder.includes(baseRate)) throw new Error('bayes: baseRate 가 사다리에 없다');
  if (typeof positives !== 'number' || !positivesLadder.includes(positives)) throw new Error('bayes: positives 가 사다리에 없다');
  for (const p of baseRateLadder) {
    if (p <= 0 || p >= population) throw new Error(`bayes: 기저율 ${p}‰ 가 0 과 1000 사이가 아니다`);
  }
  for (const k of positivesLadder) {
    if (k < 0) throw new Error(`bayes: 양성 수 ${k} 가 음수다`);
  }
  return {
    type: 'bayes',
    stepMs,
    population,
    sensitivityPct,
    falsePositivePct,
    baseRateLadder: [...baseRateLadder],
    positivesLadder: [...positivesLadder],
    baseRate,
    positives,
  };
}

/** 가능도 비 — 나누어떨어지지 않으면 던진다 (IR 은 −1 표지). */
export function likelihoodRatio(sens: number, fpr: number): number {
  if (!isPositiveInt(sens) || !isPositiveInt(fpr)) throw new Error('bayes: 검사 백분율이 양의 정수가 아니다');
  if (sens % fpr !== 0) throw new Error(`bayes: ${sens} ÷ ${fpr} 가 나누어떨어지지 않는다`);
  return Math.floor(sens / fpr);
}

function checkBaseRate(p: number): void {
  if (!Number.isInteger(p) || p <= 0 || p >= 1000) throw new Error(`bayes: 기저율 ${p}‰ 가 1..999 가 아니다`);
}

/** 병일 몫(‰) — 반올림 정수 식. IR `ppvPermille` 과 같은 길. */
export function permilleOf(num: number, den: number): number {
  const total = num + den;
  if (!Number.isInteger(num) || !Number.isInteger(den) || num < 0 || den < 0 || total <= 0) {
    throw new Error('bayes: 승산이 음이 아닌 정수 쌍이 아니다');
  }
  return Math.floor((num * 1000 + Math.floor(total / 2)) / total);
}

/** 양성 k 번 뒤의 병일 몫(‰). IR 진입 함수 `ppvPermille` 과 같은 답. */
export function ppvPermille(p: number, k: number, sens: number, fpr: number): number {
  checkBaseRate(p);
  const ratio = likelihoodRatio(sens, fpr);
  let num = p;
  const den = 1000 - p;
  for (let i = 0; i < k; i += 1) num *= ratio;
  return permilleOf(num, den);
}

/** 0..maxK 에서 처음 num > den 인 양성 수, 없으면 −1. IR `firstOverHalf` 와 같은 답. */
export function firstOverHalf(p: number, sens: number, fpr: number, maxK: number): number {
  checkBaseRate(p);
  const ratio = likelihoodRatio(sens, fpr);
  let num = p;
  const den = 1000 - p;
  for (let k = 0; k <= maxK; k += 1) {
    if (num > den) return k;
    num *= ratio;
  }
  return -1;
}

type BayesInput = { type: string; payload?: unknown };

export async function bayesAlgorithm(rawCtx: FacetContext<BayesData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<BayesData>;
  const data = narrowBayesData(ctx.data);
  const { stepMs, population, sensitivityPct, falsePositivePct, baseRateLadder, positivesLadder } = data;
  const ratio = likelihoodRatio(sensitivityPct, falsePositivePct);
  const maxPositives = Math.max(...positivesLadder);

  // 계기는 누적 채널 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 차이 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const before = shown.get(name);
    ctx.metric(name, before === undefined ? value : value - before);
    shown.set(name, value);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  let p = data.baseRate;
  let k = data.positives;

  try {
    for (;;) {
      if (ctx.cancelled) return;

      // ── 걸음 0 (silent init) — 판 머리
      let num = p;
      const den = population - p;
      let ppv = permilleOf(num, den);
      let sickShare = num / (num + den);
      let healthyShare = den / (num + den);
      let factor = 1;
      const trail: number[] = [ppv];
      setMetric('odds-factor', factor);
      setMetric('ppv-permille', ppv);
      await ctx.emit({
        type: 'init',
        payload: {
          baseRate: p,
          population,
          sick: p,
          healthy: den,
          num,
          den,
          ppvPermille: ppv,
          healthyPermille: 1000 - ppv,
          sickShare,
          healthyShare,
          positives: k,
          maxPositives,
          motionMs: MOTION_MS,
        },
        silent: true,
      });
      if (!(await ctx.sleep(stepMs + MOTION_MS))) return;

      // ── 양성 i 번째 — 곱하는 박자 · 나누는 박자
      for (let i = 1; i <= k; i += 1) {
        if (ctx.cancelled) return;
        const numBefore = num;
        num *= ratio;
        factor *= ratio;
        sickShare = (sickShare * sensitivityPct) / 100;
        healthyShare = (healthyShare * falsePositivePct) / 100;
        await phase('multiply');
        await ctx.emit({
          type: 'multiply',
          payload: {
            i,
            numBefore,
            num,
            den,
            ratio,
            sensitivityPct,
            falsePositivePct,
            sickShare,
            healthyShare,
            motionMs: MOTION_MS,
          },
        });
        setMetric('odds-factor', factor);
        if (!(await ctx.sleep(stepMs + MOTION_MS))) return;

        if (ctx.cancelled) return;
        ppv = permilleOf(num, den);
        sickShare = num / (num + den);
        healthyShare = den / (num + den);
        trail.push(ppv);
        await phase('normalize');
        await ctx.emit({
          type: 'normalize',
          payload: {
            i,
            num,
            den,
            ppvPermille: ppv,
            healthyPermille: 1000 - ppv,
            sickShare,
            healthyShare,
            motionMs: MOTION_MS,
          },
        });
        setMetric('ppv-permille', ppv);
        if (!(await ctx.sleep(stepMs + MOTION_MS))) return;
      }

      // ── 끝 — 자취와 절반을 넘는 첫 양성 수 (손잡이 k 와 무관하게 0..maxPositives 를 본다)
      if (ctx.cancelled) return;
      const firstOver = firstOverHalf(p, sensitivityPct, falsePositivePct, maxPositives);
      await phase('cross');
      await ctx.emit({ type: 'cross', payload: { trail: [...trail], firstOver, maxPositives } });

      // ── 손잡이 대기 — 우리 것이 아닌 입력만 흘리고, 제 type 인데 값이 어긋나면 던진다
      for (;;) {
        if (ctx.cancelled) return;
        const input: BayesInput = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'baseRate' && input.type !== 'positives') continue;
        const payload = input.payload;
        const value =
          typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).value : undefined;
        if (typeof value !== 'number') throw new Error(`bayes: ${input.type} 입력에 수 value 가 없다`);
        if (input.type === 'baseRate') {
          if (!baseRateLadder.includes(value)) throw new Error(`bayes: 기저율 ${value} 가 사다리에 없다`);
          p = value;
        } else {
          if (!positivesLadder.includes(value)) throw new Error(`bayes: 양성 수 ${value} 가 사다리에 없다`);
          k = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
