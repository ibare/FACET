/**
 * compare-and-swap — 견줌과 맞바꿈이 다른 동작임을 말하는 조각(piece).
 *
 * 짝을 하나씩 들어 견주고, 어긋나 있을 때만 두 값이 서로의 자리로 건너간다.
 * 견줌은 판정이고 맞바꿈은 그 판정의 결과다 — 셋 중 둘은 견줬는데 아무 일도
 * 일어나지 않는다.
 *
 * ── 식별자 문법
 *   index:<i>   i 번째 짝. 짝 안의 두 자리는 stage 가 안다.
 *
 * ── 이벤트 어휘 (C2). 확장 이벤트 넷 + 표준 done. **payload 는 하나도 없다.**
 *   compare  target index:<i>  payload 없음
 *            두 값을 견준다. 자리에서 들어올리기만 하고 아무것도 옮기지 않는다.
 *   swap     target index:<i>  payload 없음
 *            판정이 참이라 두 값이 동시에 엇갈려 서로의 자리로 건너간다.
 *   hold     target index:<i>  payload 없음
 *            판정이 거짓이라 두 값이 제 자리로 도로 내려앉는다.
 *   rewind   target/payload 없음
 *            advance 를 받아 처음으로 되감는다. 되감기 직후 첫 걸음까지 보인다.
 *   done     payload 없음
 *            다 끝났다.
 *
 *   silent 이벤트 없음 — 다섯 다 화면이 바뀐다.
 *
 *   **수를 싣지 않는다.** 견준 두 값도, 판정도, 견줌·옮김의 횟수도 전부 선언의
 *   `pairs` 에서 나온다. 걸음이 그것을 실어 나르면 화면과 다른 출처가 하나 더
 *   생겨 언젠가 갈린다. 판정은 `orderOf` 를 내주어 장면이 같은 함수를 부르게 하고,
 *   횟수는 장면이 센다. 걸음이 말하는 것은 **어느 짝을 지금 다루는가**(target)와
 *   **옮겼는가 멈췄는가**(event type) 뿐이다.
 *
 * ── 메커니즘
 *   reactive. mount 시 스스로 시작하고(ReactiveMechanism.init 의 ensureStarted),
 *   걸음 간격은 ctx.sleep(stepMs) 로 스스로 잰다. 자동 재생이 끝나면
 *   waitForInput 루프에서 advance 를 받아 처음부터 한 걸음씩 짚는다 (S-piece).
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

/** 견줌의 답. 'greater' 일 때만 맞바꿈이 일어난다. */
export type PairOrder = 'greater' | 'less' | 'equal';

export type CompareAndSwapData = {
  type: string;
  /** 차례로 다룰 짝. 각 짝은 [왼쪽 자리의 값, 오른쪽 자리의 값]. */
  pairs: number[][];
  /** 걸음 사이 간격 (ms). 읽을 시간을 주는 것은 저작 결정이라 선언에 둔다 (S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 800;

/** 선언에서 온 값이라 형태를 믿지 않고 좁힌다. */
function readPairs(raw: unknown): [number, number][] {
  if (!Array.isArray(raw)) return [];
  const out: [number, number][] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [a, b] = entry;
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    out.push([a, b]);
  }
  return out;
}

/**
 * 견줌의 답. 바탕 자료만 있으면 나오는 순수 함수라 걸음이 답을 실어 나르지 않고
 * 이 함수를 내준다 — 장면이 같은 함수를 부른다 (scene.ts). 그래야 판정이 두 곳에
 * 적히지 않는다.
 */
export function orderOf(left: number, right: number): PairOrder {
  if (left > right) return 'greater';
  if (left < right) return 'less';
  return 'equal';
}

export const compareAndSwap = async (base: FacetContext<CompareAndSwapData>): Promise<void> => {
  const ctx = base as ReactiveContext<CompareAndSwapData>;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  /** 'auto' 는 스스로 걸어가고, 'manual' 은 advance 한 번에 한 걸음씩 나아간다. */
  let mode: 'auto' | 'manual' = 'auto';
  /**
   * 되감기 직후의 첫 문만 그냥 통과시킨다. 첫 누름이 되감기만 하고 멈추면
   * 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
   */
  let passFirstGate = false;

  /** 걸음 앞의 문. 통과하면 true, 취소로 깨어났으면 false. */
  const gate = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    if (mode === 'auto') return ctx.sleep(stepMs);
    if (passFirstGate) {
      passFirstGate = false;
      return true;
    }
    while (!ctx.cancelled) {
      const input = await ctx.waitForInput();
      if (input.type === 'advance') return !ctx.cancelled;
    }
    return false;
  };

  /**
   * 짝을 차례로 다룬다.
   *
   * ctx.data 는 건드리지 않는다 — 다시 보기와 한 걸음이 언제나 같은 자리에서
   * 출발해야 한다. `readPairs` 가 짝마다 새 배열을 만드는 것으로 족하고, 자리를
   * 실제로 맞바꿔 둘 까닭은 없다. 각 짝을 한 번씩만 지나므로 바꿔 둔 값을 도로
   * 읽는 곳이 없고, 어느 칸에 어느 값이 앉았는지는 장면이 말한다.
   */
  const run = async (): Promise<void> => {
    const seats = readPairs(ctx.data.pairs);

    for (let i = 0; i < seats.length; i++) {
      const order = orderOf(seats[i][0], seats[i][1]);

      if (!(await gate())) return;
      await ctx.emit({ type: 'compare', target: `index:${i}` });

      if (!(await gate())) return;
      // 판정 그 자체는 어느 이벤트를 내느냐로 말한다. payload 로 되풀이하지 않는다.
      // type 은 리터럴로 쓴다 — 삼항으로 접으면 어휘가 코드에서 사라진다 (C2).
      if (order === 'greater') {
        await ctx.emit({ type: 'swap', target: `index:${i}` });
      } else {
        await ctx.emit({ type: 'hold', target: `index:${i}` });
      }
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'done' });
  };

  try {
    await run();
    // 자동 재생이 끝났다. 곱씹으며 읽고 싶은 사람을 위해 advance 를 기다린다.
    for (;;) {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return;
      if (input.type !== 'advance') continue;
      mode = 'manual';
      passFirstGate = true;
      await ctx.emit({ type: 'rewind' });
      await run();
    }
  } catch {
    // reset / destroy 로 취소되면 waitForInput 이 reject 한다. 조용히 끝낸다.
  }
};
