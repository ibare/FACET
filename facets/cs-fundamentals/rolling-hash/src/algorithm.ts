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
 * ── 무엇을 싣고 무엇을 내주나 (프로토콜 4 절)
 *
 * 창의 차례 · 빠지는 글자와 들어오는 글자의 자리 · 조각과 맞았나 · 한 바퀴 돌아
 * 같은 글자로 왔나 — 이것들은 전부 **바탕과 지나온 창 수에서 나오는 것**이라
 * 싣지 않는다. 장면이 센다.
 *
 * 처음부터 셈하는 해시(`hashOf`)는 **함수로 내주고 장면이 부른다** — 이 조각이
 * 피하려는 셈이므로 내주어도 조각이 말하려는 바가 그대로 남는다.
 *
 * 반대로 굴리는 식 `(h − 빠지는 글자값·밑^(m-1))·밑 + 들어오는 글자값` 은 이
 * 조각의 알고리즘 그 자체라 내주지 않는다. 그 두 항과 결과만 싣는다.
 *
 * ── 이벤트 (전부 step boundary. silent 없음)
 *   pattern-hash  payload 없음. 찾는 조각의 해시가 기준 자리에 오른다.
 *                 값은 `hashOf(pattern, base, mod)` 가 낸다.
 *   window-init   payload 없음. 첫 창은 창 안의 글자를 모두 읽어 처음부터 셈한다.
 *                 값은 `hashOf(text.slice(0, m), base, mod)` 가 낸다.
 *   window-roll   { outTerm: number; inValue: number; hash: number }
 *                 창이 한 칸 구른다. outTerm 은 빼는 값(val·base^(m-1) mod mod),
 *                 inValue 는 더하는 글자값, hash 는 둘을 거쳐 나온 다음 값이다.
 *   rewind        payload 없음. 자동 재생 뒤 `advance` 를 받아 처음으로 되감는다.
 *   done          payload 없음. 창의 수와 구르기 수는 자취에서 세진다.
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

/**
 * 처음부터 셈하는 해시 — 첫 창과 찾는 조각에만 쓴다.
 *
 * **장면도 이 함수를 부른다.** 화면에 뜨는 수와 굴리기의 출발값이 같은 자리에서
 * 나와야 하므로 규칙을 두 벌로 두지 않고 여기 하나만 둔다 (프로토콜 4 절 B 갈래).
 * 이 조각이 *피하려는* 셈이라 내주어도 주장이 그대로 남는다.
 */
export function hashOf(s: string, base: number, mod: number): number {
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
    await ctx.emit({ type: 'pattern-hash' });

    let hash = hashOf(firstWindow, base, mod);
    if (!(await gate())) return false;
    await ctx.emit({ type: 'window-init' });

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

      if (!(await gate())) return false;
      await ctx.emit({
        type: 'window-roll',
        payload: { outTerm, inValue, hash },
      });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done' });
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
