/**
 * prefix-suffix-jump — 패턴이 제 몸을 접어 자기와 겹치는 자리를 찾고,
 * 텍스트에서 어긋나면 겹친 만큼만 민다.
 *
 * 표(겹침 길이)를 세우는 일이 중심이고, 텍스트에서 찾는 장면은 그 표가 무엇을
 * 아끼는지 보이는 만큼만 쓴다.
 *
 * ── 식별자
 * 쓰지 않는다. 어디에 무엇을 놓을지는 stage 가 셈하므로 payload 는 글자 자리(수)로만
 * 말한다.
 *
 * ── 이벤트 (전부 이 facet 고유 확장. silent 없음 — 모두 시각 변화가 있다)
 *
 * **차례는 발신이 오는 순서가 이미 말한다.** 몇 번째 자리를 보고 있나, 패턴이 지금
 * 어느 칸에 놓여 있나, 앞 몇 글자를 물려받았나 — 전부 장면이 세므로 싣지 않는다.
 * 싣는 것은 걸음이 내리는 판정뿐이다 (프로토콜 4 절의 잣대 표).
 *
 *   prefix-focus    payload 없음
 *       다음 자리를 보기 시작한다. 그 자리는 표에 이미 찬 칸 수가 말한다.
 *
 *   overlap-try     { border: number; matched: boolean }
 *       복제를 오른쪽으로 밀어 겹침 길이 `border` 를 견주었다. `matched` 는 맨 앞
 *       `border` 글자와 맨 뒤 `border` 글자가 같은가 — **이 걸음의 판정**이라 싣는다.
 *       `border` 0 은 끝까지 민 자리로, 겹칠 것이 없다.
 *
 *   fail-set        payload 없음
 *       지금 자리의 값이 정해져 표로 떨어진다. 그 값은 방금 맞은 시험의 `border`
 *       라 장면이 제 자취에서 읽는다 — 같은 수를 두 자리에 적지 않는다.
 *
 *   scan-align      { matched: number }
 *       패턴을 지금 자리에 두고 이어 견주어 `matched` 글자가 맞았다. 어디까지
 *       맞았다고 볼 것인가가 이 걸음의 판정이다. 어긋난 자리는 `matched` 이고,
 *       `matched` 가 패턴 길이면 통째로 맞은 것이다.
 *
 *   borrow-overlap  payload 없음
 *       맞은 부분의 끝 몇 글자가 그 앞 몇 글자와 같다 — 그 수는 **장면이 세운 표**
 *       에서 온다. 표가 화면에 이미 서 있으므로 다시 실어 보내지 않는다.
 *
 *   jump            { to: number }
 *       패턴을 `to` 칸으로 민다. 어디에 내려 놓을 것인가가 이 걸음의 판정이다.
 *       떠나온 자리 · 물려받는 글자 수 · 건너뛴 자리는 장면이 셈한다.
 *
 *   found           payload 없음
 *       패턴이 통째로 맞았다. 그 자리는 장면이 쥔 정렬 칸이다.
 *
 *   rewind          payload 없음
 *       처음 상태로 되돌린다. 자동 재생이 끝난 뒤 첫 `advance` 에서 한 번.
 *
 * ── 메트릭
 * 없다. 조각은 셀 것이 없으므로 `ctx.metric` 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PrefixSuffixJumpData = {
  type: 'prefix-suffix-jump';
  /** 찾을 패턴. */
  pattern: string;
  /** 그것을 찾을 텍스트. */
  text: string;
  /** 걸음 사이의 정지 시간 (S-piece). */
  stepMs: number;
};

export async function prefixSuffixJumpAlgorithm(
  ctxIn: FacetContext<PrefixSuffixJumpData>,
): Promise<void> {
  // reactive 메커니즘이 주입하는 확장 컨텍스트 (context.ts 의 규약).
  const ctx = ctxIn as ReactiveContext<PrefixSuffixJumpData>;
  const { pattern, text, stepMs } = ctx.data;
  const m = pattern.length;
  const n = text.length;

  /** 자동 재생을 마쳤는가 — 그 뒤로는 `advance` 가 걸음을 준다. */
  let manual = false;
  /**
   * 그냥 통과시킬 문.
   *
   * 마운트 직후 첫 걸음 앞에는 기다릴 앞걸음이 없고, 되감은 직후의 첫 문도
   * 마찬가지다 — 되감기만 하고 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
   */
  let freeGate = true;

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false (C8). */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (freeGate) {
      freeGate = false;
      return true;
    }
    if (!manual) return ctx.sleep(stepMs);
    for (;;) {
      if (ctx.cancelled) return false;
      const input = await ctx.waitForInput();
      if (input.type !== 'advance') continue;
      return !ctx.cancelled;
    }
  }

  /** 한 바퀴 — 표를 세우고, 그 표로 텍스트를 훑는다. 취소되면 false. */
  async function play(): Promise<boolean> {
    // ── 표 세우기. 자리마다 "맨 앞에서 시작하는 조각과 맨 뒤에서 끝나는 조각이
    //    같아지는 가장 긴 길이" 를 정의 그대로 셈한다.
    const fail: number[] = [];
    for (let i = 0; i < m; i += 1) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'prefix-focus' });

      let value = 0;
      for (let border = i; border >= 0; border -= 1) {
        // 이 루프에는 문이 없다 — 복제를 한 칸씩 밀어 보는 것이 곧 이 걸음의
        // 뜻이라 그 사이를 끊으면 한 자리를 정하는 일이 토막 난다 (C8).
        if (ctx.cancelled) return false;
        const matched =
          border === 0 ||
          pattern.slice(0, border) === pattern.slice(i + 1 - border, i + 1);
        await ctx.emit({ type: 'overlap-try', payload: { border, matched } });
        if (matched) {
          value = border;
          break;
        }
      }
      fail.push(value);
      await ctx.emit({ type: 'fail-set' });
    }

    // ── 표가 섰다. 이제 그 표가 텍스트에서 무엇을 아끼는지 본다.
    let start = 0;
    /** 앞 몇 글자를 이미 맞은 것으로 치고 시작하는가. */
    let keep = 0;
    while (start + m <= n) {
      if (!(await gate())) return false;

      // 맞는 데까지 이어 센다. 발신 없는 순수 셈이라 문을 둘 자리가 아니다.
      let k = keep;
      while (k < m && text[start + k] === pattern[k]) k += 1;
      await ctx.emit({ type: 'scan-align', payload: { matched: k } });
      if (k === m) {
        await ctx.emit({ type: 'found' });
        return true;
      }

      if (!(await gate())) return false;
      if (k === 0) {
        // 맞은 것이 없으면 빌릴 겹침도 없다.
        await ctx.emit({ type: 'jump', payload: { to: start + 1 } });
        start += 1;
        keep = 0;
        continue;
      }

      const border = fail[k - 1] ?? 0;
      await ctx.emit({ type: 'borrow-overlap' });
      const shift = k - border;
      await ctx.emit({ type: 'jump', payload: { to: start + shift } });
      start += shift;
      keep = border;
    }
    return true;
  }

  try {
    for (;;) {
      if (!(await play())) return;
      // 자동 재생이 끝났다. 다음 `advance` 에서 되감고 첫 걸음까지 간다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (input.type === 'advance') break;
      }
      if (ctx.cancelled) return;
      manual = true;
      freeGate = true;
      await ctx.emit({ type: 'rewind' });
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
    if (!ctx.cancelled) throw err;
  }
}
