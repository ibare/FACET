/**
 * 해시 눈사태 효과 (avalanche effect) 시각화 알고리즘 — 조각(단일 주장) facet.
 *
 * 이 facet 이 답하는 질문 하나:
 *   "입력을 한 글자만 바꿨는데 왜 해시가 전혀 달라지는가?"
 *
 * 답은 두 비교의 대비에 있다 — 입력은 40비트 중 5비트만 달랐는데 출력은
 * 256비트 중 131비트가 다르다. 12.5% 가 51.2% 로 증폭된다.
 *
 * 그래서 화면에는 언제나 두 항이 함께 있다. 입력 둘을 나란히 놓고 그 비트를
 * 견준 뒤, 각각의 출력을 나란히 놓고 다시 견준다. 차이만 그리면 무엇과 무엇의
 * 차이인지가 화면에서 사라진다.
 *
 * 네 걸음을 보인 뒤 정지한다. 학습자 입력을 받지 않는다.
 *
 * 진행 동력은 ReactiveMechanism 이다. 조각에는 컨트롤바가 없어 두 가지가 필요한데
 * 둘 다 reactive 만 준다 — mount 시 스스로 시작하는 것 (init 의 ensureStarted) 과
 * 걸음 간격을 스스로 정하는 것 (ctx.sleep). coroutine 은 BASE_DELAY_MS 100ms 로만
 * 나아가고 속도 조정이 speed-slider 로만 가능해 (S-runtime) 조각에는 맞지 않는다.
 *
 * 입력 대기 루프는 두지 않는다. 네 걸음을 마치면 그대로 끝난다.
 *
 * 식별자 (C1): 위치 기반 식별 대상이 없어 target 을 쓰지 않는다.
 *
 * 이벤트 (C2) — 전부 facet 로컬 (StandardEventType 미포함):
 *   - init              payload: { algorithmLabel, inputA, inputB,
 *                                  inputBitsA, inputBitsB, inputFlipped,
 *                                  inputTotalBits, inputFlippedBits,
 *                                  outputBitsA, outputBitsB, outputFlipped,
 *                                  outputTotalBits, outputFlippedBits }
 *   - reveal-inputs     payload: {}   두 입력과 그 비트를 나란히 놓는다
 *   - mark-input-diff   payload: {}   입력에서 다른 비트만 물들이고 센다
 *   - reveal-outputs    payload: {}   두 출력 비트를 나란히 놓는다
 *   - mark-output-diff  payload: {}   출력에서 다른 비트만 물들이고 센다
 *
 * 메트릭 (C5): 없다. 조각은 metrics 패널을 두지 않으므로 ctx.metric 을 부르지 않는다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HashAvalancheFacetData = {
  type: 'hash-avalanche';
  /** 화면에 인쇄할 해시 함수 이름. */
  algorithmLabel: string;
  /** 원본 입력. */
  inputA: string;
  /** 한 글자만 다른 입력. */
  inputB: string;
  /**
   * inputA 의 해시 (소문자 hex).
   *
   * 브라우저에서 실제로 해싱하지 않고 선언한다 — 이 조각은 입력을 받지 않아
   * 계산할 대상이 고정이고, 무엇을 보여줄지는 저작 결정이기 때문이다 (원칙 2).
   */
  hashA: string;
  /** inputB 의 해시 (소문자 hex). */
  hashB: string;
  /**
   * 한 걸음 사이 머무는 간격 ms.
   *
   * 조각은 컨트롤바가 없어 speed-slider 로 늦출 수 없다. 읽을 시간을 주는 것은
   * 저작 결정이므로 선언에 둔다 (원칙 2).
   */
  stepMs: number;
};

/** hex 문자열을 비트 배열로. 길이가 홀수거나 hex 가 아니면 빈 배열. */
function hexToBits(hex: string): boolean[] {
  const bits: boolean[] = [];
  for (const ch of hex) {
    const v = parseInt(ch, 16);
    if (Number.isNaN(v)) return [];
    bits.push((v & 8) !== 0, (v & 4) !== 0, (v & 2) !== 0, (v & 1) !== 0);
  }
  return bits;
}

/**
 * 문자열을 UTF-8 바이트의 비트 배열로. 한 글자가 한 바이트(8비트)씩 이어진다.
 *
 * 입력도 비트로 펼쳐야 출력과 같은 형식으로 견줄 수 있다 — "5비트가 다르다" 는
 * 말이 화면에 근거를 가지려면 그 5칸이 실제로 보여야 한다.
 */
function textToBits(text: string): boolean[] {
  const bytes = new TextEncoder().encode(text);
  const bits: boolean[] = [];
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) bits.push(((byte >> i) & 1) === 1);
  }
  return bits;
}

/** 두 비트열에서 자리마다 다른지. 짧은 쪽 길이까지만 견준다. */
function bitDiff(a: boolean[], b: boolean[]): boolean[] {
  const n = Math.min(a.length, b.length);
  const out: boolean[] = [];
  for (let i = 0; i < n; i++) out.push(a[i] !== b[i]);
  return out;
}

function countTrue(flags: boolean[]): number {
  return flags.reduce((n, f) => (f ? n + 1 : n), 0);
}

export async function hashAvalanche(
  ctxBase: FacetContext<HashAvalancheFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<HashAvalancheFacetData>;
  const { algorithmLabel, inputA, inputB, hashA, hashB, stepMs } = ctx.data;

  const inputBitsA = textToBits(inputA);
  const inputBitsB = textToBits(inputB);
  const inputFlipped = bitDiff(inputBitsA, inputBitsB);

  const outputBitsA = hexToBits(hashA);
  const outputBitsB = hexToBits(hashB);
  const outputFlipped = bitDiff(outputBitsA, outputBitsB);

  /**
   * 걸음 사이 머무름. 취소되면 false — 호출부가 즉시 빠져나가야 한다 (C8).
   *
   * 걸음을 배열로 순회하지 않고 한 줄씩 펴 쓰는 이유는 `ctx.emit` 의 type 이
   * 리터럴이어야 하기 때문이다 (C2). 덕분에 어휘가 코드에 그대로 드러난다.
   */
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    const ok = await ctx.sleep(stepMs);
    return ok && !ctx.cancelled;
  }

  await ctx.emit({
    type: 'init',
    payload: {
      algorithmLabel,
      inputA,
      inputB,
      inputBitsA,
      inputBitsB,
      inputFlipped,
      inputTotalBits: inputFlipped.length,
      inputFlippedBits: countTrue(inputFlipped),
      outputBitsA,
      outputBitsB,
      outputFlipped,
      outputTotalBits: outputFlipped.length,
      outputFlippedBits: countTrue(outputFlipped),
    },
  });

  // 네 걸음. 견줄 두 항을 먼저 놓고, 그 다음에 차이를 물들인다.
  if (!(await pause())) return;
  await ctx.emit({ type: 'reveal-inputs' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'mark-input-diff' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'reveal-outputs' });
  if (!(await pause())) return;
  await ctx.emit({ type: 'mark-output-diff' });
}
