/**
 * requiresSorted — 같은 이진 탐색을 두 줄에 동시에 건다.
 *
 * 두 줄은 같은 값 일곱을 갖되 한 줄은 오름차순으로 서 있고 한 줄은 흐트러져
 * 있다. 걸음마다 두 줄이 **나란히** 가운데를 짚고 절반을 버린다. 흐트러진 줄은
 * 첫 판단에서 답이 든 절반을 버리고, 끝내 "없다" 고 답한다 — 그 값이 다섯째
 * 자리에 그대로 있는데도.
 *
 * ── 식별자
 *   줄 식별자는 `data.rows[].key` ('sorted' / 'shuffled'). 두 줄이 같은 칸 번호를
 *   쓰므로 `index:N` 만으로는 어느 줄인지 가릴 수 없다. 그래서 `target` 을 쓰지
 *   않고 payload 를 정규 경로로 삼는다 (C2 "정규 경로는 payload").
 *
 * ── 이벤트 (전부 facet 고유 확장, silent 없음 = 모두 step boundary)
 *
 *   probe        payload 없음. 아직 도는 줄들이 각자 제 구간의 가운데를 짚는다.
 *                어느 줄이 아직 도는지도, 그 줄이 어느 자리를 짚는지도 장면이
 *                구조에서 셈한다 — 여기 실어 보내면 같은 수가 두 출처에서 나온다.
 *
 *   settle       payload 없음. 짚은 값과 견준 결과. 어느 쪽 절반을 버렸는지는
 *                아래 `narrowAt` 이 정하고, 장면이 **같은 함수**를 부른다.
 *
 *   answer-lost  { row: string }
 *                방금 버린 절반 안에 찾는 값이 실제로 들어 있었다. 한 줄에 한 번만
 *                난다 (처음 밀려나는 순간). 어느 줄인지는 그 줄의 이름이 정본이고
 *                (위 식별자 규약), 밀려난 자리와 밀어낸 짚기는 장면이 제 자취에서
 *                찾는다.
 *
 *   done         payload 없음. 줄마다의 답. 찾았는지 못 찾았는지도, 그 값이 실제로
 *                있는 자리도 장면이 짚어 온 자취에서 읽는다.
 *
 *   rewind       payload 없음. 자동 재생을 마친 뒤 `advance` 를 처음 눌렀을 때
 *                화면을 처음으로 되돌린다.
 *
 * ── 셈은 한 곳에서만 난다
 *   `midOf` 와 `narrowAt` 은 **바탕 자료에 먹이면 결과가 나오는 순수 함수**라
 *   payload 에 싣지 않고 내준다. 장면이 같은 함수를 부르므로 화면에 뜨는 자리
 *   번호와 알고리즘이 실제로 짚은 자리가 갈릴 수 없다 (프로토콜 4 절 B 갈래).
 *   특히 가운데를 고르는 잣대는 두 곳에서 각자 자르면 반드시 어긋난다.
 *
 * ── 진행 (S-piece)
 *   mechanismKind 'reactive'. 자동 재생은 `ctx.sleep(stepMs)` 로 나아가고, 다 돈 뒤
 *   `waitForInput` 으로 `advance` 를 기다린다. 처음 누르면 되감고 첫 걸음까지 보인
 *   뒤, 그다음부터 한 걸음씩 나아간다.
 *
 * ── 메트릭
 *   없다. 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RequiresSortedRow = {
  /** 줄 식별자. 이벤트 payload 의 `row` 가 이 값이다. */
  key: string;
  values: number[];
};

export type RequiresSortedData = {
  type: 'requires-sorted';
  /** 두 줄에서 똑같이 찾는 값. */
  target: number;
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
  rows: RequiresSortedRow[];
};

/** 한 번 짚고 나서 구간이 어떻게 되었나. */
export type LookAction = 'left' | 'right' | 'found' | 'empty';

/** 견준 결과와 그 뒤에 남는 구간. */
export type Narrowed = { action: LookAction; lo: number; hi: number };

/**
 * 가운데를 고르는 잣대.
 *
 * **이 한 줄이 두 곳에 적히면 화면과 알고리즘이 다른 자리를 짚는다.** 그래서
 * 알고리즘이 내주고 장면이 같은 것을 부른다 (프로토콜 4 절 "자르는 잣대가 두
 * 군데면 갈린다").
 */
export function midOf(lo: number, hi: number): number {
  return Math.floor((lo + hi) / 2);
}

/**
 * 한 자리를 짚고 견주어 남는 구간을 낸다.
 *
 * `'left'` 는 왼쪽 절반을 남겼다는 뜻이고 `'right'` 는 오른쪽을 남겼다는 뜻이다.
 * 찾으면 구간을 그 한 칸으로 오므린다 — 더 볼 것이 없다는 것을 구간 자가 말하게
 * 하려는 것이고, 그 결정도 여기 한 곳에만 둔다.
 */
export function narrowAt(
  values: readonly number[],
  target: number,
  slot: number,
  lo: number,
  hi: number,
): Narrowed {
  const probed = values[slot];
  if (probed === target) return { action: 'found', lo: slot, hi: slot };
  const kept =
    target < probed ? { lo, hi: slot - 1, action: 'left' as const } : { lo: slot + 1, hi, action: 'right' as const };
  if (kept.lo > kept.hi) return { action: 'empty', lo: kept.lo, hi: kept.hi };
  return kept;
}

/** 걸음을 밟는 줄 하나. 짚은 자리는 `midOf` 로 그때그때 셈하므로 쥐지 않는다. */
type Cursor = {
  key: string;
  values: number[];
  lo: number;
  hi: number;
  /** 찾았거나 구간이 닫혔다. 더 짚지 않는다. */
  closed: boolean;
  /** 찾는 값이 실제로 있는 자리. 구조에서 셈한다. */
  answerAt: number;
  /** 그 자리가 아직 살아 있는 구간 안에 있는가. */
  answerInWindow: boolean;
};

const DEFAULT_STEP_MS = 850;

/**
 * 걸음 사이의 문(gate).
 *
 * 자동 재생이면 `stepMs` 만큼 자고, 수동 재생이면 `advance` 를 기다린다.
 * 되감기 직후의 첫 문만 그냥 통과시킨다 — 되감기를 부른 그 누름이 첫 걸음까지
 * 보여야 하기 때문이다 (S-piece).
 */
type Gate = () => Promise<boolean>;

export async function requiresSortedAlgorithm(
  ctx: FacetContext<RequiresSortedData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<RequiresSortedData>;
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  let manual = false;
  let skipNextGate = false;

  const gate: Gate = async () => {
    if (ctx.cancelled) return false;
    if (!manual) return await rc.sleep(stepMs);
    if (skipNextGate) {
      skipNextGate = false;
      return true;
    }
    await rc.waitForInput();
    return !ctx.cancelled;
  };

  try {
    for (;;) {
      await playOnce(rc, gate);
      if (ctx.cancelled) return;
      // 다 돌았다. 첫 `advance` 는 되감고 첫 걸음까지 보인다.
      await rc.waitForInput();
      if (ctx.cancelled) return;
      manual = true;
      skipNextGate = true;
      await ctx.emit({ type: 'rewind' });
    }
  } catch (err) {
    // reset 이 waitForInput 을 reject 한다 — 정상 종료 경로.
    if ((err as Error)?.message !== 'cancelled') throw err;
  }
}

/** 두 줄에 같은 이진 탐색을 한 회 건다. 걸음마다 gate 를 먼저 지난다. */
async function playOnce(ctx: ReactiveContext<RequiresSortedData>, gate: Gate): Promise<void> {
  const { target, rows } = ctx.data;
  const cursors: Cursor[] = rows.map((r) => ({
    key: r.key,
    values: r.values,
    lo: 0,
    hi: r.values.length - 1,
    closed: false,
    answerAt: r.values.indexOf(target),
    answerInWindow: r.values.indexOf(target) >= 0,
  }));

  while (cursors.some((c) => !c.closed)) {
    // ── 짚는다. 아직 도는 줄이 한꺼번에 움직인다. 어느 자리인지는 `midOf` 가 정하고
    //    장면이 같은 함수를 부르므로 실어 보낼 것이 없다.
    if (!(await gate())) return;
    await ctx.emit({ type: 'probe' });

    // ── 견주고 절반을 버린다. 판정도 `narrowAt` 한 함수에서만 난다.
    const lost: string[] = [];
    for (const c of cursors) {
      if (c.closed) continue;
      const next = narrowAt(c.values, target, midOf(c.lo, c.hi), c.lo, c.hi);
      c.lo = next.lo;
      c.hi = next.hi;
      if (next.action === 'found' || next.action === 'empty') c.closed = true;

      // 방금 버린 절반이 답을 품고 있었는가 — 줄마다 처음 한 번만 알린다.
      if (next.action !== 'found' && c.answerInWindow) {
        const stillIn = c.answerAt >= c.lo && c.answerAt <= c.hi;
        if (!stillIn) {
          c.answerInWindow = false;
          lost.push(c.key);
        }
      }
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'settle' });

    for (const row of lost) {
      if (!(await gate())) return;
      await ctx.emit({ type: 'answer-lost', payload: { row } });
    }
  }

  if (!(await gate())) return;
  await ctx.emit({ type: 'done' });
}
