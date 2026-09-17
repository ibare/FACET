/**
 * naive-shift-by-one — 패턴을 앞에서부터 견주다 어긋나면 한 칸 민다.
 *
 * 조각(piece). 한 질문에만 답한다 — 어긋났을 때 여태 맞힌 것을 통째로 버리고
 * 한 칸만 미는 것이 얼마나 아까운가.
 *
 * ── 이벤트 (전부 이 facet 고유 어휘. `done` 만 표준. silent 는 없다)
 *
 *   align    {}
 *            패턴을 다음 자리에 놓는다. 첫 자리가 아니면 한 칸 미끄러진다.
 *            **몇 칸 밀렸는지는 싣지 않는다** — 자리는 올 때마다 하나씩 쌓이므로
 *            장면이 쌓아 둔 자리 목록의 길이가 곧 그 수다.
 *
 *   compare  { hit: boolean }
 *            지금 자리에서 앞에서부터 다음 글자를 견줬다. `hit` 이 거짓이면 이
 *            자리는 거기서 끝난다. **몇 번째 글자인지는 싣지 않는다** — 그 자리의
 *            짚은 목록 길이가 곧 그 수다.
 *
 *            `hit` 만은 싣는다. 글자 하나를 견준 결과는 걸음이 내리는 판정이고,
 *            장면이 그것을 다시 셈하면 이 조각의 알고리즘을 통째로 되풀이하는 꼴이
 *            되어 발신이 장식이 된다.
 *
 *   retreat  {}
 *            어긋나서 도로 물러난다. 버리게 된 글자 수는 그 자리의 자취가 말한다.
 *
 *   found    {}
 *            패턴이 통째로 맞았다. 여기서 멈추지 않고 남은 자리도 마저 훑는다.
 *
 *   rewind   {}
 *            처음으로 되감는다. 자동 재생이 끝난 뒤 `advance` 를 받았을 때만 나간다.
 *
 *   done     {}
 *            더 밀 자리가 없다.
 *
 * ── 셈은 여기서 하지 않는다
 *
 * 맞은 글자 수도 견준 횟수도 이 파일이 세지 않는다. 둘 다 화면에 선 자취의
 * **구조에서 세지는 것**이라 (`scene.ts` 의 `matchedOf` · `comparisonsOf`), 여기서
 * 함께 세면 같은 물음에 답이 둘이 되어 언젠가 갈린다. 화면에 뜨는 수와 그림이 같은
 * 자료를 쓰게 하는 것이 이 갈래의 요점이다.
 *
 * `ctx.metric` 도 부르지 않는다 — 조각은 계기를 두지 않는다 (S-piece).
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

  let first = true;

  for (let shift = 0; shift + m <= text.length; shift += 1) {
    if (!first && !(await gate(ctx, auto, stepMs))) return;
    first = false;
    if (ctx.cancelled) return;

    await ctx.emit({ type: 'align' });

    // 앞에서부터 한 글자씩. 어긋나는 순간 멈춘다 — 뒤는 보지도 않는다.
    let broke = false;
    for (let offset = 0; offset < m; offset += 1) {
      const hit = text[shift + offset] === pattern[offset];
      await ctx.emit({ type: 'compare', payload: { hit } });
      if (!hit) {
        broke = true;
        break;
      }
    }

    if (broke) {
      // 여기까지 맞힌 것을 통째로 버리고 한 칸만 민다.
      await ctx.emit({ type: 'retreat' });
    } else {
      await ctx.emit({ type: 'found' });
    }
    if (ctx.cancelled) return;
  }

  await ctx.emit({ type: 'done' });
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
