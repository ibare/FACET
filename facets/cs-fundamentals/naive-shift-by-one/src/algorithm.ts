/**
 * naive-shift-by-one — 패턴을 앞에서부터 견주다 어긋나면 한 칸 민다.
 *
 * 조각(piece). 한 질문에만 답한다 — 어긋났을 때 여태 맞힌 것을 통째로 버리고
 * 한 칸만 미는 것이 얼마나 아까운가.
 *
 * ── 이벤트 (전부 이 facet 고유 어휘. `done` 만 표준. silent 는 없다)
 *
 *   align    { shift: number }
 *            패턴을 자리 `shift` 에 놓는다. 첫 자리가 아니면 한 칸 미끄러진다.
 *
 *   compare  { shift: number; offset: number; hit: boolean }
 *            패턴의 `offset` 번째 글자를 텍스트의 `shift + offset` 번째와 견줬다.
 *            `hit` 이 거짓이면 이 자리는 거기서 끝난다.
 *
 *   retreat  { shift: number; matched: number; comparisons: number }
 *            어긋나서 도로 물러난다. `matched` 는 버리게 된 글자 수 (0 일 수 있다).
 *
 *   found    { shift: number; comparisons: number }
 *            패턴이 통째로 맞았다. 여기서 멈추지 않고 남은 자리도 마저 훑는다.
 *
 *   rewind   {}
 *            처음으로 되감는다. 자동 재생이 끝난 뒤 `advance` 를 받았을 때만 나간다.
 *
 *   done     { comparisons: number }
 *            더 밀 자리가 없다. `comparisons` 는 처음부터 여기까지 견준 횟수.
 *
 * ── 셈
 *
 * 맞은 글자 수와 견준 횟수는 이 파일이 직접 센다. 선언에 적어 두고 읽어 오는
 * 것이 아니다. `ctx.metric` 은 부르지 않는다 — 조각은 계기를 두지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type NaiveShiftByOneData = {
  type: string;
  /** 패턴을 찾아 넣을 텍스트. */
  text: string;
  /** 찾을 패턴. */
  pattern: string;
  /** 걸음 사이에 쉬는 시간 (S-piece). */
  stepMs: number;
};

/** 선언이 `stepMs` 를 빠뜨렸을 때의 기본값. */
const FALLBACK_STEP_MS = 700;

/**
 * 걸음 사이의 문.
 *
 * 자동 재생이면 `stepMs` 만큼 쉬고, 손으로 짚어 보는 중이면 `advance` 를 기다린다.
 * **첫 걸음은 이 문을 지나지 않는다** — 문은 걸음 *사이*의 것이라 첫 걸음 앞에는
 * 기다릴 앞걸음이 없고, 문을 먼저 두면 `stepMs` 만큼 빈 화면이 보인다 (S-piece).
 */
async function gate(
  ctx: ReactiveContext<NaiveShiftByOneData>,
  auto: boolean,
  stepMs: number,
): Promise<boolean> {
  if (auto) return ctx.sleep(stepMs);
  for (;;) {
    if (ctx.cancelled) return false;
    let input: ReactiveInputEvent;
    try {
      input = await ctx.waitForInput();
    } catch (err) {
      // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
      // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
      if (!ctx.cancelled) throw err;
      return false;
    }
    // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 그것을 걸음으로 세지 않게.
    if (input.type !== 'advance') continue;
    return true;
  }
}

/** 자리 0 부터 끝까지 한 번 훑는다. */
async function sweep(
  ctx: ReactiveContext<NaiveShiftByOneData>,
  auto: boolean,
): Promise<void> {
  const text = ctx.data.text;
  const pattern = ctx.data.pattern;
  const stepMs = ctx.data.stepMs > 0 ? ctx.data.stepMs : FALLBACK_STEP_MS;
  const m = pattern.length;
  if (m === 0 || text.length < m) return;

  let comparisons = 0;
  let first = true;

  for (let shift = 0; shift + m <= text.length; shift += 1) {
    if (!first && !(await gate(ctx, auto, stepMs))) return;
    first = false;
    if (ctx.cancelled) return;

    await ctx.emit({ type: 'align', payload: { shift } });

    // 앞에서부터 한 글자씩. 어긋나는 순간 멈춘다 — 뒤는 보지도 않는다.
    let matched = 0;
    for (let offset = 0; offset < m; offset += 1) {
      const hit = text[shift + offset] === pattern[offset];
      comparisons += 1;
      await ctx.emit({ type: 'compare', payload: { shift, offset, hit } });
      if (!hit) break;
      matched += 1;
    }

    if (matched === m) {
      await ctx.emit({ type: 'found', payload: { shift, comparisons } });
    } else {
      // 여기까지 맞힌 `matched` 글자를 통째로 버리고 한 칸만 민다.
      await ctx.emit({ type: 'retreat', payload: { shift, matched, comparisons } });
    }
    if (ctx.cancelled) return;
  }

  await ctx.emit({ type: 'done', payload: { comparisons } });
}

/**
 * 마운트하면 스스로 한 번 훑고(reactive), 그 뒤로는 `advance` 를 기다린다.
 *
 * 자동 재생이 끝난 뒤 처음 누르는 `advance` 는 **되감고 첫 걸음까지** 간다 —
 * 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
 */
export async function naiveShiftByOneAlgorithm(
  ctxIn: FacetContext<NaiveShiftByOneData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<NaiveShiftByOneData>;

  await sweep(ctx, true);

  for (;;) {
    if (ctx.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await ctx.waitForInput();
    } catch (err) {
      // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
      // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
      if (!ctx.cancelled) throw err;
      return;
    }
    if (input.type !== 'advance') continue;
    await ctx.emit({ type: 'rewind' });
    // 되감은 직후의 첫 걸음도 문을 지나지 않는다 (sweep 의 `first`).
    await sweep(ctx, false);
  }
}
