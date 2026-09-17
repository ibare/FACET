/**
 * 끝나지 않는 소수 — 0.1 을 2진 소수로 뽑아내는 조각(piece).
 *
 * 2 를 곱해 정수부를 떼어 내는 일을 되풀이하면 자리가 하나씩 나온다. 남은 값이
 * 앞에 나온 적 있는 값과 같아지는 순간 무늬가 닫히고, 그 뒤로는 같은 자리 묶음이
 * 끝없이 되돌아온다. 그릇(float32)이 차면 거기서 잘린다.
 *
 * ── 셈은 정수 분수로 한다
 *
 * `0.1 * 2` 를 `number` 로 되풀이하면 오차가 쌓여 되풀이 판정이 어긋난다. 남은
 * 값은 언제나 **분자/분모**(정수 둘)로 들고 다니며, `×2` 는 분자에 2 를 곱한 뒤
 * 분모로 나눈 몫을 떼는 것이다. 그래야 "같은 값이 다시 나왔다" 를 정수 비교로
 * 정확히 잡는다.
 *
 * 부동소수점이 등장하는 자리는 `float32Expansion` 하나뿐이고, 그것은 셈이
 * 아니라 **재는** 일이다 — 그릇에 실제로 담긴 값이 무엇인지 비트에서 읽는다.
 *
 * ── 이벤트 어휘 (C2)
 *
 *   seed          {}
 *                 첫 남은 값을 첫 자리에 놓는다. 그 값이 무엇인지는 분자·분모가
 *                 이미 말하므로 싣지 않는다.
 *   peel          { digit: number; rest: number }
 *                 2 를 곱해 자리 하나를 뽑는다. 떼어 낸 자리와 남은 값의 분자다.
 *                 **이 둘이 이 조각의 셈 그 자체라 싣는다** — 장면이 다시 셈하면
 *                 같은 점화가 두 곳에 적힌다. 어느 자리에서 어느 자리로 갔는지는
 *                 장면이 제 표에서 찾는다 (같은 분자가 앉은 자리가 곧 되돌아온 곳).
 *   repeat-found  {}
 *                 남은 값이 앞의 것과 같아졌다. 고리의 두 끝은 장면이 표에서 찾는다.
 *   lap           {}
 *                 고리를 다시 돈다. 몇 자리가 나오는지는 **몇 번째 바퀴인가**로
 *                 정해지고 그것은 발신이 쌓인 수라 장면이 센다.
 *   cut           {}
 *                 그릇이 찼다. 어디서 잘리고 어느 자리가 올림으로 바뀌는지는
 *                 장면이 `float32Expansion` 으로 재어 자취와 견준다.
 *   done          {}
 *                 마무리.
 *   rewind        {}
 *                 되감기. 한 걸음씩 짚어 보기 전에 화면을 처음으로 돌린다.
 *
 * silent 이벤트는 두지 않는다 — 모든 걸음이 화면을 바꾼다.
 *
 * 화면에 뜨는 문안은 여기서 만들지 않는다. algorithm 은 값만 싣고 문장은 stage 가
 * `t` 로 짓는다 (C10).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type UnrepresentableFractionData = {
  type: string;
  /** 뽑아낼 분수의 분자. 정수로 두는 까닭은 위 머리말 참조. */
  numerator: number;
  /** 분모. 0.1 은 1/10 이다. */
  denominator: number;
  /** 걸음 사이의 정지 시간 (S-piece). */
  stepMs: number;
};

const DEFAULT_STEP_MS = 650;

/** 그릇 너머로 몇 자리를 더 뽑아 둘지 — 잘리는 것이 보이려면 넘치는 꼬리가 있어야 한다. */
const TAIL_BEYOND_VESSEL = 2;

/**
 * 정수 분수를 10진 문자열로 옮긴다.
 *
 * 화면의 "0.8 × 2 = 1.6" 은 전부 이 함수를 거친다. `num / den` 을 그대로 찍으면
 * 부동소수점 표기가 새어 나오므로, 몫과 나머지를 정수로만 다룬다.
 *
 * **표기는 셈이 아니다.** 이 조각이 말하려는 것은 "2 를 곱해 자리를 뽑으면
 * 되풀이한다" 이고, 그 함수를 떼어 내도 그 말은 그대로 남는다. 그래서 내주고
 * 장면이 부른다 (프로토콜 4 절 잣대표의 가운데 줄).
 */
export function fractionDecimalText(num: number, den: number): string {
  const whole = Math.floor(num / den);
  let rest = num - whole * den;
  if (rest === 0) return String(whole);
  const digits: string[] = [];
  // 1/10 은 한 자리에서 끝난다. 끝나지 않는 분모가 들어와도 멎도록 상한을 둔다.
  for (let i = 0; i < 6 && rest !== 0; i += 1) {
    rest *= 10;
    const d = Math.floor(rest / den);
    digits.push(String(d));
    rest -= d * den;
  }
  return `${whole}.${digits.join('')}`;
}

/**
 * float32 가 실제로 담은 값의 2진 소수 전개.
 *
 * 그릇의 크기(몇 자리에서 잘리는가)와 올림으로 바뀌는 자리는 **재서** 나온다.
 * 앞머리만 실측하고 뒤를 채우는 일이 없도록, 비트를 그대로 읽어 전개를 세운다
 * (S-piece "화면에 쓰는 값은 실측한다").
 *
 * 이것도 셈이 아니라 재는 일이라 내준다. 걸음이 `keep` · `flipAt` · `flipTo` 를
 * 실어 보내면 그릇 선이 서는 자리와 올림되는 자리가 **띠에 쌓인 자리들과 다른
 * 출처**가 된다. 장면이 이 함수를 부르고 제 자취와 견주면 한 출처가 된다
 * (프로토콜 4 절 "조각의 결론이 상수로 박혀 있을 수 있다").
 *
 * 0 과 1 사이의 정상수(normal number) 만 다룬다. 그 밖은 빈 문자열.
 */
export function float32Expansion(x: number): string {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, x);
  const bits = view.getUint32(0).toString(2).padStart(32, '0');
  const exponent = parseInt(bits.slice(1, 9), 2) - 127;
  const mantissa = bits.slice(9);
  if (exponent >= 0 || exponent < -30) return '';
  // 값 = 1.mantissa × 2^exponent → 소수부는 0 을 (-exponent-1) 개 깔고 앞선 1, 그 뒤 mantissa.
  const expansion = '0'.repeat(-exponent - 1) + '1' + mantissa;
  const trimmed = expansion.replace(/0+$/, '');
  return trimmed === '' ? expansion : trimmed;
}

export async function unrepresentableFraction(
  ctx: FacetContext<UnrepresentableFractionData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<UnrepresentableFractionData>;

  const den = Math.max(2, Math.trunc(ctx.data.denominator));
  const start = Math.max(0, Math.trunc(ctx.data.numerator));
  const stepMs =
    typeof ctx.data.stepMs === 'number' && ctx.data.stepMs > 0
      ? ctx.data.stepMs
      : DEFAULT_STEP_MS;

  // 그릇에 담기는 자리 수. 어디까지 뽑아 둘지를 정하는 데만 쓴다 — 어디서 잘리는지를
  // 화면에 말하는 것은 장면의 몫이다.
  const keep = float32Expansion(start / den).length;

  /** 자동 재생이 끝난 뒤 한 걸음씩 짚는 중인가. */
  let manual = false;
  /** 첫 걸음 앞에는 기다릴 앞걸음이 없다 (S-piece). 되감기 직후에도 다시 연다. */
  let openGate = true;

  /**
   * 걸음 사이의 문.
   *
   * 자동 재생 중에는 `stepMs` 만큼 쉬고, 한 걸음씩 짚는 중에는 `advance` 를
   * 기다린다. 받은 것의 종류를 보는 까닭은 위젯 입력이 붙는 날 걸음으로
   * 세이지 않게 하기 위함이다 (S-piece).
   */
  async function pause(): Promise<boolean> {
    if (openGate) {
      openGate = false;
      return !ctx.cancelled;
    }
    if (manual) {
      for (;;) {
        const input = await rc.waitForInput();
        if (ctx.cancelled) return false;
        if (input.type === 'advance') return true;
      }
    }
    return rc.sleep(stepMs);
  }

  /** 한 판. 취소되면 false 를 돌려주고 즉시 손을 뗀다. */
  async function run(): Promise<boolean> {
    /** 뽑아낸 자리들. 걸음표를 손으로 적지 않고 셈에서 나온 것을 쌓는다 (C2). */
    const digits: number[] = [];
    /** 남은 값(분자) → 그 값이 놓인 자리 번호. 되풀이는 이 표에서 드러난다. */
    const slotOf = new Map<number, number>([[start, 0]]);

    let rest = start;
    let slots = 1;
    let loopTo = -1;

    if (!(await pause())) return false;
    await ctx.emit({ type: 'seed' });

    // ── 자리를 하나씩 뽑는다. 남은 값이 앞에 나온 것과 같아지면 멈춘다.
    while (loopTo < 0) {
      const product = rest * 2;
      const digit = Math.floor(product / den);
      const next = product - digit * den;
      const known = slotOf.get(next);

      if (!(await pause())) return false;
      await ctx.emit({ type: 'peel', payload: { digit, rest: next } });
      digits.push(digit);

      if (known === undefined) {
        slotOf.set(next, slots);
        slots += 1;
      } else {
        loopTo = known;
      }
      rest = next;

      // 남은 값이 0 이면 딱 떨어지는 분수라 되풀이가 없다. 그때는 여기서 끝난다.
      if (rest === 0) break;
    }

    if (loopTo < 0) {
      if (!(await pause())) return false;
      await ctx.emit({ type: 'done' });
      return true;
    }

    // ── 되풀이를 알아차린 순간. 고리가 닫힌다.
    if (!(await pause())) return false;
    await ctx.emit({ type: 'repeat-found' });

    // ── 같은 무늬가 되돌아온다. 돌수록 한 걸음에 더 많이 나온다.
    const pattern = digits.slice(loopTo);
    const target = keep + TAIL_BEYOND_VESSEL;
    for (let laps = 1; pattern.length > 0 && digits.length < target; laps += 1) {
      if (!(await pause())) return false;
      await ctx.emit({ type: 'lap' });
      for (let i = 0; i < laps; i += 1) for (const d of pattern) digits.push(d);
    }

    // ── 그릇이 찼다. 넘은 자리는 잘리고, 마지막 자리는 올림으로 바뀐다.
    if (keep > 0 && digits.length > keep) {
      if (!(await pause())) return false;
      await ctx.emit({ type: 'cut' });
    }

    if (!(await pause())) return false;
    await ctx.emit({ type: 'done' });
    return true;
  }

  if (!(await run())) return;

  // 자동 재생은 끝났다. 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 짚게 한다.
  for (;;) {
    const input = await rc.waitForInput();
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;

    manual = true;
    // 되감기 직후의 첫 문은 그냥 통과시킨다 — 첫 누름이 되감기만 하고 멎으면
    // 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
    openGate = true;
    await ctx.emit({ type: 'rewind' });
    if (!(await run())) return;
    manual = false;
  }
}
