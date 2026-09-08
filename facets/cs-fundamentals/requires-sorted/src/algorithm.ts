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
 *   probe        { probes: { row: string; index: number; value: number }[] }
 *                아직 도는 줄들이 각자 제 구간의 가운데를 짚는다.
 *
 *   settle       { results: { row: string; action: 'left' | 'right' | 'found' | 'empty';
 *                             lo: number; hi: number; foundAt: number }[] }
 *                짚은 값과 견준 결과. 'left'/'right' 는 반대쪽 절반을 버렸다는 뜻,
 *                'found' 는 그 자리에서 멈췄다는 뜻, 'empty' 는 구간이 비어 없다고
 *                답했다는 뜻. lo > hi 면 그 줄의 구간은 닫힌 것이다.
 *
 *   answer-lost  { row: string; index: number }
 *                방금 버린 절반 안에 찾는 값이 실제로 들어 있었다. 한 줄에 한 번만
 *                난다 (처음 밀려나는 순간).
 *
 *   done         { verdicts: { row: string; found: boolean; index: number }[] }
 *                줄마다의 답. found 가 false 여도 index 는 그 값이 실제로 있는
 *                자리를 가리킨다 — 어긋남을 보이는 것이 이 조각의 일이다.
 *
 *   rewind       payload 없음. 자동 재생을 마친 뒤 `advance` 를 처음 눌렀을 때
 *                화면을 처음으로 되돌린다.
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

type Cursor = {
  key: string;
  values: number[];
  lo: number;
  hi: number;
  mid: number;
  /** 찾는 값이 실제로 있는 자리. 구조에서 셈한다. */
  answerAt: number;
  /** 그 자리가 아직 살아 있는 구간 안에 있는가. */
  answerInWindow: boolean;
  state: 'active' | 'found' | 'absent';
  foundAt: number;
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
    mid: -1,
    answerAt: r.values.indexOf(target),
    answerInWindow: r.values.indexOf(target) >= 0,
    state: 'active',
    foundAt: -1,
  }));

  while (cursors.some((c) => c.state === 'active')) {
    // ── 짚는다. 아직 도는 줄이 한꺼번에 움직인다.
    const probes: { row: string; index: number; value: number }[] = [];
    for (const c of cursors) {
      if (c.state !== 'active') continue;
      c.mid = (c.lo + c.hi) >> 1;
      probes.push({ row: c.key, index: c.mid, value: c.values[c.mid] as number });
    }
    if (!(await gate())) return;
    await ctx.emit({ type: 'probe', payload: { probes } });

    // ── 견주고 절반을 버린다.
    const results: {
      row: string;
      action: 'left' | 'right' | 'found' | 'empty';
      lo: number;
      hi: number;
      foundAt: number;
    }[] = [];
    const lost: { row: string; index: number }[] = [];

    for (const c of cursors) {
      if (c.state !== 'active') continue;
      const probed = c.values[c.mid] as number;
      let action: 'left' | 'right' | 'found' | 'empty';
      if (probed === target) {
        c.state = 'found';
        c.foundAt = c.mid;
        action = 'found';
      } else if (target < probed) {
        c.hi = c.mid - 1;
        action = 'left';
      } else {
        c.lo = c.mid + 1;
        action = 'right';
      }
      if (c.state === 'active' && c.lo > c.hi) {
        c.state = 'absent';
        action = 'empty';
      }
      results.push({ row: c.key, action, lo: c.lo, hi: c.hi, foundAt: c.foundAt });

      // 방금 버린 절반이 답을 품고 있었는가 — 줄마다 처음 한 번만 알린다.
      if (c.state !== 'found' && c.answerInWindow) {
        const stillIn = c.answerAt >= c.lo && c.answerAt <= c.hi;
        if (!stillIn) {
          c.answerInWindow = false;
          lost.push({ row: c.key, index: c.answerAt });
        }
      }
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'settle', payload: { results } });

    for (const l of lost) {
      if (!(await gate())) return;
      await ctx.emit({ type: 'answer-lost', payload: l });
    }
  }

  const verdicts = cursors.map((c) => ({
    row: c.key,
    found: c.state === 'found',
    index: c.state === 'found' ? c.foundAt : c.answerAt,
  }));
  if (!(await gate())) return;
  await ctx.emit({ type: 'done', payload: { verdicts } });
}
