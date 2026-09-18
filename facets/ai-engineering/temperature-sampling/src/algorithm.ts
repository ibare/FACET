/**
 * 온도와 표본 추출 — 온도와 되풀이 벌점이 다음 낱말의 몫을 어떻게 바꾸고,
 * 같은 난수 서른 개로 뽑으면 무엇이 달라지는가.
 *
 * ── 예로 정한 값
 *
 * 후보 일곱의 로짓(cats 3.0 · dogs 2.8 · birds 2.2 · horses 1.9 · fish 1.6 ·
 * pizza 1.0 · rain 0.2)은 **예로 정한 값**이다. 실제 모형이 낸 것이 아니다.
 * 프롬프트 `I like cats. I like dogs. I like` 는 자료이고, 이미 쓴 말(cats · dogs)은
 * 프롬프트를 공백으로 가르고 끝 마침표를 뗀 낱말 가운데 후보와 같은 것으로 셈한다.
 *
 * ── 셈의 규약 (irs.ts 와 같은 차례 · 같은 식)
 *
 * 1. 벌점 먼저 — 이미 쓴 말의 로짓 z 가 0 보다 크면 z ÷ θ, 아니면 z × θ. 나온 횟수와
 *    무관하게 한 번.
 * 2. 온도 나중 — 모든 값을 T 로 나눈다.
 * 3. 소프트맥스 — 가장 큰 값을 빼고 exp, 후보 차례대로 합을 쌓고, 합으로 나눈다.
 * 4. 난수 — 선형 합동 생성기 `s₀ = seed`, `s_{n+1} = (75 · s_n + 74) mod 65537`,
 *    뽑기 n 의 값 `u = s_n / 65537` (n = 1..draws). `Math.random` 은 쓰지 않는다.
 *    씨앗은 하나로 고정한다 — 판마다 **같은 난수 서른 개**다.
 * 5. 뽑기 — 후보 차례대로 누적을 더해 가며 처음으로 `u < 누적` 인 후보. 끝까지 없으면
 *    마지막 후보 (실수 끝자리 대비. 이 데이터에서는 걸리지 않는다).
 *
 * ── 동률 규칙
 *
 * - 1 등은 확률이 가장 큰 후보, 같으면 앞 차례. 이 데이터의 열두 칸에서 동률은 없다.
 * - 뽑기의 경계는 `u < 누적` (같으면 다음 후보). 열두 칸 · 서른 뽑기에서 u 와 누적
 *   경계가 같은 일은 없다 — 가장 가까운 거리가 6.75 × 10⁻⁵ 이다.
 *
 * ── 이벤트 (전부 await, phase 만 silent)
 *
 *   setup     { words: string[]; logits: number[]; used: number[]; draws: number;
 *               seed: number; us: number[] }                         silent 아님
 *             판을 시작하기 전에 한 번. `us` 는 서른 난수 u (뽑기 1..draws 차례).
 *   penalize  { penalty: number; penalized: number[]; ms: number }   silent 아님
 *             벌점을 먹인 로짓. 이미 쓴 말만 값이 바뀐다.
 *   scale     { temperature: number; scaled: number[]; ms: number } silent 아님
 *             벌점 뒤 로짓 ÷ T.
 *   share     { probs: number[]; top: number; topPercent: number; ms: number }
 *                                                                   silent 아님
 *             소프트맥스 몫. `top` 은 1 등 후보 번호(0 부터), `topPercent` 는 반올림한 %.
 *   draw      { n: number; u: number; pick: number; repeat: boolean;
 *               count: number; distinct: number; repeats: number; ms: number }
 *                                                                   silent 아님
 *             뽑기 하나. `n` 은 0 부터(화면은 1 을 더해 읽는다), `pick` 은 뽑힌 후보 번호,
 *             `count` 는 그 후보가 이번 판에서 뽑힌 수(이번 것 포함), `distinct` ·
 *             `repeats` 는 지금까지의 가짓수 · 되풀이.
 *   tally     { counts: number[]; distinct: number; repeats: number; draws: number }
 *                                                                   silent 아님
 *   phase     { phase: 'penalize' | 'scale' | 'softmax' | 'draw' | 'tally' }  silent
 *
 * ── phase 어휘 (irs.ts 와 같은 집합)
 *
 *   penalize · scale · softmax · draw · tally
 *
 * 걸음 경계는 `sleep` 과 `waitForInput` 뿐이다. phase 는 걸음마다 하나만 보내고 그 뒤에
 * 경계를 둔다 — 덮여서 한 번도 켜지지 않는 phase 가 없게.
 *
 * ── 메트릭 (판마다 그 판의 값으로 맞춘다 — 계기는 더하기만 하므로 차이만 보낸다)
 *
 *   top-percent     1 등 확률 × 100 을 반올림
 *   distinct-count  한 번이라도 뽑힌 후보 수
 *   repeat-count    이미 쓴 말이 뽑힌 수
 *
 * ── 손잡이 (reactive)
 *
 *   temperature  값 ∈ temperatures (0.25 · 0.5 · 1 · 2)
 *   penalty      값 ∈ penalties (1 · 1.5 · 2.5)
 *
 * 한 판(벌점 → 온도 → 몫 → 뽑기 서른 → 셈)을 끝까지 재생하고 입력을 기다린다.
 * 받은 값으로 같은 난수 서른 개를 다시 뽑는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type TemperatureSamplingData = {
  type: 'temperature-sampling';
  /** 프롬프트 (자료 — 번역하지 않는다). */
  prompt: string;
  /** 후보 낱말 (자료). */
  words: string[];
  /** 후보의 로짓 — 예로 정한 값. */
  logits: number[];
  /** 선형 합동 생성기의 씨앗. */
  seed: number;
  /** 뽑기 수. */
  draws: number;
  /** 온도 손잡이 사다리. */
  temperatures: number[];
  /** 벌점 손잡이 사다리. */
  penalties: number[];
  /** 처음 온도 (사다리의 기본값). */
  temperature: number;
  /** 처음 벌점 (사다리의 기본값). */
  penalty: number;
  /** 뽑기 한 걸음 뒤 머무는 ms. */
  stepMs: number;
  /** 몫이 옮겨 가는 걸음(벌점 · 온도 · 몫) 뒤 머무는 ms. */
  shiftMs: number;
};

/** 선형 합동 생성기의 상수 — irs.ts 의 `nextState` 와 같다. */
export const LCG_MUL = 75;
export const LCG_ADD = 74;
export const LCG_MOD = 65537;

/** 다음 상태. 곱의 최대는 75 × 65536 + 74 = 4,915,274 — int32 안. */
export function nextState(state: number): number {
  const grown = state * LCG_MUL;
  return (grown + LCG_ADD) % LCG_MOD;
}

/** 프롬프트를 공백으로 가르고 끝 마침표를 뗀 낱말 가운데 후보와 같은 것을 1 로. */
export function usedFlags(prompt: string, words: readonly string[]): number[] {
  const said = new Set(
    prompt
      .split(' ')
      .filter((w) => w.length > 0)
      .map((w) => (w.endsWith('.') ? w.slice(0, -1) : w)),
  );
  return words.map((w) => (said.has(w) ? 1 : 0));
}

/** 서른 난수의 상태 s₁..s_draws. */
export function lcgStates(seed: number, draws: number): number[] {
  const out: number[] = [];
  let state = seed;
  for (let n = 0; n < draws; n += 1) {
    state = nextState(state);
    out.push(state);
  }
  return out;
}

/** 벌점 — 이미 쓴 말의 z 가 0 보다 크면 z ÷ θ, 아니면 z × θ. */
export function penalize(logits: readonly number[], used: readonly number[], penalty: number): number[] {
  return logits.map((z, i) => {
    if (used[i] !== 1) return z;
    return z > 0 ? z / penalty : z * penalty;
  });
}

/** 온도 — 모두 T 로 나눈다. */
export function scale(values: readonly number[], temperature: number): number[] {
  return values.map((z) => z / temperature);
}

/** 소프트맥스 — 가장 큰 값을 빼고 exp, 차례대로 합, 합으로 나눈다. */
export function softmax(values: readonly number[]): number[] {
  let top = values[0] ?? 0;
  for (let i = 1; i < values.length; i += 1) top = Math.max(top, values[i]!);
  const e = values.map((v) => Math.exp(v - top));
  let total = 0;
  for (const v of e) total = total + v;
  return e.map((v) => v / total);
}

/** 누적이 처음으로 u 보다 큰 후보. 없으면 마지막 후보. */
export function pickIndex(probs: readonly number[], u: number): number {
  let acc = 0;
  for (let i = 0; i < probs.length; i += 1) {
    acc = acc + probs[i]!;
    if (u < acc) return i;
  }
  return probs.length - 1;
}

/** 1 등 후보 번호 — 같으면 앞 차례. */
export function topIndex(probs: readonly number[]): number {
  let best = 0;
  for (let i = 1; i < probs.length; i += 1) if (probs[i]! > probs[best]!) best = i;
  return best;
}

/** 한 판의 결과 — 검사와 설명 글의 대조용. 알고리즘도 같은 함수를 쓴다. */
export type RoundResult = {
  penalized: number[];
  scaled: number[];
  probs: number[];
  top: number;
  topPercent: number;
  picks: number[];
  counts: number[];
  distinct: number;
  repeats: number;
};

export function computeRound(
  data: Pick<TemperatureSamplingData, 'prompt' | 'words' | 'logits' | 'seed' | 'draws'>,
  temperature: number,
  penalty: number,
): RoundResult {
  const used = usedFlags(data.prompt, data.words);
  const penalized = penalize(data.logits, used, penalty);
  const scaled = scale(penalized, temperature);
  const probs = softmax(scaled);
  const top = topIndex(probs);
  const topPercent = Math.floor(probs[top]! * 100 + 0.5);
  const counts = data.words.map(() => 0);
  const picks: number[] = [];
  for (const s of lcgStates(data.seed, data.draws)) {
    const k = pickIndex(probs, s / LCG_MOD);
    picks.push(k);
    counts[k] = counts[k]! + 1;
  }
  let distinct = 0;
  let repeats = 0;
  counts.forEach((c, i) => {
    if (c > 0) distinct += 1;
    if (used[i] === 1) repeats += c;
  });
  return { penalized, scaled, probs, top, topPercent, picks, counts, distinct, repeats };
}

const isNums = (x: unknown): x is number[] =>
  Array.isArray(x) && x.every((v) => typeof v === 'number' && Number.isFinite(v));

/** `ctx.data` 를 typeof 로 좁힌다 (C9). 모자라면 null. */
function readData(raw: unknown): TemperatureSamplingData | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const { prompt, words, logits, seed, draws, temperatures, penalties, temperature, penalty, stepMs, shiftMs } = r;
  if (typeof prompt !== 'string') return null;
  if (!Array.isArray(words) || !words.every((w) => typeof w === 'string')) return null;
  if (!isNums(logits) || logits.length !== words.length || words.length === 0) return null;
  if (!isNums(temperatures) || !isNums(penalties)) return null;
  for (const v of [seed, draws, temperature, penalty, stepMs, shiftMs]) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  }
  return {
    type: 'temperature-sampling',
    prompt,
    words: words as string[],
    logits,
    seed: seed as number,
    draws: draws as number,
    temperatures,
    penalties,
    temperature: temperature as number,
    penalty: penalty as number,
    stepMs: stepMs as number,
    shiftMs: shiftMs as number,
  };
}

function isRung(ladder: readonly number[], v: unknown): v is number {
  return typeof v === 'number' && ladder.includes(v);
}

export async function temperatureSamplingAlgorithm(
  base: FacetContext<TemperatureSamplingData>,
): Promise<void> {
  const ctx = base as ReactiveContext<TemperatureSamplingData>;
  const narrowed = readData(ctx.data);
  // 자료가 모자라면 그릴 것이 없다 — 던지지 않고 물러난다.
  if (!narrowed) return;
  const data: TemperatureSamplingData = narrowed;
  const words = data.words;
  const used = usedFlags(data.prompt, words);
  const states = lcgStates(data.seed, data.draws);
  const us = states.map((s) => s / LCG_MOD);

  /** 지금 계기에 떠 있는 값. 계기는 더하기만 하므로 차이만 보낸다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const was = shown.get(name);
    // 처음 한 번은 차이가 0 이어도 보낸다 — 그래야 계기 이름이 실린다.
    if (was !== undefined && was === value) return;
    ctx.metric(name, value - (was ?? 0));
    shown.set(name, value);
  };
  const phase = (name: string): Promise<void> =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });
  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false. */
  const pause = async (ms: number): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(ms)) && !ctx.cancelled;
  };

  /** 한 판을 끝까지 재생한다. 끝까지 갔으면 true, 취소됐으면 false. */
  async function playRound(temperature: number, penalty: number): Promise<boolean> {
    const penalized = penalize(data.logits, used, penalty);
    const scaled = scale(penalized, temperature);
    const probs = softmax(scaled);
    const top = topIndex(probs);
    const topPercent = Math.floor(probs[top]! * 100 + 0.5);

    // 판이 바뀌는 자리 — 가짓수 · 되풀이는 0 에서 다시 센다.
    gauge('distinct-count', 0);
    gauge('repeat-count', 0);

    await phase('penalize');
    await ctx.emit({ type: 'penalize', payload: { penalty, penalized, ms: data.shiftMs } });
    if (!(await pause(data.shiftMs))) return false;

    await phase('scale');
    await ctx.emit({ type: 'scale', payload: { temperature, scaled, ms: data.shiftMs } });
    if (!(await pause(data.shiftMs))) return false;

    await phase('softmax');
    await ctx.emit({ type: 'share', payload: { probs, top, topPercent, ms: data.shiftMs } });
    gauge('top-percent', topPercent);
    if (!(await pause(data.shiftMs))) return false;

    const counts = words.map(() => 0);
    let distinct = 0;
    let repeats = 0;
    for (let n = 0; n < us.length; n += 1) {
      if (ctx.cancelled) return false;
      const u = us[n]!;
      const pick = pickIndex(probs, u);
      if (counts[pick] === 0) distinct += 1;
      counts[pick] = counts[pick]! + 1;
      const repeat = used[pick] === 1;
      if (repeat) repeats += 1;
      await phase('draw');
      await ctx.emit({
        type: 'draw',
        payload: { n, u, pick, repeat, count: counts[pick], distinct, repeats, ms: data.stepMs },
      });
      gauge('distinct-count', distinct);
      gauge('repeat-count', repeats);
      if (!(await pause(data.stepMs))) return false;
    }

    await phase('tally');
    await ctx.emit({ type: 'tally', payload: { counts, distinct, repeats, draws: us.length } });
    return !ctx.cancelled;
  }

  let temperature = data.temperature;
  let penalty = data.penalty;

  try {
    await ctx.emit({
      type: 'setup',
      payload: { words, logits: data.logits, used, draws: data.draws, seed: data.seed, us },
    });
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(temperature, penalty))) return;
      // 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        const payload = input.payload;
        const value =
          typeof payload === 'object' && payload !== null
            ? (payload as Record<string, unknown>)['value']
            : undefined;
        if (input.type === 'temperature' && isRung(data.temperatures, value)) {
          temperature = value;
          break;
        }
        if (input.type === 'penalty' && isRung(data.penalties, value)) {
          penalty = value;
          break;
        }
        continue;
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다.
    if (!ctx.cancelled) throw err;
  }
}
