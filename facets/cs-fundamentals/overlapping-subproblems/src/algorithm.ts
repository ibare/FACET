/**
 * facet:overlappingSubproblems — 중복 부분 문제 (조각).
 *
 * 재귀 정의를 곧이곧대로 펼치면 같은 이름이 다른 가지에서 자꾸 다시 돋는다.
 * `fib(n) = fib(n-1) + fib(n-2)` 를 호출 순서(전위) 그대로 한 번에 하나씩
 * 발신하고, 그 이름이 몇 번째로 나타났는지는 **장면이 센다.**
 *
 * ── 발신은 payload 를 하나도 싣지 않는다
 *
 * 펼친 나무는 `n` 하나에 순수 함수를 먹이면 나오는 것이라 (`expandFibCalls`),
 * 싣는 대신 **함수를 내주고 장면이 같은 것을 부른다.** 싣는 순간 같은 수가 두
 * 자리에서 셈해지는 문이 열리고, 그 문이 곧 화면과 발신이 갈리는 길이다.
 *
 * 차례도 싣지 않는다 — 발신이 오는 순서가 이미 그것을 말한다. `sprout` 이
 * 몇 번째로 왔는가가 곧 호출 목록의 몇 번째인가이고, 거기서 그 항이 이번이
 * 몇 번째 등장인지도 나온다.
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
 * | type     | silent | payload |
 * |----------|--------|---------|
 * | `sprout` | false  | 없음. target `node:<id>` |
 * | `done`   | false  | 없음 |
 * | `rewind` | false  | 없음 |
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

/** 펼쳐진 호출 하나. 목록에서의 차례가 곧 호출 차례다. */
export type FibCall = {
  id: string;
  n: number;
  depth: number;
  parentId: string | null;
  /** 그 항의 답. 뿌리의 값이 곧 이 조각이 얻어 내는 수다. */
  value: number;
};

/**
 * 선언의 `n` 을 읽는다.
 *
 * 알고리즘과 장면이 **같은 함수로** 읽는다 — 좁히는 규칙이 두 벌이면 화면의
 * 나무와 발신의 걸음 수가 언젠가 갈린다.
 */
export function readTermCount(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.max(0, Math.trunc(raw)) : 5;
}

function expandInto(n: number, depth: number, parentId: string | null, out: FibCall[]): number {
  const node: FibCall = { id: `c${out.length}`, n, depth, parentId, value: n };
  out.push(node);
  if (n <= 1) return node.value;
  const left = expandInto(n - 1, depth + 1, node.id, out);
  const right = expandInto(n - 2, depth + 1, node.id, out);
  node.value = left + right;
  return node.value;
}

/**
 * `fib(n) = fib(n-1) + fib(n-2)` 를 정의 그대로 펼친다.
 *
 * 전위 순서로 밀어 넣으므로 목록의 차례가 곧 호출 차례이고, 되돌아오는 값이
 * 곧 그 항의 답이다. 걸음표를 손으로 적지 않고 정의가 순서를 정한다 (S-piece).
 *
 * `n` 하나만 보는 순수 함수라 장면이 불러도 같은 답이 나온다. 그래서 이 조각은
 * 나무를 발신에 싣지 않는다.
 */
export function expandFibCalls(n: number): FibCall[] {
  const out: FibCall[] = [];
  expandInto(n, 0, null, out);
  return out;
}

export async function overlappingSubproblems(
  ctxIn: FacetContext<OverlappingSubproblemsData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<OverlappingSubproblemsData>;
  const n = readTermCount(ctx.data.n);
  const rawStep = ctx.data.stepMs;
  const stepMs =
    typeof rawStep === 'number' && Number.isFinite(rawStep) ? Math.max(80, rawStep) : 600;

  const calls = expandFibCalls(n);

  const sprout = async (i: number): Promise<void> => {
    const c = calls[i];
    if (!c) return;
    await ctx.emit({ type: 'sprout', target: `node:${c.id}` });
  };

  const finish = async (): Promise<void> => {
    await ctx.emit({ type: 'done' });
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
