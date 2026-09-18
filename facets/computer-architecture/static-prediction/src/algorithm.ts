/**
 * 정적 예측 — 분기의 결과를 보기 전에 방향만 보고 짐작한다면, 어떤 규칙이 가장 덜 틀리는가.
 *
 * 합산 반복 하나를 돈다. 원소 k 마다 분기 둘이 이 순서로 난다.
 *   앞 분기 `beq r3, r0, skip` — 앞으로 뛴다. 값이 0 이면 탄다.
 *   뒤 분기 `blt r1, r2, loop` — 뒤로 뛴다. k < n − 1 이면 탄다 (마지막에 안 탄다).
 *
 * 손잡이 `policy` 가 짐작 규칙을 고른다 (`initialData.policies` 의 순번).
 *   0 never    — 늘 안 탄다
 *   1 always   — 늘 탄다
 *   2 backward — 뒤로 뛰는 분기면 탄다, 앞으로 뛰는 분기면 안 탄다
 * 틀릴 때마다 `penalty` 박자를 잃는다. 맞히면 0 이다. 탄다고 맞혔을 때 목표 주소를 아는
 * 데 드는 값은 이 화면이 다루지 않는다.
 *
 * 짜임 (reactive) — 한 판을 끝까지 재생 → 입력을 기다림 → 받은 규칙으로 다시 재생.
 *
 * ── 이벤트
 *   phase   { phase: string }                                   silent
 *   policy  { policy: number, forwardGuess: 0|1, backwardGuess: 0|1 }
 *                                                              한 판의 시작. 바늘이 규칙의 짐작대로 돈다
 *   approach { k: number, backward: 0|1 }                        분기에 닿았다 — 결과를 아직 모른다
 *   branch  { k: number, backward: 0|1, guess: 0|1, taken: 0|1, miss: boolean }
 *                                                              분기 하나를 짐작하고 결과와 견준다
 *   loss    { k: number, backward: 0|1, cycles: number }        틀린 자리에서 버린 박자 덩어리
 *   tally   { policy, misses, forwardMisses, backwardMisses, total, penalty, lost, hitPercent }
 *                                                              한 판의 끝 (전부 number)
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *   'forward-branch' | 'backward-branch' | 'guess' | 'miss' | 'tally'
 *
 * ── 메트릭
 *   miss-count        지금 판에서 틀린 분기 수
 *   hit-percent       지금 판에서 지나온 분기 중 맞힌 비율 (반올림, 끝나면 20 개 전체)
 *   lost-cycle-count  지금 판에서 버린 박자 수
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type StaticPredictionData = {
  type: 'static-prediction';
  /** 프로그램 글 — 자료라 번역하지 않는다. */
  program: string[];
  /** 앞 분기(`beq`) 의 줄 번호와 그 목표 줄. */
  forwardLine: number;
  forwardTarget: number;
  /** 뒤 분기(`blt`) 의 줄 번호와 그 목표 줄. */
  backwardLine: number;
  backwardTarget: number;
  /** 값 열 — `lw r3` 가 차례로 읽는다. 0 이면 앞 분기가 탄다. */
  values: number[];
  /** 틀릴 때마다 잃는 박자 (EX 판정). */
  penalty: number;
  /** 손잡이 사다리 — 순번이 곧 `segments[].value` 다. */
  policies: string[];
  /** 처음 규칙의 순번. */
  policy: number;
  /** 걸음 간격. 틀림이 가장 많은 판(걸음 32 + 다가섬 20)이 14 초 안에 들도록 잡는다. */
  stepMs: number;
  /** 분기에 다가선 걸음(approach) 뒤의 간격 — 짧아도 되지만 읽을 수 있게 250 아래로 두지 않는다. */
  approachMs: number;
};

/** 규칙이 짐작하는 방향. 1 = 탄다, 0 = 안 탄다. IR 의 `guess` 와 같은 셈. */
export function guessOf(policy: number, backward: number): number {
  if (policy === 1) return 1;
  if (policy === 2) return backward;
  return 0;
}

/** 반올림 백분율 — IR 의 `hitPercent` 와 같은 식. */
export function hitPercentOf(misses: number, total: number): number {
  if (total <= 0) return 0;
  return Math.floor(((total - misses) * 100 + Math.floor(total / 2)) / total);
}

export type StaticPredictionResult = {
  misses: number;
  forwardMisses: number;
  backwardMisses: number;
  total: number;
  lost: number;
  hitPercent: number;
};

/** 한 판의 결과를 즉시 셈한다 (검사와 캡션이 쓴다). */
export function computeStaticPrediction(values: number[], policy: number, penalty: number): StaticPredictionResult {
  const n = values.length;
  let forwardMisses = 0;
  let backwardMisses = 0;
  for (let k = 0; k < n; k += 1) {
    const fwdTaken = values[k] === 0 ? 1 : 0;
    if (guessOf(policy, 0) !== fwdTaken) forwardMisses += 1;
    const backTaken = k < n - 1 ? 1 : 0;
    if (guessOf(policy, 1) !== backTaken) backwardMisses += 1;
  }
  const misses = forwardMisses + backwardMisses;
  const total = n * 2;
  return {
    misses,
    forwardMisses,
    backwardMisses,
    total,
    lost: misses * penalty,
    hitPercent: hitPercentOf(misses, total),
  };
}

function readPolicy(payload: unknown, count: number): number | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const v = (payload as { value?: unknown }).value;
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  if (v < 0 || v >= count) return null;
  return v;
}

export async function staticPredictionAlgorithm(baseCtx: FacetContext<StaticPredictionData>): Promise<void> {
  const ctx = baseCtx as ReactiveContext<StaticPredictionData>;
  const data = ctx.data;
  const values = data.values;
  const n = values.length;
  const penalty = data.penalty;
  const stepMs = data.stepMs;
  const approachMs = data.approachMs;
  const count = data.policies.length;

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 지금 보이는 계기 값 — 차이만 보낸다. 처음 한 번은 0 이어도 보낸다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number) => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  let policy = readPolicy({ value: data.policy }, count) ?? 0;

  /** 한 판. 끝까지 지났으면 true, 도중에 취소됐으면 false. */
  async function playRun(p: number): Promise<boolean> {
    gauge('miss-count', 0);
    gauge('hit-percent', 0);
    gauge('lost-cycle-count', 0);
    await ctx.emit({
      type: 'policy',
      payload: { policy: p, forwardGuess: guessOf(p, 0), backwardGuess: guessOf(p, 1) },
    });

    let misses = 0;
    let forwardMisses = 0;
    let backwardMisses = 0;
    let seen = 0;

    for (let k = 0; k < n; k += 1) {
      if (!(await ctx.sleep(stepMs))) return false;

      // 앞 분기 — 값이 0 이면 탄다
      // 방향을 가르는 줄이 한 걸음 동안 보이도록 걸음 경계를 둔다 (phase 는 다음 phase 에 덮인다)
      await phase('forward-branch');
      const fwdTaken = values[k] === 0 ? 1 : 0;
      await ctx.emit({ type: 'approach', payload: { k, backward: 0 } });
      if (!(await ctx.sleep(approachMs))) return false;
      await phase('guess');
      const fwdGuess = guessOf(p, 0);
      const fwdMiss = fwdGuess !== fwdTaken;
      seen += 1;
      if (fwdMiss) {
        misses += 1;
        forwardMisses += 1;
      }
      gauge('miss-count', misses);
      gauge('hit-percent', hitPercentOf(misses, seen));
      await ctx.emit({
        type: 'branch',
        payload: { k, backward: 0, guess: fwdGuess, taken: fwdTaken, miss: fwdMiss },
      });
      if (fwdMiss) {
        if (!(await ctx.sleep(stepMs))) return false;
        await phase('miss');
        gauge('lost-cycle-count', misses * penalty);
        await ctx.emit({ type: 'loss', payload: { k, backward: 0, cycles: penalty } });
      }

      if (!(await ctx.sleep(stepMs))) return false;

      // 뒤 분기 — 마지막 원소가 아니면 탄다
      await phase('backward-branch');
      const backTaken = k < n - 1 ? 1 : 0;
      await ctx.emit({ type: 'approach', payload: { k, backward: 1 } });
      if (!(await ctx.sleep(approachMs))) return false;
      await phase('guess');
      const backGuess = guessOf(p, 1);
      const backMiss = backGuess !== backTaken;
      seen += 1;
      if (backMiss) {
        misses += 1;
        backwardMisses += 1;
      }
      gauge('miss-count', misses);
      gauge('hit-percent', hitPercentOf(misses, seen));
      await ctx.emit({
        type: 'branch',
        payload: { k, backward: 1, guess: backGuess, taken: backTaken, miss: backMiss },
      });
      if (backMiss) {
        if (!(await ctx.sleep(stepMs))) return false;
        await phase('miss');
        gauge('lost-cycle-count', misses * penalty);
        await ctx.emit({ type: 'loss', payload: { k, backward: 1, cycles: penalty } });
      }
    }

    if (!(await ctx.sleep(stepMs))) return false;
    await phase('tally');
    const total = n * 2;
    const lost = misses * penalty;
    const hitPercent = hitPercentOf(misses, total);
    gauge('miss-count', misses);
    gauge('hit-percent', hitPercent);
    gauge('lost-cycle-count', lost);
    await ctx.emit({
      type: 'tally',
      payload: { policy: p, misses, forwardMisses, backwardMisses, total, penalty, lost, hitPercent },
    });
    return true;
  }

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRun(policy))) return;

      // 입력 대기 — 규칙 손잡이만 받는다
      for (;;) {
        if (ctx.cancelled) return;
        const input: ReactiveInputEvent = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'policy') continue;
        const next = readPolicy(input.payload, count);
        if (next === null) continue;
        policy = next;
        break;
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다.
    if (!ctx.cancelled) throw err;
  }
}
