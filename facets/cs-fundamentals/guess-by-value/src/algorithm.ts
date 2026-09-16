/**
 * guess-by-value — 값의 크기로 자리를 겨누는 조각(piece) 알고리즘.
 *
 * 한 배열을 두 방식이 나란히 훑는다. 위 줄은 늘 가운데를 짚는 쪽(이진 탐색),
 * 아래 줄은 양 끝 값과 찾는 값이 만드는 비율을 자리 번호로 옮겨 겨누는
 * 쪽(보간 탐색)이다.
 *
 * ── 걸을 자리는 순수 함수가 내고, 발신은 박자만 친다
 *
 * 두 방식이 어느 자리를 어느 순서로 짚는지는 **바탕 자료에 순수 함수를 먹이면
 * 나오는 값**이다. 그래서 `midSteps` · `aimShots` 를 밖으로 내주고 장면이 같은
 * 함수를 부른다 (프로토콜 4 절의 B 갈래). 특히 겨누는 자리는 나눗셈으로 나오므로
 * 두 곳에서 각자 셈하면 끝자리에서 갈린다 — 한 함수만 지나게 한다.
 *
 * 그 덕에 **발신의 payload 가 전부 비었다.** 짚은 횟수도, 남은 구간도, 비율도,
 * 자리 번호도 장면이 계획과 발신 차례에서 셈한다. 무거운 payload 는 다음 사람이
 * 집어 쓸 문을 열어 둔 채가 되고, 그 문이 곧 "두 자리에서 세기" 가 들어오는 길이다.
 *
 * ── 식별자
 *   `index:<i>`  배열의 i 번 자리. 어느 줄의 자리인지는 발신 차례가 말한다 —
 *                위 줄이 `lane-settled` 로 닫히기 전의 `probe` 가 위 줄의 것이다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장 · C2)
 *   'range-set'    payload 없음.
 *                  가운데를 짚는 쪽이 온 구간을 남은 구간으로 삼고 시작한다.
 *   'probe'        target `index:<i>` · payload 없음.
 *                  한 자리를 짚었다.
 *   'discard-half' payload 없음.
 *                  짚은 값이 목표와 어긋나 절반이 빠진다.
 *   'lane-settled' payload 없음 · **silent: true**.
 *                  그 줄이 할 일을 마쳤다. 화면에서는 위 줄의 구간 표시와 커서가
 *                  걷히는 것이 전부이고 새로 하는 말이 없어, 걸음을 하나 더 세우면
 *                  띠에 얇은 눈금이 선다. 앞 걸음에 접는다 (프로토콜 4 절).
 *   'scale-set'    payload 없음.
 *                  겨누는 쪽이 남은 구간의 양 끝 값을 자로 삼는다.
 *   'aim-measure'  payload 없음.
 *                  찾는 값이 그 자 위 어디쯤인지 잰다.
 *   'aim-land'     payload 없음.
 *                  잰 비율이 자리 번호로 떨어진다.
 *   'rewind'       payload 없음. 한 걸음씩 되짚기 위해 처음으로 되감는다.
 *   'done'         payload 없음. 두 방식의 짚은 횟수를 견준다.
 *
 * ── 진행
 *   reactive 메커니즘. mount 즉시 자동 재생하고, 다 마치면 `advance` 입력을
 *   기다린다. 첫 `advance` 는 되감고 첫 걸음까지 보이며, 그 뒤로는 한 번에
 *   한 걸음씩 나아간다 (S-piece).
 *
 * ── 메트릭
 *   없다. 조각은 셀 것을 패널에 두지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type GuessByValueData = {
  type: 'guess-by-value';
  /** 오름차순으로 고르게 퍼진 값들. 두 줄이 같은 배열을 훑는다. */
  values: number[];
  /** 찾는 값. */
  target: number;
  /** 걸음 사이 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/**
 * 늘 가운데를 짚는 쪽이 밟는 자리 하나.
 *
 * 차례가 곧 몇 번째로 짚는가이고, `lo`·`hi` 는 **짚기 전에** 남아 있던 구간이다.
 */
export type MidStep = {
  readonly lo: number;
  readonly hi: number;
  /** 이번에 짚는 자리 — 남은 구간의 한가운데. */
  readonly mid: number;
  /** 어느 쪽 절반이 빠지나. 찾았으면 `null` 이고 거기서 멈춘다. */
  readonly drop: 'left' | 'right' | null;
};

/**
 * 값으로 겨누는 쪽이 밟는 겨눔 하나.
 *
 * `lo`·`hi` 는 겨눌 때 남아 있던 구간이고, **자의 두 끝이 곧 그 두 자리**다.
 */
export type AimShot = {
  readonly lo: number;
  readonly hi: number;
  /** 찾는 값이 그 자 위 어디쯤인가. 0..1. */
  readonly fraction: number;
  /** 그 비율이 떨어진 자리. */
  readonly index: number;
  /** 그 자리에 찾는 값이 있었나. */
  readonly hit: boolean;
};

/**
 * 가운데를 짚는 쪽이 밟을 자리 전부.
 *
 * 바탕 자료와 찾는 값만으로 결정된다. algorithm 이 이 목록을 걸으며 발신하고,
 * 장면도 같은 목록을 쥔다 — 남은 구간도 짚은 자리도 한 함수에서만 나온다.
 */
export function midSteps(values: readonly number[], target: number): MidStep[] {
  const out: MidStep[] = [];
  let lo = 0;
  let hi = values.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const value = values[mid];
    if (value === target) {
      out.push({ lo, hi, mid, drop: null });
      break;
    }
    if (value < target) {
      out.push({ lo, hi, mid, drop: 'left' });
      lo = mid + 1;
    } else {
      out.push({ lo, hi, mid, drop: 'right' });
      hi = mid - 1;
    }
  }
  return out;
}

/**
 * 값으로 겨누는 쪽이 밟을 겨눔 전부.
 *
 * 비율과 자리 번호가 여기서만 나온다. 화면의 조각이 서는 자리도, 선이 떨어지는
 * 자리도, 수식에 적히는 수도 이 값들이라 **두 곳에서 셈하면 나눗셈 끝자리에서
 * 갈린다** (프로토콜 4 절의 부동소수 함정).
 */
export function aimShots(values: readonly number[], target: number): AimShot[] {
  const out: AimShot[] = [];
  let lo = 0;
  let hi = values.length - 1;
  while (lo <= hi) {
    const loValue = values[lo];
    const hiValue = values[hi];
    // 찾는 값이 남은 구간의 두 끝 밖이면 겨눌 자리가 없다.
    if (target < loValue || target > hiValue) break;

    const denom = hiValue - loValue;
    const fraction = denom === 0 ? 0 : (target - loValue) / denom;
    const index = lo + (denom === 0 ? 0 : Math.floor(fraction * (hi - lo)));
    const value = values[index];
    const hit = value === target;
    out.push({ lo, hi, fraction, index, hit });
    if (hit) break;

    if (value < target) lo = index + 1;
    else hi = index - 1;
  }
  return out;
}

const CANCELLED = 'cancelled';

export async function guessByValueAlgorithm(
  base: FacetContext<GuessByValueData>,
): Promise<void> {
  const ctx = base as ReactiveContext<GuessByValueData>;
  const values = ctx.data.values;
  const target = ctx.data.target;
  const stepMs = ctx.data.stepMs;
  if (values.length === 0) return;

  /** 자동 재생을 마친 뒤에는 걸음마다 `advance` 를 기다린다. */
  let manual = false;
  /** 되감은 직후의 첫 문은 그냥 통과시킨다 — 첫 누름이 첫 걸음까지 보이도록. */
  let passOneGate = false;

  async function waitAdvance(): Promise<void> {
    for (;;) {
      const ev = await ctx.waitForInput();
      if (ev.type === 'advance') return;
    }
  }

  /** 걸음 사이의 문. 자동일 때는 시간이, 수동일 때는 사용자가 연다. */
  async function gate(): Promise<void> {
    if (ctx.cancelled) throw new Error(CANCELLED);
    if (manual) {
      if (passOneGate) {
        passOneGate = false;
        return;
      }
      await waitAdvance();
      return;
    }
    const ok = await ctx.sleep(stepMs);
    if (!ok || ctx.cancelled) throw new Error(CANCELLED);
  }

  /** 늘 가운데를 짚는 쪽. 계획을 걸으며 박자만 친다. */
  async function walkMiddle(): Promise<void> {
    await gate();
    await ctx.emit({ type: 'range-set' });

    for (const step of midSteps(values, target)) {
      await gate();
      await ctx.emit({ type: 'probe', target: `index:${step.mid}` });
      if (step.drop === null) break;
      // 절반이 빠지는 것은 따로 하는 말이라 문을 하나 둔다. 문 없이 붙이면
      // 그 걸음의 벽시계가 애니메이션 길이뿐이라 읽을 틈이 없다 (S-piece).
      await gate();
      await ctx.emit({ type: 'discard-half' });
    }

    await ctx.emit({ type: 'lane-settled', silent: true });
  }

  /** 값의 크기로 겨누는 쪽. 겨눔마다 자를 세우고 재고 떨어뜨리고 짚는다. */
  async function walkAim(): Promise<void> {
    for (const shot of aimShots(values, target)) {
      await gate();
      await ctx.emit({ type: 'scale-set' });

      await gate();
      await ctx.emit({ type: 'aim-measure' });

      await gate();
      await ctx.emit({ type: 'aim-land' });

      await gate();
      await ctx.emit({ type: 'probe', target: `index:${shot.index}` });
    }

    await ctx.emit({ type: 'lane-settled', silent: true });
  }

  async function runOnce(): Promise<void> {
    await walkMiddle();
    await walkAim();
    await gate();
    await ctx.emit({ type: 'done' });
  }

  for (;;) {
    await runOnce();
    // 자동 재생이 끝났다. 다음 `advance` 는 되감고 첫 걸음까지 보인다.
    await waitAdvance();
    if (ctx.cancelled) throw new Error(CANCELLED);
    manual = true;
    passOneGate = true;
    await ctx.emit({ type: 'rewind' });
  }
}
