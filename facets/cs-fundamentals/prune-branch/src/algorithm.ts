/**
 * 가지치기 조각(piece) — 가망이 없다고 확정된 자리 아래는 아예 가 보지 않는다.
 *
 * ── 무엇을 보이는가
 *
 * 수 넷 `[7, 5, 4, 2]` 에서 골라 합이 `6` 이 되게 한다. 왼쪽부터 하나씩
 * "넣는다 / 안 넣는다" 로 갈라 깊이 우선으로 내려가되, **지금까지의 합이 6 을
 * 넘은 자리에서는 더 내려가지 않는다.** 닫는 판정은 셈 하나다 (`sum > target`).
 *
 * 다 뻗으면 자리가 31 (= 2^5 - 1). 접으면 15 만 열고 16 은 손도 대지 않는다.
 * 접히는 자리는 셋 — `[7]`(합 7) · `[5,4]`(합 9) · `[5,2]`(합 7). 그래도 답
 * `[4, 2]` 는 그대로 찾는다. 접는 것은 요령이 아니라 증명이다 — 합이 이미 목표를
 * 넘었으면 그 아래에서 합이 다시 줄어들 길이 없으므로 답이 있을 수 없다.
 *
 * 걸음 순서는 **자료가 정한다.** 값 목록을 왼쪽부터 가르며 내려가는 깊이 우선
 * 순회 그 자체이고, 손으로 적은 걸음표가 아니다 (S-piece).
 *
 * ── 식별자 문법
 *
 * `node:r<경로>` — 경로는 결정의 나열이다. `'1'` = 넣는다(왼쪽 자식),
 * `'0'` = 안 넣는다(오른쪽 자식). 뿌리는 `node:r`, `node:r0011` 은
 * 7 을 빼고 · 5 를 빼고 · 4 를 넣고 · 2 를 넣은 자리 = `[4, 2]`.
 *
 * ── 이벤트 (전부 facet 고유 확장. silent 는 하나도 없다)
 *
 * | type            | target          | payload |
 * |-----------------|-----------------|---------|
 * | `task-set`      | 없음            | 없음    |
 * | `branch-grow`   | `node:r<경로>`  | 없음    |
 * | `branch-cut`    | `node:r<경로>`  | 없음    |
 * | `branch-leaf`   | `node:r<경로>`  | 없음    |
 * | `branch-answer` | `node:r<경로>`  | 없음    |
 * | `done`          | 없음            | 없음    |
 * | `rewind`        | 없음            | 없음    |
 *
 * `branch-*` 넷은 모두 "가지가 부모에서 이 자리까지 뻗어 나와 판정을 받는다" 는
 * 한 걸음이며, 갈리는 것은 판정뿐이라 type 을 넷으로 나눈다 (C2 — type 은 리터럴).
 *
 * **payload 가 하나도 없다.** 층도 합도 고른 수도 연 자리 수도 안 연 자리 수도
 * 전부 결정 경로와 바탕 자료에서 나오므로 장면이 셈한다. 실어 오면 화면의 구조와
 * 다른 출처가 되어 언젠가 갈린다. 다만 합을 내는 규칙만은 **닫는 잣대 그 자체**라
 * 여기서 순수 함수로 내주고 (`pathSum`) 장면이 같은 것을 부른다.
 *
 * ── 메트릭
 *
 * 없다. 조각은 `ctx.metric` 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, FacetRuntimeEvent, ReactiveContext } from '@ffacet/core/runtime';

export type PruneBranchData = {
  type: 'prune-branch';
  /** 고를 수 목록. 왼쪽부터 한 층씩 결정한다. */
  values: number[];
  /** 맞춰야 하는 합. 지금까지의 합이 이 값을 넘으면 그 자리에서 닫는다. */
  target: number;
  /** 걸음 간격 (S-piece). 아래 HOLD 배수가 이 값에 곱해진다. */
  stepMs: number;
};

/**
 * 결정 경로가 고른 수들. `'1'` 인 자리의 값만 왼쪽부터.
 *
 * 화면도 이것을 부른다 — 답에 무엇이 들었는지가 두 곳에 적히지 않게 (S-scene).
 */
export function pickedOnPath(values: readonly number[], path: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < path.length; i += 1) {
    if (path[i] === '1') out.push(values[i]);
  }
  return out;
}

/**
 * 결정 경로까지의 합. **닫는 잣대가 보는 수**다.
 *
 * 걸음에 실어 보내지 않고 함수를 내준다. 싣는 순간 다음 사람이 집어 쓸 문이
 * 열리고, 그 문이 곧 "두 자리에서 세기" 가 들어오는 길이다.
 */
export function pathSum(values: readonly number[], path: string): number {
  let sum = 0;
  for (const v of pickedOnPath(values, path)) sum += v;
  return sum;
}

/**
 * 걸음마다 머무는 시간의 배수.
 *
 * `stepMs` 하나로 모든 걸음을 같게 두면 뻗기만 하는 자리와 닫히는 자리가 같은
 * 무게로 지나간다. 닫히는 순간이 이 조각의 전부이므로 그 자리에 더 머문다.
 */
const HOLD = {
  /** 다 뻗었을 때의 나무(옅은 유령)를 먼저 보는 시간. */
  ghost: 0.7,
  /** 무엇을 맞춰야 하는지 읽는 시간. */
  task: 0.9,
  /** 뿌리 — 아무것도 안 고른 자리. */
  root: 0.8,
  /** 그냥 뻗는 자리. */
  step: 0.42,
  /** 끝까지 정했으나 합이 어긋난 자리. */
  leaf: 0.45,
  /** 닫히는 자리 — 이 조각의 주장. */
  cut: 1.1,
  /** 답. */
  answer: 1.4,
} as const;

export async function pruneBranch(ctx: FacetContext<PruneBranchData>): Promise<void> {
  const rc = ctx as ReactiveContext<PruneBranchData>;
  const { values, target, stepMs } = rc.data;
  const n = values.length;

  /** 자동 재생을 마친 뒤 `advance` 를 받으면 참이 되고, 그 뒤로는 문이 입력을 기다린다. */
  let manual = false;
  /** 되감기 직후의 첫 문만 그냥 통과시킨다 — 눌러도 반응 없는 것으로 읽히지 않게 (S-piece). */
  let openGate = false;
  /** 다음 걸음 전에 지금 화면에 머무는 시간의 배수. */
  let nextHold: number = HOLD.ghost;

  /** emit 앞의 문. 자동이면 재우고, 손으로 짚는 중이면 입력을 기다린다. */
  async function hold(): Promise<void> {
    if (manual) {
      if (openGate) {
        openGate = false;
        return;
      }
      await rc.waitForInput();
      return;
    }
    if (!(await rc.sleep(stepMs * nextHold))) throw new Error('cancelled');
  }

  async function beat(event: FacetRuntimeEvent, holdAfter: number): Promise<void> {
    await hold();
    await ctx.emit(event);
    nextHold = holdAfter;
  }

  async function run(): Promise<void> {
    nextHold = HOLD.ghost;

    await beat({ type: 'task-set' }, HOLD.task);

    /**
     * 깊이 우선으로 내려간다. `path` 의 글자 하나가 결정 하나 —
     * `'1'` 넣는다 / `'0'` 안 넣는다.
     */
    async function walk(path: string): Promise<void> {
      const id = `r${path}`;
      const level = path.length;
      const sum = pathSum(values, path);

      // 닫는 판정은 셈 하나다. 합이 이미 목표를 넘었으면 아래를 볼 이유가 없다.
      if (sum > target) {
        await beat({ type: 'branch-cut', target: `node:${id}` }, HOLD.cut);
        return;
      }

      if (level === n) {
        if (sum === target) {
          await beat({ type: 'branch-answer', target: `node:${id}` }, HOLD.answer);
        } else {
          await beat({ type: 'branch-leaf', target: `node:${id}` }, HOLD.leaf);
        }
        return;
      }

      await beat(
        { type: 'branch-grow', target: `node:${id}` },
        level === 0 ? HOLD.root : HOLD.step,
      );

      await walk(`${path}1`);
      await walk(`${path}0`);
    }

    await walk('');

    await beat({ type: 'done' }, HOLD.task);
  }

  try {
    await run();
    // 자동 재생은 끝났다. 이제부터 `advance` 는 처음으로 되감고 한 걸음씩 짚는다.
    for (;;) {
      await rc.waitForInput();
      manual = true;
      openGate = true;
      await ctx.emit({ type: 'rewind' });
      await run();
    }
  } catch (err) {
    // waitForInput 은 reset / destroy 때 'cancelled' 로 reject 한다. 그것만
    // 조용히 물러나고, 나머지는 다시 던져 러너의 로깅 경로에 걸리게 한다 —
    // 통째로 삼키면 진짜 결함이 "그냥 멈춘 화면" 으로만 보인다.
    if ((err as Error | undefined)?.message !== 'cancelled') throw err;
  }
}
