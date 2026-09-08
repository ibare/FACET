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
 * ── 이벤트 어휘 (C2). 확장 이벤트 넷 + 표준 done.
 *   compare  target index:<i>  payload { left: number; right: number; order: PairOrder }
 *            두 값을 견준다. 자리에서 들어올리기만 하고 아무것도 옮기지 않는다.
 *   swap     target index:<i>  payload 없음
 *            판정이 참이라 두 값이 동시에 엇갈려 서로의 자리로 건너간다.
 *   hold     target index:<i>  payload { reason: 'ordered' | 'equal' }
 *            판정이 거짓이라 두 값이 제 자리로 도로 내려앉는다.
 *   rewind   target/payload 없음
 *            advance 를 받아 처음으로 되감는다. 되감기 직후 첫 걸음까지 보인다.
 *   done     payload { compares: number; swaps: number }
 *            두 수는 손으로 적은 것이 아니라 순회에서 셈한 값이다.
 *
 *   silent 이벤트 없음 — 다섯 다 화면이 바뀐다.
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

function orderOf(left: number, right: number): PairOrder {
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
   * 출발해야 하므로 자리 상태는 이 실행의 지역 사본에만 둔다.
   */
  const run = async (): Promise<void> => {
    const seats = readPairs(ctx.data.pairs);
    let compares = 0;
    let swaps = 0;

    for (let i = 0; i < seats.length; i++) {
      const pair = seats[i];
      const left = pair[0];
      const right = pair[1];
      const order = orderOf(left, right);

      if (!(await gate())) return;
      compares++;
      await ctx.emit({
        type: 'compare',
        target: `index:${i}`,
        payload: { left, right, order },
      });

      if (!(await gate())) return;
      if (order === 'greater') {
        pair[0] = right;
        pair[1] = left;
        swaps++;
        await ctx.emit({ type: 'swap', target: `index:${i}` });
      } else {
        await ctx.emit({
          type: 'hold',
          target: `index:${i}`,
          payload: { reason: order === 'equal' ? 'equal' : 'ordered' },
        });
      }
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'done', payload: { compares, swaps } });
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
