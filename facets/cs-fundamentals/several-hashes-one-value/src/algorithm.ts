/**
 * severalHashesOneValue — 한 값이 해시 수만큼의 자리를 켠다.
 *
 * 블룸 필터에 값을 넣는 일만 보인다. 질의도 지우기도 이 조각의 일이 아니다.
 *
 * 자리는 이중 해싱으로 셈한다 — `h_i = (h1 + i·h2) mod m`, i = 0 … k-1.
 *   h1  Java `String.hashCode` 를 `& 0x7FFFFFFF`
 *   h2  FNV-1a 32bit 를 `& 0x7FFFFFFF` 한 뒤 홀수로 (`| 1`)
 * h2 를 홀수로 만드는 까닭은 짝수면 여러 i 가 같은 칸을 짚기 때문이다.
 *
 * ── 이벤트 (전부 facet 고유. silent 없음 — 모두 걸음의 경계다)
 *
 * 발신에는 **장면이 구조에서 셀 수 있는 수를 싣지 않는다.** 실으면 그 수와 화면의
 * 구조가 다른 출처가 되어 언젠가 갈린다. 남는 것은 해시 셈의 결과 셋뿐이다.
 *
 *   key-enters      { h1: number; h2: number }
 *       넣을 값이 자기 줄에 앉는다. 바탕 해시 둘이 함께 선다.
 *       줄 번호도 값도 싣지 않는다 — 줄은 올 때마다 하나씩 쌓이므로 장면이 세고,
 *       값은 선언의 `keys` 가 쥔다.
 *
 *   branches-split  { slots: number[] }
 *       한 값이 갈래 k 로 갈라져 각자 다른 칸으로 간다. `slots` 는 갈래가 짚은
 *       자리(짚은 순서) — 정렬하지 않는다. 갈래 수 k 는 그 길이다.
 *       이미 1 이던 자리를 싣지 않는다 — 앞 줄들이 켠 자리라 장면이 이미 안다.
 *
 *   slot-shared     { slot: number }
 *       두 값이 한 칸을 함께 쓴다. 비트는 1 에서 1 로 갈 뿐이다. 어느 칸인지는
 *       셈이 아니라 이 판정의 결과라 실어 보낸다.
 *
 *   done            {}
 *       다 넣었다. 켜진 자리 수도 배열 길이도 싣지 않는다 — 앞의 것은 켠 자리
 *       목록이 세고 뒤의 것은 선언의 `bitCount` 가 정한다.
 *
 *   rewind          {}
 *       처음으로 되감는다. 자동 재생이 끝난 뒤 한 걸음을 누르면 나온다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SeveralHashesOneValueData = {
  type: 'several-hashes-one-value';
  /** 비트 배열 길이 m. */
  bitCount: number;
  /** 해시 수 k — 한 값이 켜는 자리의 수. */
  hashCount: number;
  /** 넣을 값들. 넣는 순서 그대로. */
  keys: string[];
  /** 걸음 사이의 쉼. 애니메이션이 끝난 뒤의 정지 시간이다 (S-piece). */
  stepMs: number;
};

/** Java `String.hashCode` — h = 31h + c 를 32bit 로 감아 누산. */
function javaHashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

/** FNV-1a 32bit. */
function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export type KeyHashes = {
  h1: number;
  h2: number;
  /** 갈래가 짚은 자리. 짚은 순서 그대로 — 정렬하지 않는다. */
  slots: number[];
};

/** 한 값의 바탕 해시 둘과 그것이 켜는 자리 k 개. */
export function hashesOf(key: string, bitCount: number, hashCount: number): KeyHashes {
  const h1 = javaHashCode(key) & 0x7fffffff;
  const h2 = (fnv1a32(key) & 0x7fffffff) | 1;
  const slots: number[] = [];
  for (let i = 0; i < hashCount; i += 1) slots.push((h1 + i * h2) % bitCount);
  return { h1, h2, slots };
}

export async function severalHashesOneValueAlgorithm(
  ctx: FacetContext<SeveralHashesOneValueData>,
): Promise<void> {
  const rc = ctx as ReactiveContext<SeveralHashesOneValueData>;
  const { bitCount, hashCount, keys, stepMs } = ctx.data;

  /** 한 걸음씩 짚는 중인가. 자동 재생을 마친 뒤부터 참이 된다. */
  let gated = false;
  /**
   * 다음 문 하나를 그냥 통과시킨다.
   *
   * 문은 걸음 *사이*의 것이라 첫 걸음 앞에는 기다릴 앞걸음이 없다. 마운트
   * 직후에 문을 두면 stepMs 만큼 빈 화면이 보이고, 되감기 직후에 두면 첫
   * 누름이 되감기만 하고 멈춘 것처럼 읽힌다 (S-piece).
   */
  let passOnce = true;

  const gate = async (): Promise<boolean> => {
    if (passOnce) {
      passOnce = false;
      return !rc.cancelled;
    }
    if (!gated) return rc.sleep(stepMs);
    for (;;) {
      if (rc.cancelled) return false;
      // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 걸음으로 세지 않게.
      if ((await rc.waitForInput()).type !== 'advance') continue;
      return !rc.cancelled;
    }
  };

  for (;;) {
    const bits = new Array<number>(bitCount).fill(0);

    // 줄 번호를 싣지 않게 되면서 셀 것도 없어졌다 — 값만 순서대로 집는다.
    for (const key of keys) {
      const { h1, h2, slots } = hashesOf(key, bitCount, hashCount);

      if (!(await gate())) return;
      await ctx.emit({ type: 'key-enters', payload: { h1, h2 } });

      /*
       * 갈래가 내려앉기 전에 이미 1 이던 자리를 먼저 가려 둔다. 이것은 화면의
       * 표식이 아니라 **함께 쓰는 칸을 하나씩 가리켜 보일 걸음의 목록**이다 —
       * 표식 쪽은 장면이 켠 자리 목록에서 낸다.
       */
      const shared = slots.filter((slot) => bits[slot] === 1);
      for (const slot of slots) bits[slot] = 1;

      if (!(await gate())) return;
      await ctx.emit({ type: 'branches-split', payload: { slots } });

      for (const slot of shared) {
        if (!(await gate())) return;
        await ctx.emit({ type: 'slot-shared', payload: { slot } });
      }
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'done' });

    // 자동 재생이 끝났다. 여기서부터는 한 걸음씩 짚는다.
    for (;;) {
      if (rc.cancelled) return;
      if ((await rc.waitForInput()).type === 'advance') break;
    }
    gated = true;
    passOnce = true;
    await ctx.emit({ type: 'rewind' });
  }
}
