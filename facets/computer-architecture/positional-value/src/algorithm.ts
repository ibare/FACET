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
 * ── 발신은 국면만 말한다 (payload 가 없다)
 *
 * 화면에 뜨는 수 — 자리값 · 비트 · 켜진 자리의 값 · 합 · 묶음 크기 · 묶음 글자 ·
 * 8진/16진 표기 — 는 전부 `computePositionalValueFacts` 하나에서 나온다. 걸음이
 * 그것을 실어 나르면 **화면과 같은 수가 두 출처에서** 나오는 꼴이 되므로 싣지
 * 않는다. 장면이 같은 함수를 부른다 (`scene.ts`).
 *
 * 내주는 쪽을 고른 까닭: 이 조각에는 밟아 가는 셈이 없다. 걸음은 셈의 단계가
 * 아니라 **설명의 국면**이고, `computePositionalValueFacts` 를 떼어 내도 "같은
 * 비트를 다르게 끊으면 밑이 바뀐다" 는 주장이 그대로 남는다 — 내주는 쪽 잣대에
 * 든다 (프로토콜 4 절).
 *
 * ── 이벤트 (facet 고유 + 표준 `mark` · `done`)
 *
 *   show-number    한 수가 한 덩이로 선다.
 *   split-places   그 덩이가 자리마다 하나씩 쪼개진다. 왼쪽이 큰 자리다.
 *   mark           target ['index:<i>', …]
 *                  켜진 자리. 표준 어휘이며 target 이 그 정규 경로다. 자리의
 *                  값은 싣지 않는다 — 장면이 같은 함수로 셈한다.
 *   sum-up         켜진 자리의 값이 올라와 식이 된다.
 *   cut-by-three   같은 비트를 셋씩 끊는다.
 *   cut-by-four    같은 비트를 넷씩 끊는다.
 *   done           세 표기가 한 수를 가리킨다.
 *   rewind         되감기. 화면을 비운다. `advance` 로 처음부터 다시 짚을 때.
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
  /**
   * 앞의 0 을 떼고 이어 적은 표기.
   *
   * 떼어 낸 글자 수를 따로 두지 않는다 — `digits.length - reading.length` 가 곧
   * 그 수다. 잣대를 두 군데 두면 화면의 흐린 글자와 캡션의 표기가 갈린다.
   */
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

/**
 * 수와 비트 폭에서 화면이 쓰는 값을 전부 셈한다.
 *
 * 걸음은 이 값을 하나도 실어 나르지 않는다. 장면이 같은 함수를 불러 화면을
 * 세우므로 출처가 하나다 (`scene.ts` · 프로토콜 4 절의 B 갈래).
 */
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
  onIndices: number[],
  gate: Gate,
): Promise<boolean> {
  await ctx.emit({ type: 'show-number' });
  if (!(await gate())) return false;

  await ctx.emit({ type: 'split-places' });
  if (!(await gate())) return false;

  await ctx.emit({ type: 'mark', target: onIndices.map((i) => `index:${i}`) });
  if (!(await gate())) return false;

  await ctx.emit({ type: 'sum-up' });
  if (!(await gate())) return false;

  await ctx.emit({ type: 'cut-by-three' });
  if (!(await gate())) return false;

  await ctx.emit({ type: 'cut-by-four' });
  if (!(await gate())) return false;

  await ctx.emit({ type: 'done' });
  return true;
}

export async function positionalValueAlgorithm(
  ctxIn: FacetContext<PositionalValueData>,
): Promise<void> {
  const ctx = ctxIn as ReactiveContext<PositionalValueData>;
  // 셈하는 것은 `mark` 의 정규 경로 하나뿐이다. 나머지는 장면이 같은 함수에서
  // 얻으므로 여기서 꺼낼 일이 없다.
  const { onIndices } = computePositionalValueFacts(ctx.data);
  const stepMs = typeof ctx.data.stepMs === 'number' ? ctx.data.stepMs : DEFAULT_STEP_MS;

  // 자동 재생. stepMs 는 애니메이션이 끝난 뒤의 정지 시간이다 — `render` 의
  // Promise 가 장면이 다 선 뒤에 풀리므로 emit 이 그때 돌아온다 (S-scene).
  if (!(await walk(ctx, onIndices, () => ctx.sleep(stepMs)))) return;

  // 다 보여 준 뒤. 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 다시 짚는다.
  // 처음 누르는 `advance` 는 되감고 첫 걸음까지 간다 — 되감기만 하고 멈추면
  // 눌러도 반응이 없는 것으로 읽힌다 (S-piece).
  for (;;) {
    if (!(await waitAdvance(ctx))) return;
    await ctx.emit({ type: 'rewind' });
    if (!(await walk(ctx, onIndices, () => waitAdvance(ctx)))) return;
  }
}
