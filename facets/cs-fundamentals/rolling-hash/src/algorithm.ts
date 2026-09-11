/**
 * 굴러가는 해시 (rolling hash) — 조각.
 *
 * 답하는 질문: **창을 밀 때 해시를 처음부터 다시 셈하지 않는 법.**
 * 창이 한 칸 갈 때마다 네 글자를 다시 보지 않는다. 빠지는 것 하나와 들어오는 것
 * 하나만 만지면 그 값이 다음 값이 된다.
 *
 * ── 셈법
 *   글자값   a=1 … z=26
 *   첫 창    h = ((((c0)·base + c1)·base + c2)·base + c3) mod mod
 *   구르기   h ← (h − val(빠지는 글자)·base^(m-1)) mod mod
 *            h ← (h·base + val(들어오는 글자)) mod mod
 *
 * ── 이벤트 (전부 step boundary. silent 없음)
 *   pattern-hash  { pattern: string; hash: number }
 *                 찾는 조각의 해시를 셈해 화면 위쪽 기준 자리에 올린다.
 *   window-init   { start: number; hash: number; match: boolean }
 *                 첫 창. 창 안의 글자를 모두 읽어 처음부터 셈한다.
 *   window-roll   { start: number; outIndex: number; outLetter: string; outTerm: number;
 *                   inIndex: number; inLetter: string; inValue: number;
 *                   hash: number; match: boolean; wrapped: boolean }
 *                 창이 한 칸 구른다. outTerm 은 빼는 값(val·base^(m-1) mod mod),
 *                 inValue 는 더하는 글자값. wrapped 는 창의 글자가 첫 창과 같아
 *                 해시가 처음 값으로 돌아왔음을 뜻한다.
 *   rewind        payload 없음. 자동 재생 뒤 `advance` 를 받아 처음으로 되감는다.
 *   done          { windows: number; rolls: number }
 *
 * 메트릭은 없다 — 조각은 셀 것이 없으므로 `ctx.metric` 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RollingHashData = {
  type: 'rolling-hash';
  /** 훑을 텍스트. 소문자 a~z. */
  text: string;
  /** 찾는 조각. 창의 너비가 된다. */
  pattern: string;
  /** 자릿수의 밑. */
  base: number;
  /** 법(modulus). */
  mod: number;
  /** 걸음 사이의 정지 시간 (ms). 읽을 시간을 주는 것은 저작 결정이다. */
  stepMs: number;
};

/** 'a' 가 1 이 되도록 하는 기준. */
const LETTER_ORIGIN = 'a'.charCodeAt(0) - 1;

function letterValue(ch: string): number {
  return ch.charCodeAt(0) - LETTER_ORIGIN;
}

/** 처음부터 셈하는 해시 — 첫 창과 찾는 조각에만 쓴다. */
function hashOf(s: string, base: number, mod: number): number {
  let h = 0;
  for (const ch of s) h = (h * base + letterValue(ch)) % mod;
  return h;
}

/** 창의 맨 앞 글자에 곱해져 있는 무게 — base^(m-1) mod mod. */
function leadWeight(m: number, base: number, mod: number): number {
  let w = 1;
  for (let i = 0; i < m - 1; i += 1) w = (w * base) % mod;
  return w;
}

export async function rollingHashAlgorithm(
  ctx: FacetContext<RollingHashData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<RollingHashData>;
  const { text, pattern, base, mod, stepMs } = ctx.data;

  const m = pattern.length;
  if (m === 0 || text.length < m) return;

  const weight = leadWeight(m, base, mod);
  const patternHash = hashOf(pattern, base, mod);
  const firstWindow = text.slice(0, m);
  const lastStart = text.length - m;

  /** 자동 재생을 마치고 한 걸음씩 짚는 중인가. */
  let manual = false;
  /** 앞걸음이 있는가 — 첫 걸음 앞에는 기다릴 것이 없으므로 문을 지나지 않는다. */
  let hasPrevStep = false;

  /** 걸음과 걸음 **사이**의 문. 자동일 때는 쉬고, 수동일 때는 `advance` 를 기다린다. */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (!hasPrevStep) {
      hasPrevStep = true;
      return true;
    }
    if (!manual) return rc.sleep(stepMs);
    for (;;) {
      let input;
      try {
        input = await rc.waitForInput();
      } catch (err) {
        // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
        // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
        if (!ctx.cancelled) throw err;
        return false;
      }
      // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 걸음으로 세지 않도록.
      if (input.type === 'advance') return true;
    }
  }

  /** 한 회차 — 조각의 해시 → 첫 창 → 구르기 → 총평. 끝까지 갔으면 true. */
  async function runPass(): Promise<boolean> {
    if (!(await gate())) return false;
    await ctx.emit({
      type: 'pattern-hash',
      payload: { pattern, hash: patternHash },
    });

    let hash = hashOf(firstWindow, base, mod);
    if (!(await gate())) return false;
    await ctx.emit({
      type: 'window-init',
      payload: {
        start: 0,
        hash,
        match: hash === patternHash,
      },
    });

    let rolls = 0;
    for (let start = 1; start <= lastStart; start += 1) {
      const outIndex = start - 1;
      const inIndex = start + m - 1;
      const outLetter = text.charAt(outIndex);
      const inLetter = text.charAt(inIndex);
      // 앞을 빼고
      const outTerm = (letterValue(outLetter) * weight) % mod;
      hash = ((hash - outTerm) % mod + mod) % mod;
      // 뒤를 더한다
      const inValue = letterValue(inLetter);
      hash = (hash * base + inValue) % mod;
      rolls += 1;

      if (!(await gate())) return false;
      await ctx.emit({
        type: 'window-roll',
        payload: {
          start,
          outIndex,
          outLetter,
          outTerm,
          inIndex,
          inLetter,
          inValue,
          hash,
          match: hash === patternHash,
          wrapped: text.slice(start, start + m) === firstWindow,
        },
      });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done', payload: { windows: lastStart + 1, rolls } });
    return true;
  }

  for (;;) {
    if (!(await runPass())) return;

    // 자동 재생이 끝났다. 여기서부터는 `advance` 가 있어야 움직인다.
    for (;;) {
      let input;
      try {
        input = await rc.waitForInput();
      } catch (err) {
        // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
        // 그 밖의 오류는 그대로 올려 러너가 드러내게 둔다.
        if (!ctx.cancelled) throw err;
        return;
      }
      if (input.type === 'advance') break;
    }

    await ctx.emit({ type: 'rewind' });
    manual = true;
    // 되감은 직후의 첫 걸음은 문을 지나지 않는다 — 첫 누름이 되감기만 하고
    // 멈추면 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    hasPrevStep = false;
  }
}
