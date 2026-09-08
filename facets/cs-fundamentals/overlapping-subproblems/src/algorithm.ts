/**
 * facet:overlappingSubproblems — 중복 부분 문제 (조각).
 *
 * 재귀 정의를 곧이곧대로 펼치면 같은 이름이 다른 가지에서 자꾸 다시 돋는다.
 * `fib(n) = fib(n-1) + fib(n-2)` 를 호출 순서(전위) 그대로 한 번에 하나씩
 * 발신하고, 그 이름이 **몇 번째로 나타났는지**를 함께 실어 보낸다.
 *
 * 세는 값은 전부 펼친 구조에서 나온다. 호출 수 · 서로 다른 항의 개수 ·
 * 가장 많이 풀린 항은 어디에도 적어 두지 않고 `expandCall` 이 만든 호출
 * 목록을 훑어 얻는다 (표로 박지 않는다).
 *
 * ── 진행 모델
 * reactive. mount 즉시 자동으로 전부 펼친 뒤 `waitForInput` 으로 넘어가,
 * `advance` 를 받을 때마다 한 걸음씩 다시 밟는다. 자동 재생이 끝난 뒤 처음
 * 누르는 `advance` 는 되감고 **첫 걸음까지** 보인다 (S-piece).
 *
 * ── 식별자 (C1)
 * `node:<id>` — id 는 호출 순서로 매긴 `c0` … `c14`.
 *
 * ── 이벤트 (C2)
 * | type           | silent | payload |
 * |----------------|--------|---------|
 * | `tree-planned` | true   | `{ nodes: { id: string; n: number; depth: number; parentId: string \| null }[] }` |
 * | `sprout`       | false  | `{ id: string; n: number; ordinal: number; repeat: boolean }` — target `node:<id>` |
 * | `rewind`       | false  | 없음 |
 * | `done`         | false  | `{ calls: number; distinct: number; worstN: number; worstCount: number; value: number }` |
 *
 * `tree-planned` 는 시각 변화가 없는 메타 이벤트다 — stage 가 나무 전체의
 * 자리를 미리 잡아야 걸음마다 가지가 흔들리지 않으므로 첫머리에 한 번 보낸다.
 *
 * ── 메트릭
 * 없다. 조각은 셀 것이 없으므로 `ctx.metric` 을 부르지 않는다 (S-piece / C5).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type OverlappingSubproblemsData = {
  type: 'overlapping-subproblems';
  /** 정의대로 펼칠 항. */
  n: number;
  /** 걸음 사이 간격 (ms). */
  stepMs: number;
};

/** 펼쳐진 호출 하나. `id` 의 순서가 곧 호출 순서다. */
type PlannedCall = {
  id: string;
  n: number;
  depth: number;
  parentId: string | null;
  value: number;
};

/**
 * `fib(n) = fib(n-1) + fib(n-2)` 를 정의 그대로 펼친다.
 *
 * 전위 순서로 밀어 넣으므로 `out` 의 차례가 곧 호출 차례이고, 되돌아오는 값이
 * 곧 그 항의 답이다. 걸음표를 손으로 적지 않고 정의가 순서를 정한다 (S-piece).
 */
function expandCall(
  n: number,
  depth: number,
  parentId: string | null,
  out: PlannedCall[],
): number {
  const node: PlannedCall = { id: `c${out.length}`, n, depth, parentId, value: n };
  out.push(node);
  if (n <= 1) return node.value;
  const left = expandCall(n - 1, depth + 1, node.id, out);
  const right = expandCall(n - 2, depth + 1, node.id, out);
  node.value = left + right;
  return node.value;
}

type CallSummary = {
  calls: number;
  distinct: number;
  worstN: number;
  worstCount: number;
};

/** 펼친 구조를 훑어 센다 — 호출 수, 서로 다른 항, 가장 많이 풀린 항. */
function summarize(calls: PlannedCall[]): CallSummary {
  const counts = new Map<number, number>();
  for (const c of calls) counts.set(c.n, (counts.get(c.n) ?? 0) + 1);
  let worstN = calls[0]?.n ?? 0;
  let worstCount = 0;
  for (const [n, count] of counts) {
    if (count > worstCount || (count === worstCount && n < worstN)) {
      worstN = n;
      worstCount = count;
    }
  }
  return { calls: calls.length, distinct: counts.size, worstN, worstCount };
}

export async function overlappingSubproblems(
  ctxIn: FacetContext<OverlappingSubproblemsData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<OverlappingSubproblemsData>;
  const rawN = ctx.data.n;
  const n = typeof rawN === 'number' && Number.isFinite(rawN) ? Math.max(0, Math.trunc(rawN)) : 5;
  const rawStep = ctx.data.stepMs;
  const stepMs =
    typeof rawStep === 'number' && Number.isFinite(rawStep) ? Math.max(80, rawStep) : 600;

  const calls: PlannedCall[] = [];
  const value = expandCall(n, 0, null, calls);
  const summary = summarize(calls);

  await ctx.emit({
    type: 'tree-planned',
    silent: true,
    payload: {
      nodes: calls.map((c) => ({ id: c.id, n: c.n, depth: c.depth, parentId: c.parentId })),
    },
  });

  /** 이름별로 지금까지 몇 번 나왔는지. 걸음을 밟으며 늘어난다. */
  const seen = new Map<number, number>();

  const sprout = async (i: number): Promise<void> => {
    const c = calls[i];
    if (!c) return;
    const ordinal = (seen.get(c.n) ?? 0) + 1;
    seen.set(c.n, ordinal);
    await ctx.emit({
      type: 'sprout',
      target: `node:${c.id}`,
      payload: { id: c.id, n: c.n, ordinal, repeat: ordinal > 1 },
    });
  };

  const finish = async (): Promise<void> => {
    await ctx.emit({ type: 'done', payload: { ...summary, value } });
  };

  // ── 자동 재생. 정의가 순서를 정하므로 호출 목록을 그대로 밟는다.
  for (let i = 0; i < calls.length; i += 1) {
    if (ctx.cancelled) return;
    await sprout(i);
    if (!(await ctx.sleep(stepMs))) return;
  }
  if (ctx.cancelled) return;
  await finish();

  // ── 한 걸음씩. 곱씹으며 읽고 싶은 사람을 위한 것이지 진행에 필요한 조작이 아니다.
  let cursor = calls.length;
  for (;;) {
    let input: ReactiveInputEvent;
    try {
      input = await ctx.waitForInput();
    } catch {
      return; // reset / destroy
    }
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;

    if (cursor >= calls.length) {
      // 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 — 첫 걸음까지 보인다.
      seen.clear();
      await ctx.emit({ type: 'rewind' });
      await sprout(0);
      cursor = 1;
    } else {
      await sprout(cursor);
      cursor += 1;
    }
    if (cursor >= calls.length) await finish();
  }
}
