/**
 * 자리값과 진법 — 한 수가 켜진 자리들의 합으로 쪼개지고, 같은 비트를 다르게
 * 끊으면 밑이 바뀐다.
 *
 * 1차 데이터는 **수와 비트 폭 둘뿐**이다. 자리값 · 켜진 자리 · 합 · 8진/16진
 * 표기는 전부 여기서 셈한다 — 화면에 뜨는 값을 선언에 적어 두면 수를 바꿀 때
 * 화면이 거짓말을 한다 (S-piece).
 *
 * 메커니즘은 reactive 다. mount 하면 스스로 재생하고, 자동 재생이 끝나면
 * `advance` 를 기다려 한 걸음씩 다시 짚는다.
 *
 * ── 이벤트 (facet 고유 + 표준 `mark` · `done`)
 *
 *   show-number    { value: number }
 *                  한 수가 한 덩이로 선다.
 *   split-places   { bits: number[]; places: number[] }
 *                  그 덩이가 자리마다 하나씩 쪼개진다. 왼쪽이 큰 자리다.
 *   mark           target ['index:<i>', …] · { values: number[] }
 *                  켜진 자리. 표준 어휘이며 target 이 정규 경로, payload 의
 *                  values 는 그 자리들의 값이다.
 *   sum-up         { addends: number[]; sum: number }
 *                  켜진 자리의 값이 올라와 식이 된다.
 *   cut-by-three   { sizes: number[]; digits: string[]; reading: string }
 *   cut-by-four    { sizes: number[]; digits: string[]; reading: string }
 *                  같은 비트를 셋씩 / 넷씩 끊는다. sizes 는 왼쪽부터 각 묶음이
 *                  삼킨 비트 수 — 여덟 비트를 셋씩 끊으면 [2, 3, 3] 이다.
 *   done           { value: number; binary: string; octal: string; hex: string }
 *                  세 표기가 한 수를 가리킨다.
 *   rewind         {}
 *                  되감기. 화면을 비운다. `advance` 로 처음부터 다시 짚을 때.
 *
 * 여덟 모두 silent 가 아니다 — 전부 걸음의 경계다.
 * 메트릭은 없다. 조각은 셀 것이 없으므로 `ctx.metric` 을 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type PositionalValueData = {
  type: 'positional-value';
  /** 화면이 보이는 수. */
  value: number;
  /** 몇 자리로 적는가. */
  bitWidth: number;
  /** 걸음 사이의 정지 시간. 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

/** 같은 비트를 한 단위로 끊은 결과. */
export type PositionalGrouping = {
  /** 왼쪽부터 각 묶음이 삼킨 비트 수. 왼쪽 끝 묶음만 짧아질 수 있다. */
  sizes: number[];
  /** 묶음마다 한 글자. 묶음이 넷 이하라 언제나 한 글자로 떨어진다. */
  digits: string[];
  /** 앞의 0 을 떼고 이어 적은 표기. */
  reading: string;
};

export type PositionalValueFacts = {
  /** 왼쪽부터의 자리값. 여덟 자리면 128 … 1. */
  places: number[];
  /** 자리마다 0 또는 1. */
  bits: number[];
  /** 켜진 자리의 번호 (왼쪽이 0). */
  onIndices: number[];
  /** 켜진 자리의 값. */
  addends: number[];
  sum: number;
  binary: string;
  three: PositionalGrouping;
  four: PositionalGrouping;
};

const DEFAULT_STEP_MS = 700;

/**
 * 오른쪽 끝에서부터 size 개씩 끊는다.
 *
 * 오른쪽부터인 까닭은 자리값이 오른쪽 끝에서 1 로 시작하기 때문이다. 여덟
 * 비트를 셋씩 끊으면 왼쪽 끝에 둘만 남는다.
 */
function cut(bits: number[], size: number): PositionalGrouping {
  const sizes: number[] = [];
  for (let left = bits.length; left > 0; left -= size) sizes.unshift(Math.min(size, left));

  const digits: string[] = [];
  let at = 0;
  for (const s of sizes) {
    let v = 0;
    for (let k = 0; k < s; k += 1) v = v * 2 + bits[at + k];
    // 한 묶음이 넷 이하이므로 값이 15 를 넘지 않는다 — 언제나 한 글자다.
    digits.push(v.toString(16).toUpperCase());
    at += s;
  }

  const joined = digits.join('');
  return { sizes, digits, reading: joined.replace(/^0+(?=.)/, '') };
}

/** 수와 비트 폭에서 화면이 쓰는 값을 전부 셈한다. */
export function computePositionalValueFacts(data: PositionalValueData): PositionalValueFacts {
  const width = Math.max(1, Math.floor(data.bitWidth));

  const places: number[] = [];
  for (let i = width - 1; i >= 0; i -= 1) places.push(2 ** i);

  const bits = places.map((p) => Math.floor(data.value / p) % 2);
  const onIndices = bits.flatMap((b, i) => (b === 1 ? [i] : []));
  const addends = onIndices.map((i) => places[i]);

  return {
    places,
    bits,
    onIndices,
    addends,
    sum: addends.reduce((a, b) => a + b, 0),
    binary: bits.join(''),
    three: cut(bits, 3),
    four: cut(bits, 4),
  };
}

/**
 * 걸음 사이의 문. 자동 재생일 때는 쉬고, 손으로 짚을 때는 다음 누름을 기다린다.
 * 이어 가도 되면 true, 취소됐으면 false.
 */
type Gate = () => Promise<boolean>;

/** `advance` 가 올 때까지 기다린다. 다른 입력은 걸음으로 세지 않는다 (S-piece). */
async function waitAdvance(ctx: ReactiveContext<PositionalValueData>): Promise<boolean> {
  for (;;) {
    let input: { type: string };
    try {
      input = await ctx.waitForInput();
    } catch {
      // 취소되면 waitForInput 이 reject 된다. 거기서 걸음을 접는다.
      return false;
    }
    if (ctx.cancelled) return false;
    if (input.type === 'advance') return true;
  }
}

/**
 * 한 바퀴. 문은 emit **뒤**에 둔다 — 첫 걸음 앞에는 기다릴 앞걸음이 없으므로
 * 마운트 직후의 첫 그림이 곧바로 선다 (S-piece). 마지막 걸음 뒤에도 문을 두지
 * 않는다. 거기서 기다리면 손으로 짚을 때 헛누름이 하나 생긴다.
 */
async function walk(
  ctx: ReactiveContext<PositionalValueData>,
  f: PositionalValueFacts,
  gate: Gate,
): Promise<boolean> {
  await ctx.emit({ type: 'show-number', payload: { value: ctx.data.value } });
  if (!(await gate())) return false;

  await ctx.emit({ type: 'split-places', payload: { bits: f.bits, places: f.places } });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'mark',
    target: f.onIndices.map((i) => `index:${i}`),
    payload: { values: f.addends },
  });
  if (!(await gate())) return false;

  await ctx.emit({ type: 'sum-up', payload: { addends: f.addends, sum: f.sum } });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'cut-by-three',
    payload: { sizes: f.three.sizes, digits: f.three.digits, reading: f.three.reading },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'cut-by-four',
    payload: { sizes: f.four.sizes, digits: f.four.digits, reading: f.four.reading },
  });
  if (!(await gate())) return false;

  await ctx.emit({
    type: 'done',
    payload: {
      value: ctx.data.value,
      binary: f.binary,
      octal: f.three.reading,
      hex: f.four.reading,
    },
  });
  return true;
}

export async function positionalValueAlgorithm(
  ctxIn: FacetContext<PositionalValueData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<PositionalValueData>;
  const facts = computePositionalValueFacts(ctx.data);
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  // 자동 재생. stepMs 는 애니메이션이 끝난 뒤의 정지 시간이다 — projector 가
  // stage 의 애니메이션을 기다린 뒤에야 emit 이 돌아온다 (S-piece).
  if (!(await walk(ctx, facts, () => ctx.sleep(stepMs)))) return;

  // 다 보여 준 뒤. 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 다시 짚는다.
  // 처음 누르는 `advance` 는 되감고 첫 걸음까지 간다 — 되감기만 하고 멈추면
  // 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
  for (;;) {
    if (!(await waitAdvance(ctx))) return;
    await ctx.emit({ type: 'rewind', payload: {} });
    if (!(await walk(ctx, facts, () => waitAdvance(ctx)))) return;
  }
}
