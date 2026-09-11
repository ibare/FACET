/**
 * cannot-unset — 이미 채워진 블룸 필터에서 하나를 지우려 드는 장면.
 *
 * 넣는 장면은 이 조각의 일이 아니다. 시작 비트열은 선언이 주고, 각 값이 밟고 선
 * 자리는 여기서 이중 해싱으로 직접 셈한다 — `h_i = (h1 + i·h2) mod m`.
 *
 * ── 이벤트 (전부 facet 고유 확장, silent 아님)
 *
 *   stand     { words: { word: string; slots: number[] }[] }
 *             세 값이 저마다 세 칸을 밟고 선다.
 *   verify    { words: string[] }
 *             지우기 전에 물었을 때 "있다" 로 답하는 값.
 *   select    { word: string; slots: number[] }
 *             지울 값과 그 값이 켜 둔 자리.
 *   clear     { slots: number[]; bits: string }
 *             끄는 자리와 끄고 난 뒤의 비트열. `bits` 는 캡션이 쓴다.
 *   collapse  { removed: string; broken: string[]; shared: number[] }
 *             지워진 값 · 발밑이 무너진 값 · 함께 밟고 있던 자리.
 *   verdict   { absent: string[] }
 *             다시 물었을 때 "없다" 로 답하는 값 (지운 것은 빼고 센다).
 *   done      {}
 *             마무리 캡션만. 화면은 바뀌지 않는다.
 *   rewind    {}
 *             처음 화면으로 되감는다. 자동 재생이 끝난 뒤 첫 `advance` 에서만 온다.
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
  /** 비트 배열 길이. */
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

/** 이중 해싱 — `h_i = (h1 + i·h2) mod m`. 같은 자리가 두 번 나와도 그대로 둔다. */
function slotsOf(w: CannotUnsetWord, m: number, k: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < k; i += 1) out.push((w.h1 + i * w.h2) % m);
  return out;
}

/** 모든 자리가 켜져 있어야 "있다" 다. 한 자리라도 0 이면 없다고 답한다. */
function present(slots: number[], bits: number[]): boolean {
  return slots.every((s) => bits[s] === 1);
}

export async function cannotUnsetAlgorithm(
  ctx: FacetContext<CannotUnsetData>,
): Promise<void> {
  const rx = ctx as ReactiveContext<CannotUnsetData>;
  const data = ctx.data;
  const m = data.m;
  const bits = [...data.bits].map((ch) => (ch === '1' ? 1 : 0));

  const rows = data.words.map((w) => ({ word: w.word, slots: slotsOf(w, m, data.k) }));
  const target = rows.find((r) => r.word === data.erase);
  if (!target) return;

  const standing = rows.filter((r) => present(r.slots, bits)).map((r) => r.word);

  // 끄는 자리 — 같은 값이 한 칸을 두 번 셈했으면 한 번만 끈다.
  const cleared = [...new Set(target.slots)];
  const after = [...bits];
  for (const s of cleared) after[s] = 0;
  const bitsAfter = after.join('');

  // 걸음 함수 안에서 쓸 값은 여기서 꺼내 둔다 — 닫힘 안에서는 위의 좁히기가 풀린다.
  const erasedWord = target.word;
  const erasedSlots = target.slots;

  const others = rows.filter((r) => r.word !== erasedWord);
  // 끈 자리 중 남이 함께 밟고 있던 것.
  const shared = cleared.filter((s) => others.some((r) => r.slots.includes(s)));
  // 발판을 하나라도 잃은 값.
  const broken = others.filter((r) => r.slots.some((s) => cleared.includes(s))).map((r) => r.word);
  // 다시 물었을 때 없다고 답하는 값.
  const absent = others.filter((r) => !present(r.slots, after)).map((r) => r.word);

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
    await ctx.emit({ type: 'stand', payload: { words: rows } });

    if (!(await gate())) return;
    await ctx.emit({ type: 'verify', payload: { words: standing } });

    if (!(await gate())) return;
    await ctx.emit({ type: 'select', payload: { word: erasedWord, slots: erasedSlots } });

    if (!(await gate())) return;
    await ctx.emit({ type: 'clear', payload: { slots: cleared, bits: bitsAfter } });

    if (!(await gate())) return;
    await ctx.emit({ type: 'collapse', payload: { removed: erasedWord, broken, shared } });

    if (!(await gate())) return;
    await ctx.emit({ type: 'verdict', payload: { absent } });

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
