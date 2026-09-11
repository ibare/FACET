/**
 * bad-char-skip — 어긋난 글자가 얼마나 뛸지를 정한다 (조각).
 *
 * 패턴을 오른쪽 끝부터 거꾸로 견주다 어긋나면, 어긋난 그 글자가 패턴 안에서
 * 마지막으로 선 자리(`last`, 없으면 -1)를 보고 `어긋난 자리 - last` 만큼
 * (최소 1) 민다. 패턴에 아예 없는 글자는 겹칠 길이 자체가 없으므로 패턴
 * 길이만큼 통째로 뛴다.
 *
 * ── 식별자
 *   자리는 텍스트의 인덱스(0-based) 그대로 쓴다. target 은 쓰지 않는다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장. silent 인 것은 없다)
 *   scan   { at: number; matched: number; mismatchAt: number | null;
 *            mismatchChar: string | null }
 *          자리 `at` 에 놓고 오른쪽 끝부터 견준 결과. `matched` 는 오른쪽부터
 *          맞은 글자 수, `mismatchAt` 은 어긋난 텍스트 자리이며 전부 맞았으면
 *          null (그때 `mismatchChar` 도 null).
 *   skip   { from: number; to: number; lastIndex: number; badChar: string }
 *          어긋난 글자를 보고 패턴을 `from` 에서 `to` 로 민다. `lastIndex` 는
 *          그 글자가 패턴 안에서 마지막으로 선 자리이며 없으면 -1.
 *   found  { at: number }
 *          패턴이 통째로 맞아떨어진 자리.
 *   rewind {}
 *          자동 재생이 끝난 뒤 처음으로 되감는다. 페이로드 없음.
 *
 * `mismatchChar` / `badChar` 는 화면 문안이 아니라 텍스트의 글자 자체다 —
 * 캡션 문장은 projector 가 키로 고른다 (C10). 메트릭은 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type BadCharSkipData = {
  type: 'bad-char-skip';
  /** 훑을 텍스트. */
  text: string;
  /** 찾을 패턴. */
  pattern: string;
  /** 걸음 사이 정지 시간. 애니메이션이 끝난 뒤부터 잰다 (S-piece). */
  stepMs: number;
};

/** 걸음 사이의 문. true 면 계속 가고, false 면 취소된 것이다. */
type Gate = () => Promise<boolean>;

/**
 * 패턴의 각 글자가 패턴 안에서 마지막으로 선 자리.
 * 손으로 적은 표가 아니라 패턴을 훑어 만든다 — 표를 만드는 일이 곧 이 규칙의 절반이다.
 */
export function buildLastIndex(pattern: string): Map<string, number> {
  const last = new Map<string, number>();
  for (let i = 0; i < pattern.length; i += 1) last.set(pattern[i], i);
  return last;
}

/** `advance` 를 받을 때까지 기다린다. 다른 종류의 입력은 걸음으로 세지 않는다. */
async function waitAdvance(ctx: ReactiveContext<BadCharSkipData>): Promise<boolean> {
  for (;;) {
    let input: { type: string };
    try {
      input = await ctx.waitForInput();
    } catch (err) {
      // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
      // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
      if (!ctx.cancelled) throw err;
      return false;
    }
    if (ctx.cancelled) return false;
    if (input.type === 'advance') return true;
  }
}

/**
 * 텍스트 위를 한 번 훑는다. 걸음 사이마다 `gate` 를 지난다.
 *
 * 첫 걸음만은 문을 지나지 않는다 (S-piece) — 문은 걸음 *사이*의 것이라 첫
 * 걸음 앞에는 기다릴 앞걸음이 없다. 마운트 직후에 빈 화면이 먼저 보이면
 * 조각이 여럿 박힌 글에서 그 빈 화면이 겹친다.
 */
async function walk(ctx: ReactiveContext<BadCharSkipData>, gate: Gate): Promise<boolean> {
  const { text, pattern } = ctx.data;
  const lastIndex = buildLastIndex(pattern);
  let passedFirst = false;

  const pause = async (): Promise<boolean> => {
    if (!passedFirst) {
      passedFirst = true;
      return true;
    }
    return gate();
  };

  let at = 0;
  while (at + pattern.length <= text.length) {
    if (!(await pause())) return false;

    // 오른쪽 끝부터 거꾸로 견준다.
    let j = pattern.length - 1;
    while (j >= 0 && pattern[j] === text[at + j]) j -= 1;

    if (j < 0) {
      await ctx.emit({
        type: 'scan',
        payload: { at, matched: pattern.length, mismatchAt: null, mismatchChar: null },
      });
      if (!(await pause())) return false;
      await ctx.emit({ type: 'found', payload: { at } });
      return true;
    }

    const bad = text[at + j];
    await ctx.emit({
      type: 'scan',
      payload: {
        at,
        matched: pattern.length - 1 - j,
        mismatchAt: at + j,
        mismatchChar: bad,
      },
    });

    const last = lastIndex.get(bad) ?? -1;
    const shift = Math.max(1, j - last);
    if (!(await pause())) return false;
    await ctx.emit({
      type: 'skip',
      payload: { from: at, to: at + shift, lastIndex: last, badChar: bad },
    });
    at += shift;
  }

  return true;
}

export const badCharSkipAlgorithm = async (
  ctx: FacetContext<BadCharSkipData>,
): Promise<void> => {
  // reactive 메커니즘이 주입하는 확장 컨텍스트 (context.ts 의 규약).
  const rctx = ctx as ReactiveContext<BadCharSkipData>;
  const { stepMs } = rctx.data;

  const bySleep: Gate = async () => (await rctx.sleep(stepMs)) && !rctx.cancelled;
  const byInput: Gate = () => waitAdvance(rctx);

  // 1) 마운트하자마자 스스로 한 번 훑는다.
  if (!(await walk(rctx, bySleep))) return;

  // 2) 끝난 뒤에는 곱씹는 사람을 기다린다. 처음 누르는 `advance` 는 되감고
  //    첫 걸음까지 보인다 — 되감기만 하면 눌러도 반응이 없는 것으로 읽힌다.
  for (;;) {
    if (!(await waitAdvance(rctx))) return;
    await rctx.emit({ type: 'rewind' });
    if (!(await walk(rctx, byInput))) return;
  }
};
