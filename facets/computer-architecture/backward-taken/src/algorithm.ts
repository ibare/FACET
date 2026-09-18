/**
 * 뒤로 뛰면 반복 — 정적 예측 규칙 BTFN (Backward Taken, Forward Not taken).
 *
 * 프로그램을 주소 0 부터 따라 걷는다. 분기를 만날 때마다 **결과를 보기 전에** 목표 주소가
 * 분기 주소보다 작으면(뒤로) T, 크면(앞으로) N 으로 짐작하고, 자료의 결과 열에서 다음
 * 결과를 꺼내 맞았는지 센다. 결과가 T 면 목표로, N 이면 다음 주소로 간다. 주소가
 * 프로그램 끝을 넘으면 반복을 빠져나간 것이다.
 *
 * 이벤트 (모두 걸음이다 — silent 없음):
 *   init     payload { program: Instruction[]; total: number }
 *            바탕. total 은 결과 열의 길이(동적으로 만날 분기 수)
 *   branch   payload { at: number; from: number; to: number; target: number;
 *                      guess: 'T' | 'N'; outcome: 'T' | 'N'; hits: number }
 *            분기 하나. from 은 앞 걸음이 떨어진 주소, at 은 분기 주소, to 는 결과대로
 *            간 주소(끝을 넘으면 program.length). hits 는 여기까지 BTFN 이 맞힌 수
 *   compare  payload { total: number; btfn: number; alwaysN: number; alwaysT: number }
 *            같은 결과 열을 세 규칙으로 짐작했을 때 맞힌 수
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Outcome = 'T' | 'N';

/** 명령 하나. 분기면 target 에 목표 주소가 있다. 글자(op · args · label)는 코드라 언어를 타지 않는다. */
export type Instruction = {
  op: string;
  args: string;
  label?: string;
  target?: number;
};

export type BackwardTakenFacetData = {
  type: 'backward-taken';
  stepMs: number;
  program: Instruction[];
  /** 동적으로 만나는 분기의 결과 열 (만나는 순서대로). */
  outcomes: Outcome[];
};

/** 분기가 뒤로 뛰는가 — 목표 주소가 분기 주소보다 작다. 장면이 화살의 방향을 고를 때도 이것을 쓴다. */
export function jumpsBack(at: number, target: number): boolean {
  return target < at;
}

/** BTFN — 뒤로 뛰면 T, 앞으로 뛰면 N. */
function guessByDirection(at: number, target: number): Outcome {
  if (jumpsBack(at, target)) return 'T';
  return 'N';
}

export async function backwardTaken(context: FacetContext<BackwardTakenFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<BackwardTakenFacetData>;
  const { program, outcomes, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: { program: program.map((ins) => ({ ...ins })), total: outcomes.length },
  });

  let pc = 0;
  let from = 0;
  let seen = 0;
  let hits = 0;
  // 결과 열이 모자라 끝나지 않는 일이 없게 명령 수 × 결과 수 로 걸음을 묶는다.
  let budget = program.length * (outcomes.length + 1);
  while (pc < program.length && budget > 0) {
    if (ctx.cancelled) return;
    budget -= 1;
    const ins = program[pc]!;
    if (ins.target === undefined) {
      pc += 1;
      continue;
    }
    const outcome = outcomes[seen];
    if (outcome === undefined) return;
    const guess = guessByDirection(pc, ins.target);
    if (guess === outcome) hits += 1;
    seen += 1;
    const to = outcome === 'T' ? ins.target : pc + 1;
    if (!(await pause())) return;
    await ctx.emit({
      type: 'branch',
      payload: { at: pc, from, to, target: ins.target, guess, outcome, hits },
    });
    pc = to;
    from = to;
  }

  const met = outcomes.slice(0, seen);
  const alwaysN = met.filter((o) => o === 'N').length;
  const alwaysT = met.filter((o) => o === 'T').length;
  if (!(await pause())) return;
  await ctx.emit({
    type: 'compare',
    payload: { total: seen, btfn: hits, alwaysN, alwaysT },
  });
}
