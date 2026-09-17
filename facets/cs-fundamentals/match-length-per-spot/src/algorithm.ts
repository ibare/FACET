/**
 * matchLengthPerSpot — 자리마다 "맨 앞과 얼마나 겹치는가" 를 셈한다.
 *
 * 조각(piece). 답하는 질문은 하나다 —
 * **이미 본 구간 안에 있는 자리는 왜 글자를 다시 견주지 않아도 되는가.**
 *
 * 셈하는 동안 지금까지 찾은 것 중 가장 오른쪽까지 닿는 겹침 구간 [left, right]
 * 를 들고 다닌다. 그 구간 안은 이미 맨 앞과 같다고 확인된 자리이므로, 구간
 * 시작점을 축으로 비춘 왼쪽 자리의 답을 그대로 가져오면 된다.
 *
 * ── 이벤트 어휘 (facet 고유. 전부 걸음의 경계이므로 silent 는 하나도 없다)
 *
 *   whole-prefix  payload 없음
 *       맨 앞 자리. 문자열 전체가 곧 맨 앞과의 겹침이라 길이를 그대로 놓는다.
 *       그 길이는 장면이 바탕 문자열에서 잰다 — 화면의 칸 수와 한 출처가 된다.
 *
 *   mirror        { from: number; value: number; capped: boolean }
 *       구간 안이라 거울 자리 from 의 답을 빌려 온다. value 는 실제로 빌린 만큼 —
 *       구간 끝을 넘는 몫은 빌리지 않으므로 from 의 답보다 작을 수 있다.
 *       capped 가 참이면 빌린 만큼이 구간 끝에 딱 닿아, 그 너머를 이어서 견줘야
 *       한다. 이 갈래가 없으면 답이 틀리므로 걸음이 내리는 판정으로 싣는다.
 *
 *   scan          { value: number }
 *       실제로 글자를 견줬고 value 글자가 같았다. 어디서부터 견줬는지는 장면이
 *       바로 앞 mirror 에서 알고, 어긋나 멈췄는지는 index + value 가 문자열 끝에
 *       닿았는지로 안다 — 둘 다 싣지 않는다.
 *
 *   window        payload 없음
 *       겹침이 여태보다 오른쪽에 닿아 구간을 그리로 옮긴다. 새 구간의 양 끝은
 *       방금 답이 찬 자리와 그 값에서 나오므로 장면이 셈한다.
 *
 *   rewind        payload 없음
 *       자동 재생을 마친 뒤 손으로 짚어 보려고 처음으로 되감는다.
 *
 *   done          payload 없음
 *       자리마다 답이 다 찼다.
 *
 * ── 메트릭
 *
 *   없다. 조각은 셀 것이 없으므로 ctx.metric 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MatchLengthPerSpotData = {
  type: 'match-length-per-spot';
  /** 답을 구할 문자열. 화면의 칸도 이것이 정한다. */
  text: string;
  /** 걸음 사이의 정지 시간(ms). 애니메이션이 끝난 뒤부터 잰다. */
  stepMs: number;
};

export async function matchLengthPerSpotAlgorithm(
  base: FacetContext<MatchLengthPerSpotData>,
): Promise<void> {
  const ctx = base as ReactiveContext<MatchLengthPerSpotData>;
  const text = typeof ctx.data.text === 'string' ? ctx.data.text : '';
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : 900;
  const n = text.length;
  if (n === 0) return;

  /** 자동 재생을 마쳤는가. 그 뒤로는 advance 한 번에 한 걸음씩 간다. */
  let manual = false;
  /** 다음 문을 그냥 통과시킨다 — 마운트 직후와 되감기 직후의 첫 걸음. */
  let freePass = true;

  /**
   * 걸음 사이의 문. 첫 걸음 앞에는 기다릴 앞걸음이 없으므로 지나지 않는다
   * (문을 먼저 두면 stepMs 만큼 빈 화면이 먼저 보인다).
   *
   * @returns 계속 가도 되면 true, 취소됐으면 false.
   */
  const gate = async (): Promise<boolean> => {
    if (freePass) {
      freePass = false;
      return true;
    }
    if (!manual) return ctx.sleep(stepMs);
    for (;;) {
      const input = await ctx.waitForInput();
      if (ctx.cancelled) return false;
      // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 걸음으로 세지 않도록.
      if (input.type === 'advance') return true;
    }
  };

  /** 한 회차를 처음부터 끝까지 재생한다. 취소되면 false. */
  const run = async (): Promise<boolean> => {
    const value: number[] = new Array<number>(n).fill(0);

    value[0] = n;
    if (!(await gate())) return false;
    await ctx.emit({ type: 'whole-prefix' });
    if (ctx.cancelled) return false;

    // 아직 겹침 구간이 없다 — right 가 left 보다 작으면 빈 구간이다.
    let left = 0;
    let right = -1;

    for (let i = 1; i < n; i += 1) {
      const inside = i <= right;
      const limit = inside ? right - i + 1 : 0;
      let k = 0;

      if (inside) {
        const from = i - left;
        // 구간 끝을 넘는 만큼은 빌리지 않는다.
        k = Math.min(limit, value[from]);
        // 빌린 만큼이 구간 끝에 딱 닿았나. 닿았으면 그 너머는 확인된 적이 없어
        // 이어서 글자를 견줘야 한다 — 이 갈래가 없으면 틀린 답을 낸다.
        const capped = k >= limit;
        if (!(await gate())) return false;
        await ctx.emit({ type: 'mirror', payload: { from, value: k, capped } });
        if (ctx.cancelled) return false;
      }

      // 구간 안은 이미 확인된 자리다. 빌린 것이 구간 끝에 닿았을 때만
      // 그 너머를 실제로 견준다.
      if (!inside || k >= limit) {
        let m = k;
        while (i + m < n && text[m] === text[i + m]) m += 1;
        if (!(await gate())) return false;
        await ctx.emit({ type: 'scan', payload: { value: m } });
        if (ctx.cancelled) return false;
        k = m;
      }

      value[i] = k;

      if (k > 0 && i + k - 1 > right) {
        left = i;
        right = i + k - 1;
        if (!(await gate())) return false;
        await ctx.emit({ type: 'window' });
        if (ctx.cancelled) return false;
      }
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done' });
    return !ctx.cancelled;
  };

  for (;;) {
    if (!(await run())) return;

    // 자동 재생이 끝났다. 여기서부터는 누르는 만큼만 간다.
    const input = await ctx.waitForInput();
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;

    // 처음 누르는 advance 는 되감고 첫 걸음까지 보인다 — 되감기만 하고 멈추면
    // 눌러도 반응이 없는 것으로 읽힌다.
    manual = true;
    freePass = true;
    await ctx.emit({ type: 'rewind' });
    if (ctx.cancelled) return;
  }
}
