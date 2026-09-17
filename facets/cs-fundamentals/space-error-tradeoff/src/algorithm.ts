/**
 * space-error-tradeoff — Count-Min Sketch 를 얼마나 크게 잡을 것인가.
 *
 * 같은 스트림을 폭만 바꿔 세 번 센다. 깊이는 3 으로 고정하고 폭은 2 · 4 · 8 로
 * 넓혀 간다. 칸이 적을수록 서로 다른 키가 같은 칸을 나눠 쓰게 되고, 나눠 쓴 칸은
 * 남의 셈까지 이고 있으므로 읽힌 값이 참값보다 커진다. 값은 부풀 수는 있어도
 * 모자랄 수는 없다 — 그래서 자리를 아끼는 값은 언제나 한쪽으로만 치우친 오차다.
 *
 * 자리는 이중 해싱이다.
 *
 *     자리_r = (h1 + r·h2) mod w        r = 0 … depth-1
 *
 *   h1  Java `String.hashCode` 를 `& 0x7FFFFFFF`
 *   h2  FNV-1a 32bit 를 `& 0x7FFFFFFF` 한 뒤 `| 1` 로 홀수화
 *
 * ── 셈은 함수로 내주고, 발신은 차례만 말한다
 *
 * 폭이 정해지면 **표의 모든 것이 결정된다.** 어느 키가 어느 칸에 앉을지는 해시가
 * 정하고, 그 칸에 얼마가 얹힐지는 반복 횟수가 정한다. 스트림의 순서도 상관이 없다
 * (더하기라 어느 차례로 얹어도 같은 표가 된다). 걸음이 내리는 판정이 하나도 없다는
 * 뜻이므로, 표를 payload 로 실어 보내지 않고 **셈하는 함수를 내주어 장면이 부르게
 * 한다** (`widthsOf` · `slotsFor` · `countsFor`, 프로토콜 4 절의 B 갈래).
 *
 * 그래서 발신은 넷 다 payload 가 비어 있다. 실어 보내면 출처가 갈리지는 않아도
 * **다음 사람이 집어 쓸 문**이 열린 채로 남는다 — 그 문이 "두 자리에서 세기" 가
 * 들어오는 길이다.
 *
 * 읽히는 값 · 부푼 양 · 정확히 맞은 수 · 칸 수 · 센 항목 수는 그 표와 키 목록에서
 * 파생되는 셈이라 장면이 직접 센다 (`scene.ts` 의 `estimatesOf` · `overshootOf`).
 * 어느 쪽이든 화면에 뜨는 수는 지어낸 것이 아니라 이 파일의 셈을 지난 값이다
 * (S-piece "화면에 쓰는 값은 실측한다").
 *
 * ── 이벤트 목록 + payload 스키마 ─────────────────────────────────────────
 *
 *   stage-begin   payload 없음
 *                 silent: 아니다. 표가 다음 폭으로 갈라지고 스트림이 칸에 담긴다.
 *                 몇 번째 폭인가는 이 발신이 온 차례가 말하고, 그 폭이 무엇인가는
 *                 `widthsOf(initialData.widths)` 가 말한다.
 *
 *   reads-taken   payload 없음
 *                 silent: 아니다. 키를 모두 되읽어 막대가 새 높이로 옮겨 간다.
 *                 읽힌 값은 방금 선 표에서 나오므로 실어 올 것이 없다.
 *
 *   done          payload 없음
 *                 silent: 아니다. 가장 좁을 때와 가장 넓을 때의 부푼 양을 나란히 둔다.
 *                 견줌의 양 끝은 첫 폭과 마지막 폭이고 둘 다 장면이 쥐고 있다.
 *
 *   rewind        payload 없음
 *                 silent: 아니다. 자동 재생이 끝난 뒤 첫 advance 에서 처음으로 되돌린다.
 *
 * 메트릭은 없다 — 조각은 셀 것이 없으므로 `ctx.metric` 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type SpaceErrorTradeoffData = {
  type: 'space-error-tradeoff';
  /** 스트림에 등장하는 키. 각각 repeats 번씩 흐른다. */
  keys: string[];
  /** 키 하나가 흐르는 횟수 = 그 키의 참값. */
  repeats: number;
  /** 표의 줄 수 (해시 함수의 수). 세 폭 내내 고정이다. */
  depth: number;
  /** 견줘 볼 폭. 이 순서대로 표가 갈라진다. */
  widths: number[];
  /** 걸음 사이의 정지 시간 (S-piece). */
  stepMs: number;
};

/** Java `String.hashCode` 를 부호 없는 31bit 로. */
function hash1(key: string): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
  return h & 0x7fffffff;
}

/** FNV-1a 32bit 를 부호 없는 31bit 홀수로. 이중 해싱의 걸음폭이라 홀수여야 한다. */
function hash2(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return (h & 0x7fffffff) | 1;
}

/** `(h1 + r·h2) mod w`. 합이 2^53 아래라 배정도로 정확하다. */
function slotOf(h1: number, h2: number, row: number, width: number): number {
  return (h1 + row * h2) % width;
}

/**
 * 견줘 볼 폭을 1 이상의 정수로 좁힌다 — **자르는 잣대의 정본.**
 *
 * 폭의 개수가 곧 걸음 수이고, 몇 번째 걸음이 어느 폭인가도 이 목록이 정한다.
 * 이 파일과 장면이 같은 함수를 부르므로 걸음 수와 화면의 폭이 갈릴 수 없다.
 */
export function widthsOf(widths: readonly number[]): number[] {
  return widths.map((w) => Math.trunc(w)).filter((w) => Number.isFinite(w) && w > 0);
}

/**
 * 키가 줄마다 앉는 칸 — `slots[k][r]`.
 *
 * **장면도 이 함수를 부른다.** 화면에 그려지는 칸과 셈이 얹히는 칸이 같은 자리라야
 * 하므로 규칙을 두 벌로 두지 않고 여기 하나만 둔다 (프로토콜 4 절의 B 갈래).
 */
export function slotsFor(keys: readonly string[], depth: number, width: number): number[][] {
  if (width <= 0) return keys.map(() => []);
  return keys.map((key) => {
    const h1 = hash1(key);
    const h2 = hash2(key);
    const rows: number[] = [];
    for (let r = 0; r < depth; r += 1) rows.push(slotOf(h1, h2, r, width));
    return rows;
  });
}

/**
 * 그 폭에서 스트림을 다 센 표 — `counts[r][c]`.
 *
 * 키 하나는 줄마다 한 칸을 골라 제 셈을 통째로 얹는다. 더하기라 어느 차례로
 * 얹어도 같은 표가 되므로, 이 표는 걸음이 내리는 판정이 아니라 **바탕에서
 * 결정되는 셈**이다. 그래서 싣지 않고 내준다.
 */
export function countsFor(
  keys: readonly string[],
  repeats: number,
  depth: number,
  width: number,
): number[][] {
  const slots = slotsFor(keys, depth, width);
  const counts: number[][] = [];
  for (let r = 0; r < depth; r += 1) counts.push(new Array<number>(Math.max(0, width)).fill(0));
  for (let k = 0; k < keys.length; k += 1) {
    for (let r = 0; r < depth; r += 1) {
      const col = slots[k][r];
      if (col !== undefined) counts[r][col] += repeats;
    }
  }
  return counts;
}

export async function spaceErrorTradeoffAlgorithm(
  ctx: FacetContext<SpaceErrorTradeoffData>,
): Promise<void> {
  const rx = ctx as ReactiveContext<SpaceErrorTradeoffData>;
  const { widths, stepMs } = ctx.data;

  /**
   * 걸어갈 폭들. 이 목록의 길이가 곧 걸음 수다.
   *
   * 표를 여기서 세지 않는 것은 셀 것이 없어서가 아니라 **셈이 전부 결정되어 있어서**다.
   * 화면이 같은 함수(`countsFor`)를 불러 세므로 지어낸 수가 화면에 뜰 길은 없다.
   */
  const stages = widthsOf(widths);

  /** 자동 재생을 마쳤는가. 마친 뒤로는 걸음마다 advance 를 기다린다. */
  let manual = false;
  /**
   * 이번 문은 그냥 지나간다.
   *
   * 마운트 직후의 첫 걸음 앞에는 기다릴 앞걸음이 없고, 되감은 직후의 첫 걸음은
   * 그 누름 하나로 함께 보여야 한다 (S-piece).
   */
  let freeGate = true;

  async function nextAdvance(): Promise<boolean> {
    for (;;) {
      if (ctx.cancelled) return false;
      let input: ReactiveInputEvent;
      try {
        input = await rx.waitForInput();
      } catch {
        // reset / destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6·C8).
        return false;
      }
      if (ctx.cancelled) return false;
      // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 걸음으로 세지 않게 (S-piece).
      if (input.type !== 'advance') continue;
      return true;
    }
  }

  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    if (freeGate) {
      freeGate = false;
      return true;
    }
    if (!manual) return await rx.sleep(stepMs);
    return await nextAdvance();
  }

  async function pass(): Promise<boolean> {
    // 폭 하나가 두 걸음이다 — 표가 갈라지고, 키를 되읽는다.
    for (let i = 0; i < stages.length; i += 1) {
      if (!(await gate())) return false;
      await ctx.emit({ type: 'stage-begin' });

      if (!(await gate())) return false;
      await ctx.emit({ type: 'reads-taken' });
    }

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done' });
    return true;
  }

  if (!(await pass())) return;

  // 자동 재생이 끝났다. 이제부터 advance 한 번이 되감기 + 첫 걸음이고,
  // 그 뒤로는 한 번에 한 걸음이다.
  for (;;) {
    if (!(await nextAdvance())) return;
    await ctx.emit({ type: 'rewind' });
    manual = true;
    freeGate = true;
    if (!(await pass())) return;
  }
}
