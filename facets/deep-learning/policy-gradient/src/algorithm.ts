/**
 * policy-gradient — 확률만 가진 행위자 다섯이 받은 상으로 확률을 민다 (REINFORCE · 기준값).
 *
 * 손잡이 둘(`baseline` 없음 · 평균 상, `shift` 상에 더한 값 0 · +3)을 받을 때마다 θ 처음 값 ·
 * 같은 씨앗에서 판 전부를 다시 셈하고, 판 하나를 한 걸음으로 재생한다.
 *
 * 셈의 규약 (IR 과 한 벌 — `softmax` · `sampleAction` · `baselineValue` · `reinforce`):
 *   π = softmax(θ) — 최댓값을 빼고 exp · 합 · 나눔
 *   뽑기 — 누적을 첫 행동부터 마지막 앞까지 쌓아 u < 누적 이 처음 서는 행동, 아니면 마지막 행동
 *   G = rewards[a] + shift
 *   기준값 — baseline 1 이고 앞선 판이 있으면 이 판 전까지 받은 G 의 평균(합 / 판 수), 아니면 0
 *   갱신 — θ_b ← θ_b + α·(G − 기준값)·(1[b = a] − π_b), π 는 갱신 전 확률
 *
 * 난수 — Park–Miller 최소 표준. x ← 48271 · x mod 2147483647, u = x / 2147483647.
 *   행위자마다 제 씨앗(`seeds`)의 생성기 하나, 판마다 u 하나. 곱의 최대 ≈ 1.04e14 < 2⁵³ 이라 정확하다.
 *
 * 동률 규칙 — "가장 큰 π" 는 셈한 값으로 가르고, 가장 큰 값이 둘 이상이면 어느 행동도 앞서지 않는다(-1).
 *   이 데이터에서 동률은 걸음 0 의 π 셋(모두 같은 θ)뿐이다.
 *
 * 이벤트 (모두 silent 아님 — 걸음 경계는 sleep):
 *   pg-start   { actions: string[], gains: number[], rewards: number[], shift: number, baseline: number,
 *                best: number, total: number, pis: number[][] (행위자 × 행동), leaders: number[],
 *                bestLeads: number, otherLeads: number, ms: number }
 *   pg-episode { episode: number, total: number, best: number, pis: number[][], chosen: number[],
 *                gains: number[], baselines: number[], advantages: number[], leaders: number[],
 *                bestLeads: number, otherLeads: number, ms: number }
 *   pg-final   { total: number, best: number, pis: number[][], leaders: number[],
 *                bestLeads: number, otherLeads: number, ms: number }
 *   phase      { phase } — silent: true
 *
 * phase 는 걸음 이벤트 **앞에** 보낸다 — 자취는 silent 아닌 발신에서 걸음을 끊으므로, 뒤에 보내면 다음 걸음에 묶여
 *   되짚기 때 코드 패널이 한 걸음 밀린다.
 * phase 어휘: `policy` (걸음 0 의 처음 π · 끝 걸음의 끝 π) · `update` (판 걸음 — 기준값과 갱신)
 *
 * 계기 (이번 판의 지금 값, 판 머리에서 0):
 *   episode     — 지난 판 수
 *   best-leads  — 지금 π 가 가장 큰 행동이 가장 좋은 행동인 행위자 수
 *   other-leads — 지금 π 가 가장 큰 행동이 다른 행동인 행위자 수 (동률은 어느 쪽도 아님)
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PolicyGradientData = {
  type: 'policy-gradient';
  stepMs: number;
  edgeMs: number;
  actions: string[];
  rewards: number[];
  alpha: number;
  episodes: number;
  thetaStart: number[];
  seeds: number[];
  baselineLadder: number[];
  shiftLadder: number[];
  baselineStart: number;
  shiftStart: number;
};

const LCG_A = 48271;
const LCG_M = 2147483647;
const AGENT_COUNT = 5;

// ── 셈 (IR 과 같은 모양) ───────────────────────────────────────────────────

export function softmaxInto(theta: readonly number[], pi: number[]): void {
  let m = theta[0];
  for (let i = 1; i < theta.length; i++) m = Math.max(m, theta[i]);
  let total = 0;
  for (let i = 0; i < theta.length; i++) {
    pi[i] = Math.exp(theta[i] - m);
    total = total + pi[i];
  }
  for (let i = 0; i < theta.length; i++) pi[i] = pi[i] / total;
}

export function sampleActionOf(pi: readonly number[], u: number): number {
  let acc = 0;
  for (let i = 0; i < pi.length - 1; i++) {
    acc = acc + pi[i];
    if (u < acc) return i;
  }
  return pi.length - 1;
}

export function baselineValueOf(sumReward: number, count: number, useBaseline: number): number {
  if (useBaseline === 1) {
    if (count > 0) return sumReward / count;
  }
  return 0;
}

export function reinforceInto(
  theta: number[],
  pi: readonly number[],
  action: number,
  reward: number,
  baseline: number,
  alpha: number,
): void {
  const adv = reward - baseline;
  for (let i = 0; i < theta.length; i++) {
    let ind = 0;
    if (i === action) ind = 1;
    theta[i] = theta[i] + alpha * adv * (ind - pi[i]);
  }
}

/** 가장 큰 π 의 행동. 가장 큰 값이 둘 이상이면 -1. */
export function leaderOf(pi: readonly number[]): number {
  let m = pi[0];
  for (let i = 1; i < pi.length; i++) m = Math.max(m, pi[i]);
  let found = -1;
  for (let i = 0; i < pi.length; i++) {
    if (pi[i] !== m) continue;
    if (found !== -1) return -1;
    found = i;
  }
  return found;
}

export type EpisodeRecord = {
  episode: number;
  u: number;
  action: number;
  gain: number;
  baseline: number;
  piBefore: number[];
  piAfter: number[];
  thetaAfter: number[];
};

export type AgentRun = { start: number[]; episodes: EpisodeRecord[] };

/** 행위자 하나의 판 전부. 씨앗 하나의 생성기에서 판마다 u 하나. */
export function runAgent(data: PolicyGradientData, baseline: number, shift: number, seed: number): AgentRun {
  let x = seed;
  const theta = data.thetaStart.slice();
  const pi = new Array<number>(theta.length).fill(0);
  softmaxInto(theta, pi);
  const start = pi.slice();
  const episodes: EpisodeRecord[] = [];
  let sumG = 0;
  for (let ep = 1; ep <= data.episodes; ep++) {
    softmaxInto(theta, pi);
    const piBefore = pi.slice();
    x = (LCG_A * x) % LCG_M;
    const u = x / LCG_M;
    const action = sampleActionOf(pi, u);
    const gain = data.rewards[action] + shift;
    const b = baselineValueOf(sumG, ep - 1, baseline);
    reinforceInto(theta, pi, action, gain, b, data.alpha);
    sumG = sumG + gain;
    const piAfter = new Array<number>(theta.length).fill(0);
    softmaxInto(theta, piAfter);
    episodes.push({ episode: ep, u, action, gain, baseline: b, piBefore, piAfter, thetaAfter: theta.slice() });
  }
  return { start, episodes };
}

/** 가장 좋은 행동 — 상이 가장 큰 행동. 둘 이상이면 셈할 수 없다. */
export function bestActionOf(rewards: readonly number[]): number {
  const best = leaderOf(rewards);
  if (best < 0) throw new Error('policy-gradient: 상이 가장 큰 행동이 하나가 아니다');
  return best;
}

export function countLeads(leaders: readonly number[], best: number): { bestLeads: number; otherLeads: number } {
  let bestLeads = 0;
  let otherLeads = 0;
  for (const l of leaders) {
    if (l === best) bestLeads++;
    else if (l >= 0) otherLeads++;
  }
  return { bestLeads, otherLeads };
}

// ── 좁히개 ────────────────────────────────────────────────────────────────

function numberList(v: unknown, name: string): number[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'number' || !Number.isFinite(x))) {
    throw new Error(`policy-gradient: ${name} 는 수의 목록이어야 한다`);
  }
  return v as number[];
}

function num(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`policy-gradient: ${name} 는 수여야 한다`);
  return v;
}

export function narrowPolicyGradientData(raw: unknown): PolicyGradientData {
  if (typeof raw !== 'object' || raw === null) throw new Error('policy-gradient: initialData 가 없다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'policy-gradient') throw new Error(`policy-gradient: initialData.type 이 '${String(d.type)}'`);
  const actions = d.actions;
  if (!Array.isArray(actions) || actions.some((a) => typeof a !== 'string')) {
    throw new Error('policy-gradient: actions 는 문자열 목록이어야 한다');
  }
  const rewards = numberList(d.rewards, 'rewards');
  const thetaStart = numberList(d.thetaStart, 'thetaStart');
  const seeds = numberList(d.seeds, 'seeds');
  const baselineLadder = numberList(d.baselineLadder, 'baselineLadder');
  const shiftLadder = numberList(d.shiftLadder, 'shiftLadder');
  if (actions.length < 2) throw new Error('policy-gradient: 행동이 둘 이상이어야 한다');
  if (rewards.length !== actions.length || thetaStart.length !== actions.length) {
    throw new Error('policy-gradient: actions · rewards · thetaStart 의 길이가 다르다');
  }
  if (seeds.length !== AGENT_COUNT) throw new Error(`policy-gradient: seeds 는 ${AGENT_COUNT} 개여야 한다`);
  for (const s of seeds) {
    if (!Number.isInteger(s) || s < 1 || s >= LCG_M) throw new Error(`policy-gradient: 씨앗 ${s} 가 1 ≤ x < 2³¹ − 1 밖이다`);
  }
  for (const b of baselineLadder) {
    if (b !== 0 && b !== 1) throw new Error('policy-gradient: baselineLadder 는 0 · 1 만 담는다');
  }
  const episodes = num(d.episodes, 'episodes');
  if (!Number.isInteger(episodes) || episodes < 1) throw new Error('policy-gradient: episodes 는 1 이상의 정수');
  const baselineStart = num(d.baselineStart, 'baselineStart');
  const shiftStart = num(d.shiftStart, 'shiftStart');
  if (!baselineLadder.includes(baselineStart)) throw new Error('policy-gradient: baselineStart 가 사다리 밖이다');
  if (!shiftLadder.includes(shiftStart)) throw new Error('policy-gradient: shiftStart 가 사다리 밖이다');
  return {
    type: 'policy-gradient',
    stepMs: num(d.stepMs, 'stepMs'),
    edgeMs: num(d.edgeMs, 'edgeMs'),
    actions: actions as string[],
    rewards,
    alpha: num(d.alpha, 'alpha'),
    episodes,
    thetaStart,
    seeds,
    baselineLadder,
    shiftLadder,
    baselineStart,
    shiftStart,
  };
}

// ── 알고리즘 ──────────────────────────────────────────────────────────────

export async function policyGradientAlgorithm(ctx: FacetContext<PolicyGradientData>): Promise<void> {
  const rctx = ctx as ReactiveContext<PolicyGradientData>;
  const data = narrowPolicyGradientData(ctx.data);
  const best = bestActionOf(data.rewards);

  const shown = new Map<string, number>();
  const setMetric = (name: string, value: number): void => {
    const prev = shown.get(name);
    ctx.metric(name, prev === undefined ? value : value - prev);
    shown.set(name, value);
  };
  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  const playRun = async (baseline: number, shift: number): Promise<boolean> => {
    const runs = data.seeds.map((seed) => runAgent(data, baseline, shift, seed));
    const gains = data.rewards.map((r) => r + shift);

    // 걸음 0 — θ 처음 값 · π 처음 값
    const startPis = runs.map((r) => r.start.slice());
    const startLeaders = startPis.map((p) => leaderOf(p));
    const startLeads = countLeads(startLeaders, best);
    await phase('policy');
    await ctx.emit({
      type: 'pg-start',
      payload: {
        actions: data.actions.slice(),
        rewards: data.rewards.slice(),
        gains,
        shift,
        baseline,
        best,
        total: data.episodes,
        pis: startPis,
        leaders: startLeaders,
        bestLeads: startLeads.bestLeads,
        otherLeads: startLeads.otherLeads,
        ms: data.edgeMs,
      },
    });
    setMetric('episode', 0);
    setMetric('best-leads', startLeads.bestLeads);
    setMetric('other-leads', startLeads.otherLeads);
    if (!(await rctx.sleep(data.edgeMs))) return false;

    // 판 1..N — 판 하나에 한 걸음, 다섯이 함께
    let lastPis = startPis;
    for (let ep = 0; ep < data.episodes; ep++) {
      if (ctx.cancelled) return false;
      const recs = runs.map((r) => r.episodes[ep]);
      const pis = recs.map((r) => r.piAfter.slice());
      const leaders = pis.map((p) => leaderOf(p));
      const leads = countLeads(leaders, best);
      await phase('update');
      await ctx.emit({
        type: 'pg-episode',
        payload: {
          episode: ep + 1,
          total: data.episodes,
          best,
          pis,
          chosen: recs.map((r) => r.action),
          gains: recs.map((r) => r.gain),
          baselines: recs.map((r) => r.baseline),
          advantages: recs.map((r) => r.gain - r.baseline),
          leaders,
          bestLeads: leads.bestLeads,
          otherLeads: leads.otherLeads,
          ms: data.stepMs,
        },
      });
      setMetric('episode', ep + 1);
      setMetric('best-leads', leads.bestLeads);
      setMetric('other-leads', leads.otherLeads);
      lastPis = pis;
      if (!(await rctx.sleep(data.stepMs))) return false;
    }

    // 끝 걸음 — 끝 π 읽기
    const endLeaders = lastPis.map((p) => leaderOf(p));
    const endLeads = countLeads(endLeaders, best);
    await phase('policy');
    await ctx.emit({
      type: 'pg-final',
      payload: {
        total: data.episodes,
        best,
        pis: lastPis,
        leaders: endLeaders,
        bestLeads: endLeads.bestLeads,
        otherLeads: endLeads.otherLeads,
        ms: data.edgeMs,
      },
    });
    return rctx.sleep(data.edgeMs);
  };

  let baseline = data.baselineStart;
  let shift = data.shiftStart;
  try {
    while (!ctx.cancelled) {
      if (!(await playRun(baseline, shift))) return;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await rctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'baseline' && input.type !== 'shift') continue;
        const p = input.payload;
        if (typeof p !== 'object' || p === null) throw new Error('policy-gradient: 손잡이 입력에 payload 가 없다');
        const value = (p as { value?: unknown }).value;
        if (typeof value !== 'number') throw new Error('policy-gradient: 손잡이 값이 수가 아니다');
        if (input.type === 'baseline') {
          if (!data.baselineLadder.includes(value)) throw new Error(`policy-gradient: 기준값 ${value} 가 사다리 밖이다`);
          baseline = value;
        } else {
          if (!data.shiftLadder.includes(value)) throw new Error(`policy-gradient: 더한 값 ${value} 가 사다리 밖이다`);
          shift = value;
        }
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
