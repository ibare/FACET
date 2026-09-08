/**
 * arrayAsTreeAlgorithm — 배열 번호로 나무의 부모/자식 자리를 셈해 건너간다.
 *
 * 자리 `i` 의 왼쪽 자식은 `2i+1`, 오른쪽 자식은 `2i+2`, 부모는 `⌊(i−1)/2⌋`.
 * 잇는 줄(포인터)을 하나도 저장하지 않고, 이 셈만으로 오간다. 아홉 걸음을
 * 자동으로 재생한 뒤 멈추고, `advance` 로 처음부터 한 걸음씩 다시 짚어 볼 수
 * 있다 (S-piece).
 *
 * ── 이벤트 어휘 (C2 확장) ─────────────────────────────────────────────
 *
 * `jump`
 *   커서가 인덱스 A → 인덱스 B 로 자리를 옮긴다 (배열 칸과 나무 자리를 동시에).
 *   target: `index:${toIndex}`
 *   payload: {
 *     toIndex: number;
 *     textKey: string;                          // 캡션 키. projector 가 해석.
 *     vars: Record<string, string | number>;     // 캡션 플레이스홀더 값.
 *     rewind?: boolean;                          // true 면 화면을 비운 뒤 보인다.
 *   }
 *
 * `leaf-miss`
 *   자식 번호를 셈했더니 칸 수를 넘어 자식이 없음을 보인다 — 그 자리는 잎이다.
 *   target: `index:${atIndex}`
 *   payload: {
 *     atIndex: number;
 *     leftIndex: number;   // 2·atIndex+1, 칸 밖.
 *     rightIndex: number;  // 2·atIndex+2, 칸 밖.
 *     textKey: string;
 *     vars: Record<string, string | number>;
 *   }
 *
 * `conclude`
 *   걸음을 마치며 잇는 줄을 하나도 쓰지 않았다는 사실을 밝힌다.
 *   payload: {
 *     textKey: string;
 *     vars: Record<string, string | number>;
 *   }
 *
 * 셋 다 화면 변화가 있는 step 이므로 `silent` 를 붙이지 않는다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type ArrayAsTreeData = {
  type: string;
  values: number[];
  stepMs: number;
};

const parentOf = (i: number): number => Math.floor((i - 1) / 2);
const leftOf = (i: number): number => 2 * i + 1;
const rightOf = (i: number): number => 2 * i + 2;

export async function arrayAsTreeAlgorithm(ctx: FacetContext<ArrayAsTreeData>): Promise<void> {
  const reactive = ctx as ReactiveContext<ArrayAsTreeData>;
  const { values, stepMs } = ctx.data;
  const n = values.length;

  async function jump(
    toIndex: number,
    textKey: string,
    vars: Record<string, string | number>,
    rewind = false,
  ): Promise<void> {
    if (ctx.cancelled) return;
    await ctx.emit({
      type: 'jump',
      target: `index:${toIndex}`,
      payload: { toIndex, textKey, vars, rewind },
    });
  }

  async function leafMiss(
    atIndex: number,
    leftIndex: number,
    rightIndex: number,
    textKey: string,
    vars: Record<string, string | number>,
  ): Promise<void> {
    if (ctx.cancelled) return;
    await ctx.emit({
      type: 'leaf-miss',
      target: `index:${atIndex}`,
      payload: { atIndex, leftIndex, rightIndex, textKey, vars },
    });
  }

  async function conclude(
    textKey: string,
    vars: Record<string, string | number>,
  ): Promise<void> {
    if (ctx.cancelled) return;
    await ctx.emit({ type: 'conclude', payload: { textKey, vars } });
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return reactive.sleep(stepMs);
  }

  // 걸음의 순서는 논증(뿌리 → 왼쪽으로 두 번 내려가 잎을 확인 → 부모로 올라가
  // 오른쪽으로 한 번 더 → 부모를 두 번 거쳐 뿌리로 복귀)이지만, 오가는 자리
  // 번호는 전부 이 데이터(values, n)에 대해 셈한 실측값이다.
  const i0 = 0;
  const i1 = leftOf(i0);
  const i2 = leftOf(i1);
  const i2L = leftOf(i2);
  const i2R = rightOf(i2);
  const i3 = parentOf(i2);
  const i4 = rightOf(i3);
  const i4L = leftOf(i4);
  const i4R = rightOf(i4);
  const i5 = parentOf(i4);
  const i6 = parentOf(i5);
  const linkCount = 0;
  const hypotheticalLinks = 2 * n;

  const stepZero = (rewind = false): Promise<void> =>
    jump(i0, 'caption.start', { i: i0 }, rewind);

  /**
   * 답사 경로. 이 배열은 사람이 적었다 — 그리고 그것이 맞다.
   *
   * 다른 조각의 걸음표는 연산의 결과다(순회가 나무를 돌고, 재해싱이 키를 돈다).
   * 여기에는 그런 연산이 없다. 이 조각이 보이는 것은 번호 셈 자체이고, **어느
   * 자리를 어느 순서로 짚어 보일지는 논증이다** — 뿌리에서 왼쪽으로 두 번
   * 내려가 잎을 확인하고, 부모로 올라갔다 오른쪽으로 한 번 더 가 보고, 뿌리로
   * 돌아온다. 데이터에서 도출되는 순서가 아니다.
   *
   * 자리 번호(i0~i6)는 전부 `leftOf` / `rightOf` / `parentOf` 로 실제 셈한
   * 값이고, emit 의 type 은 각 클로저 안에서 리터럴이다 (C2 · S-piece).
   */
  const steps: Array<() => Promise<void>> = [
    () => stepZero(false),
    () => jump(i1, 'caption.descendLeft', { from: i0, to: i1 }),
    () => jump(i2, 'caption.descendLeft', { from: i1, to: i2 }),
    () => leafMiss(i2, i2L, i2R, 'caption.leaf', { at: i2, l: i2L, r: i2R, n }),
    () => jump(i3, 'caption.ascend', { from: i2, to: i3 }),
    () => jump(i4, 'caption.descendRight', { from: i3, to: i4 }),
    () => leafMiss(i4, i4L, i4R, 'caption.leaf', { at: i4, l: i4L, r: i4R, n }),
    () => jump(i5, 'caption.ascend', { from: i4, to: i5 }),
    () => jump(i6, 'caption.root', { from: i5, to: i6 }),
    () => conclude('caption.saved', { n, links: linkCount, hypo: hypotheticalLinks }),
  ];

  // 자동 재생 — 걸음마다 stepMs 만큼 읽을 시간을 준다.
  for (let s = 0; s < steps.length; s += 1) {
    if (ctx.cancelled) return;
    await steps[s]!();
    if (ctx.cancelled) return;
    if (s < steps.length - 1) {
      const ok = await pause();
      if (!ok) return;
    }
  }
  if (ctx.cancelled) return;

  // 재생이 끝난 뒤 advance 로 처음부터 한 걸음씩 다시 짚어 본다. pointer 가
  // 0 이면 항상 먼저 되감고 첫 걸음을 보인다 — 처음 누름과 한 바퀴를 돈 뒤의
  // 다음 누름이 같은 규칙을 따른다 (S-piece).
  //
  // 이 조각은 되감기가 독립 이벤트가 아니라 `jump` 의 `rewind` 플래그다. 그래서
  // `stepZero(true)` 하나가 "화면을 비우고 커서를 뿌리로 되돌리는 일" 까지만
  // 하고 멈춘다 — 커서는 자동 재생이 끝난 자리에서 뿌리로 돌아오지만 그 뒤로
  // 나아가지 않아, 눌러도 걸음이 오지 않은 것으로 읽힌다. 되감은 김에 첫
  // 걸음(왼쪽 자식으로 내려가기)까지 이어 보인다.
  let pointer = 0;
  while (!ctx.cancelled) {
    let input: ReactiveInputEvent;
    try {
      input = await reactive.waitForInput();
    } catch {
      return;
    }
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;

    if (pointer === 0) {
      await stepZero(true);
      if (ctx.cancelled) return;
      await steps[1]!();
      pointer = 2;
      continue;
    }
    await steps[pointer]!();
    pointer += 1;
    if (pointer >= steps.length) pointer = 0;
  }
}
