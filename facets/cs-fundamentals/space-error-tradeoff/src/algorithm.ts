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
 * 두 해시와 자리와 표의 값은 **전부 여기서 셈한다.** 화면에 뜨는 수는 이 셈의
 * 결과이지 어딘가 적어 둔 값이 아니다 (S-piece "화면에 쓰는 값은 실측한다").
 *
 * **읽히는 값은 여기서 셈하지 않는다.** 그것은 "그 키가 앉은 칸들 중 가장 작은 것"
 * 이고 그 칸들은 화면에 그려져 있다. 장면이 `slots` 로 그 칸을 찾아 직접 읽으므로
 * (`scene.ts` 의 `estimatesOf`) 막대의 높이와 표의 값이 갈릴 자리가 없다. 부푼 양 ·
 * 정확히 맞은 수 · 칸 수 · 센 항목 수도 모두 거기서 파생되는 셈이라 싣지 않는다.
 *
 * ── 이벤트 목록 + payload 스키마 ─────────────────────────────────────────
 *
 *   stage-begin   { counts: number[][]; slots: number[][] }
 *                 silent: 아니다. 표가 새 폭으로 갈라지고 스트림이 칸에 담긴다.
 *                 counts 는 depth × width 의 최종 칸 값 — 표의 꼴이 이 행렬이다.
 *                 slots[k][r] 은 키 k 가 줄 r 에서 앉는 칸.
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

export async function spaceErrorTradeoffAlgorithm(
  ctx: FacetContext<SpaceErrorTradeoffData>,
): Promise<void> {
  const rx = ctx as ReactiveContext<SpaceErrorTradeoffData>;
  const { keys, repeats, depth, widths, stepMs } = ctx.data;

  const h1 = keys.map(hash1);
  const h2 = keys.map(hash2);

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
    for (const width of widths) {
      // 키가 줄마다 앉는 칸. 표를 채우는 것도 되읽는 것도 이 한 자리에서 나온다.
      const slots = keys.map((_key, k) => {
        const rows: number[] = [];
        for (let r = 0; r < depth; r += 1) rows.push(slotOf(h1[k], h2[k], r, width));
        return rows;
      });

      const counts: number[][] = [];
      for (let r = 0; r < depth; r += 1) counts.push(new Array<number>(width).fill(0));
      for (let k = 0; k < keys.length; k += 1) {
        for (let r = 0; r < depth; r += 1) counts[r][slots[k][r]] += repeats;
      }

      if (!(await gate())) return false;
      await ctx.emit({ type: 'stage-begin', payload: { counts, slots } });

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
