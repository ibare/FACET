/**
 * cannot-unset — 이미 채워진 블룸 필터에서 하나를 지우려 드는 장면.
 *
 * 넣는 장면은 이 조각의 일이 아니다. 시작 비트열과 각 값의 두 해시는 선언이 주고,
 * 각 값이 밟고 선 자리는 **장면이** 거기서 이중 해싱으로 센다 —
 * `h_i = (h1 + i·h2) mod m`.
 *
 * ── 걸음은 수를 싣지 않는다
 *
 * 밟는 자리 · 있다고 답할 값 · 꺼질 자리 · 끄고 난 비트열 · 함께 밟던 칸 · 발밑을
 * 잃은 값 · 없다고 답할 값. 옛 발신은 이 일곱을 payload 로 실어 보냈고, 화면은
 * 같은 것을 구조에서 셀 수 있으면서도 그것을 받아 그렸다. 수와 그림이 **두 출처**가
 * 되어 언젠가 갈릴 자리였다.
 *
 * 지금은 전부 `scene.ts` 가 `initialData` 에서 한 번에 센다. 그러니 이 algorithm 이
 * 하는 일은 논증의 순서를 밟아 걸음의 경계를 긋는 것뿐이고, **payload 는 전부
 * 비어 있다.**
 *
 * ── 이벤트 (전부 facet 고유 확장, silent 아님, payload 없음)
 *
 *   stand     {}  세 값이 저마다 세 칸을 밟고 선다.
 *   verify    {}  지우기 전에 물으면 모두 "있다" 로 답한다.
 *   select    {}  지울 값을 집어 들고 그 자리에 표식을 단다.
 *   clear     {}  그 자리를 끈다.
 *   collapse  {}  발밑을 잃은 값이 주저앉고 지워진 값은 가라앉는다.
 *   verdict   {}  다시 물으면 아무도 지우지 않은 값이 "없다" 로 답한다.
 *   done      {}  마무리 캡션만.
 *   rewind    {}  처음 화면으로 되감는다. 자동 재생이 끝난 뒤 첫 `advance` 에서만 온다.
 *
 * 메트릭은 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type CannotUnsetWord = {
  word: string;
  /** Java `String.hashCode` 를 `& 0x7FFFFFFF` 한 값. */
  h1: number;
  /** FNV-1a 32bit 를 `& 0x7FFFFFFF` 한 뒤 홀수로 만든 값. */
  h2: number;
};

export type CannotUnsetData = {
  type: 'cannot-unset';
  /** 비트 배열 길이. 장면이 나머지 연산의 제수로 쓴다. */
  m: number;
  /** 값 하나가 켜는 칸의 수. */
  k: number;
  /** 시작 비트열. 이미 words 전부가 들어가 있는 상태다. */
  bits: string;
  words: CannotUnsetWord[];
  /** 지우려 드는 값. */
  erase: string;
  /** 걸음 사이의 정지 시간. */
  stepMs: number;
};

export async function cannotUnsetAlgorithm(
  ctx: FacetContext<CannotUnsetData>,
): Promise<void> {
  const rx = ctx as ReactiveContext<CannotUnsetData>;
  const data = ctx.data;

  // 지울 값이 실제로 들어 있지 않으면 할 말이 없다. 발신 여부를 가르는 유일한 셈이다.
  if (!data.words.some((w) => w.word === data.erase)) return;

  let firstOfPass = true;
  let manual = false;

  /**
   * 걸음 사이. 한 회차의 첫 걸음은 여기를 그냥 지난다 — 문을 먼저 두면 마운트
   * 직후 stepMs 만큼 빈 화면이 보이고, 되감은 직후에는 눌러도 반응이 없는 것으로
   * 읽힌다 (S-piece).
   */
  async function gate(): Promise<boolean> {
    if (firstOfPass) {
      firstOfPass = false;
      return true;
    }
    if (!manual) return rx.sleep(data.stepMs);
    for (;;) {
      const input = await rx.waitForInput();
      if (input.type !== 'advance') continue;
      return true;
    }
  }

  async function pass(): Promise<void> {
    firstOfPass = true;

    if (!(await gate())) return;
    await ctx.emit({ type: 'stand', payload: {} });

    if (!(await gate())) return;
    await ctx.emit({ type: 'verify', payload: {} });

    if (!(await gate())) return;
    await ctx.emit({ type: 'select', payload: {} });

    if (!(await gate())) return;
    await ctx.emit({ type: 'clear', payload: {} });

    if (!(await gate())) return;
    await ctx.emit({ type: 'collapse', payload: {} });

    if (!(await gate())) return;
    await ctx.emit({ type: 'verdict', payload: {} });

    if (!(await gate())) return;
    await ctx.emit({ type: 'done', payload: {} });
  }

  await pass();

  // 자동 재생이 끝난 뒤. 처음 누르는 advance 는 되감고 첫 걸음까지 보인다.
  for (;;) {
    const input = await rx.waitForInput();
    if (input.type !== 'advance') continue;
    manual = true;
    await ctx.emit({ type: 'rewind', payload: {} });
    await pass();
    if (ctx.cancelled) return;
  }
}
