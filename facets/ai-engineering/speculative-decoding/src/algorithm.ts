/**
 * 사색적 디코딩 (speculative decoding) — 작은 모형이 γ 낱말을 앞서 찍고 큰 모형이 한 번에 검사한다.
 *
 * 묻는 것: 작은 모형이 몇 낱말을 앞서 찍게 해야 가장 싼가. 길게 찍을수록 큰 모형을 덜 부르지만
 * 초안은 처음 틀린 자리에서 뒤가 다 버려지고, 작은 모형의 셈도 공짜가 아니다.
 *
 * ── 예로 정한 값
 * - 큰 모형이 낼 글과, 작은 모형이 **올바른 앞부분이 주어졌을 때** 각 자리에서 낼 낱말(`guess`)은
 *   예로 정한 자료다. 실제 모형이 낸 것이 아니다. 틀린 자리는 넷(3 · 6 · 10 · 14 번째).
 * - 비용 단위: 작은 모형 한 낱말 1, 큰 모형 검사 한 번 5 (`draftCost` · `checkCost`). 비율 1 : 5 도 예다.
 *
 * ── 규약
 * - 낱말 하나 = 토큰 하나 (공백으로 가른다. 끝 마침표도 하나). 남은 토큰 R = 16 − 지금 자리.
 * - 판마다 초안 길이 k = min(γ, R − 1) — 큰 모형이 늘 마지막 한 낱말은 스스로 낸다.
 * - 탐욕 판정: 초안 i 번째가 큰 모형의 그 자리 낱말과 같으면 받고, 다르면 거절한다. 앞에서부터 보고
 *   처음 거절에서 멈춘다. 받은 수 a. 붙는 것 = 받은 a 낱말 + 큰 모형의 낱말 하나. 자리 += a + 1.
 *   확률 비로 받고 거절하면 다시 뽑는 표본 규칙은 이 화면 밖이다.
 * - 첫 거절 뒤의 초안은 맞았어도 버린다. 버린 초안 = k − a.
 * - 비용 = 찍은 초안 × draftCost + 검사 × checkCost.
 * - 검사 한 번에 붙은 낱말 ×100 = (16 × 100 + 검사 // 2) // 검사 (반올림 정수).
 * - 동률 규칙은 없다 — 견줌은 낱말이 같은가뿐이다.
 *
 * ── 이벤트 (전부 silent 아님, phase 만 silent)
 * - `run-start` { gamma: number, index: number, maxCost: number }
 *                                                             — 손잡이 값 γ 로 한 판을 새로 시작한다.
 *                                                               maxCost 는 사다리 값 전부 가운데 가장 큰 비용
 *                                                               (장부의 세로 눈금)
 * - `draft`     { round: number, from: number, k: number }   — 작은 모형이 from 자리부터 k 낱말을 찍는다
 * - `verify`    { round: number, from: number, k: number, accepted: number }
 *                                                             — 큰 모형이 한 번 훑는다. accepted 낱말을
 *                                                               받고, from + accepted 자리에 제 낱말을 둔다
 * - `run-end`   { gamma: number, index: number, checks: number, drafted: number,
 *                 rejected: number, cost: number, perCheckX100: number }
 * - `phase`     { phase } (silent: true)
 *
 * ── phase 어휘 (irs.ts 와 같다)
 * 'start' | 'draft' | 'verify' | 'cost'
 *
 * ── 메트릭
 * - `check-count`    — 큰 모형 검사(부름) 수
 * - `rejected-count` — 버린 초안 낱말 수
 * - `cost-sum`       — 찍은 초안 × 1 + 검사 × 5
 * 계기는 누적 채널이라 판이 바뀔 때 `gauge` 로 0 부터 다시 맞춘다.
 *
 * ── 입력
 * - `draft` (segmented-slider) payload { value: number, segmentIndex, ... } — value 는 사다리 소속만 받는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SpeculativeDecodingData = {
  type: 'speculative-decoding';
  /** 큰 모형이 낼 글 (자료, 공백으로 가른 16 토큰). */
  target: string;
  /** 작은 모형이 올바른 앞부분이 주어졌을 때 각 자리에서 낼 낱말 (자료, 예로 정한 값). */
  guess: string;
  /** 작은 모형 한 낱말의 비용 (예로 정한 값). */
  draftCost: number;
  /** 큰 모형 검사 한 번의 비용 (예로 정한 값). */
  checkCost: number;
  /** 손잡이 사다리 — 초안 길이 γ. */
  ladder: number[];
  /** 처음 γ. */
  draft: number;
  /** 걸음 뒤 머무는 ms. */
  stepMs: number;
};

/** 한 판 — 찍은 수 k, 받은 수 a. */
export type SpeculationRound = { from: number; k: number; accepted: number };

export type SpeculationRun = {
  rounds: SpeculationRound[];
  checks: number;
  drafted: number;
  rejected: number;
  cost: number;
  perCheckX100: number;
};

/** 공백으로 가른 낱말 (= 토큰). */
export function splitTokens(text: string): string[] {
  return text.split(' ').filter((w) => w.length > 0);
}

/** 자리마다 작은 모형의 낱말이 큰 모형의 것과 같으면 1, 다르면 0. IR 에 건네는 맞음 배열. */
export function matchArray(target: string[], guess: string[]): number[] {
  return target.map((w, i) => (guess[i] === w ? 1 : 0));
}

/** 한 γ 의 판 전부를 셈한다. 순수 함수 — 알고리즘과 검사가 같이 부른다. */
export function speculateRounds(
  match: number[],
  gamma: number,
  draftCost: number,
  checkCost: number,
): SpeculationRun {
  const n = match.length;
  const rounds: SpeculationRound[] = [];
  let pos = 0;
  let drafted = 0;
  let rejected = 0;
  while (pos < n) {
    const k = Math.min(gamma, n - pos - 1);
    let a = 0;
    while (a < k && match[pos + a] === 1) a += 1;
    rounds.push({ from: pos, k, accepted: a });
    drafted += k;
    rejected += k - a;
    pos += a + 1;
  }
  const checks = rounds.length;
  return {
    rounds,
    checks,
    drafted,
    rejected,
    cost: drafted * draftCost + checks * checkCost,
    perCheckX100: Math.floor((n * 100 + Math.floor(checks / 2)) / checks),
  };
}

function readGamma(payload: unknown, ladder: number[]): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as { value?: unknown }).value;
  if (typeof v !== 'number') return null;
  return ladder.includes(v) ? v : null;
}

export async function speculativeDecodingAlgorithm(
  context: FacetContext<SpeculativeDecodingData>,
): Promise<void> {
  const ctx = context as ReactiveContext<SpeculativeDecodingData>;
  const data = ctx.data;
  const target = splitTokens(data.target);
  const guess = splitTokens(data.guess);
  const match = matchArray(target, guess);
  const ladder = data.ladder;
  const stepMs = data.stepMs;

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  // 계기 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다.
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number) => {
    const was = shown.get(name);
    if (was !== undefined && was === value) return;
    ctx.metric(name, value - (was ?? 0));
    shown.set(name, value);
  };

  const maxCost = Math.max(...ladder.map((g) => speculateRounds(match, g, data.draftCost, data.checkCost).cost));

  /** 한 판을 끝까지 재생한다. 취소되면 false. */
  async function play(gamma: number): Promise<boolean> {
    const index = ladder.indexOf(gamma);
    const run = speculateRounds(match, gamma, data.draftCost, data.checkCost);

    await phase('start');
    await ctx.emit({ type: 'run-start', payload: { gamma, index, maxCost } });
    gauge('check-count', 0);
    gauge('rejected-count', 0);
    gauge('cost-sum', 0);
    if (!(await ctx.sleep(stepMs))) return false;

    let checks = 0;
    let drafted = 0;
    let rejected = 0;
    let round = 0;
    for (const r of run.rounds) {
      if (ctx.cancelled) return false;
      round += 1;
      if (r.k > 0) {
        await phase('draft');
        await ctx.emit({ type: 'draft', payload: { round, from: r.from, k: r.k } });
        drafted += r.k;
        gauge('cost-sum', drafted * data.draftCost + checks * data.checkCost);
        if (!(await ctx.sleep(stepMs))) return false;
      }
      await phase('verify');
      await ctx.emit({
        type: 'verify',
        payload: { round, from: r.from, k: r.k, accepted: r.accepted },
      });
      checks += 1;
      rejected += r.k - r.accepted;
      gauge('check-count', checks);
      gauge('rejected-count', rejected);
      gauge('cost-sum', drafted * data.draftCost + checks * data.checkCost);
      if (!(await ctx.sleep(stepMs))) return false;
    }

    await phase('cost');
    await ctx.emit({
      type: 'run-end',
      payload: {
        gamma,
        index,
        checks: run.checks,
        drafted: run.drafted,
        rejected: run.rejected,
        cost: run.cost,
        perCheckX100: run.perCheckX100,
      },
    });
    return !ctx.cancelled;
  }

  try {
    let gamma = ladder.includes(data.draft) ? data.draft : ladder[0];
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await play(gamma))) return;

      let next: number | null = null;
      while (next === null) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'draft') continue;
        next = readGamma(input.payload, ladder);
      }
      gamma = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
