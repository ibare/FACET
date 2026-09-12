/**
 * 곱 양자화 — 토막을 잘게 쪼갤수록 자리는 늘고 오차는 준다.
 *
 * 8 차원 벡터 하나를 토막 수를 바꿔 가며 양자화한다. 토막마다 대표 넷
 * (값이 고른 격자 2 · 4 · 6 · 8) 중 가장 가까운 것을 골라 그 **번호** 만 남기고,
 * 되살릴 때는 번호가 가리키는 대표로 토막을 통째로 채운다.
 *
 * ── 식별자
 *   sector:<i>   토막 i (0 부터)
 *
 * ── 이벤트 (전부 이 facet 고유 확장. silent 는 하나도 없다)
 *   parts-changed  { parts: number; size: number }
 *       토막 수가 정해졌다. 구획을 다시 긋고 앞 회차의 번호 딱지를 비운다.
 *   code-chosen    { sector: number; from: number; size: number; code: number; value: number }
 *       토막 하나가 가장 가까운 대표를 골랐다. code 는 1 부터 센 번호,
 *       value 는 그 번호가 가리키는 대표값. target 은 'sector:<i>'.
 *   settled        { parts: number; codes: number; bytes: number; errorX100: number; percent: number }
 *       한 회차가 끝났다. errorX100 은 오차를 100 배 한 정수다 — 화면이 소수 두
 *       자리로 고정해 읽으므로 셈도 그 자리에서 끊는다.
 *
 * ── 계기 (facet.ts 의 metrics[].name 과 같은 이름이어야 한다 — C5)
 *   code-bytes     남길 번호가 차지하는 자리. 번호 하나를 1 바이트로 센다.
 *   error-percent  오차를 원본 크기로 나눈 백분율 (반올림, 정수 나눗셈).
 *
 * ── 동률 규칙
 *   토막이 대표 둘로부터 똑같이 떨어질 수 있다. 그때는 **번호가 앞선 쪽**
 *   (작은 대표값) 을 쓴다. 정하지 않으면 실행마다 다른 화면이 나온다.
 *   이 데이터에서 실제로 네 번 걸린다 — 토막 4 의 (7,3) 이 대표 4 와 6 으로부터
 *   똑같이 10 이고, 토막 8 의 7 · 3 · 5 가 각각 이웃한 대표 둘로부터 똑같이 1 이다.
 *
 * ── 손잡이
 *   control-bar 의 segmented-slider 가 `parts` 액션으로 토막 수를 보낸다.
 *   mechanismKind 는 'reactive' 이며 그 선언 자리는 index.ts 다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core';

export type ProductQuantizationData = {
  type: string;
  /** 원본 벡터. 이것과 grid 만이 1차 데이터다. */
  vector: number[];
  /** 대표 넷의 격자값. 토막 크기가 s 면 대표는 (v,v,…,v) 꼴로 펴진다. */
  grid: number[];
  /** 손잡이의 처음 자리. control-bar 의 default 구간과 같아야 한다. */
  parts: number;
  /** 걸음 사이에 쉬는 시간. 애니메이션이 끝난 뒤의 정지 시간이다. */
  stepMs: number;
};

/** 한 회차의 셈 결과. 표의 수를 선언에 박지 않고 여기서 낸다. */
export type ProductQuantizationRound = {
  parts: number;
  /** 토막 하나에 든 값의 수. */
  size: number;
  /** 토막마다 남길 번호 (1 부터). */
  codes: number[];
  /** 그 번호가 가리키는 대표값. */
  values: number[];
  /** 번호만으로 되살린 벡터. */
  restored: number[];
  /** 오차를 100 배 한 정수 (소수 두 자리 고정). */
  errorX100: number;
  /** 오차를 원본 크기로 나눈 백분율. */
  percent: number;
  /** 남길 번호가 차지하는 자리. 번호 하나가 1 바이트. */
  bytes: number;
};

const DEFAULT_STEP_MS = 520;

/** 백분율은 반올림으로, 정수 나눗셈으로 셈한다. 실수로 하면 101% 가 나오는 일이 있다. */
function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.floor((part * 100 + Math.floor(whole / 2)) / whole);
}

/**
 * 토막 하나가 고를 번호. 대표를 앞에서부터 훑되 **더 가까울 때만** 갈아치우므로,
 * 똑같이 가까운 대표가 둘이면 번호가 앞선 쪽이 남는다 (동률 규칙).
 */
function pickCode(chunk: number[], grid: number[]): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let k = 0; k < grid.length; k += 1) {
    let distance = 0;
    for (const v of chunk) distance += (v - grid[k]) * (v - grid[k]);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = k;
    }
  }
  return best;
}

/** 토막 수를 벡터 길이에 맞게 다듬는다. 나누어떨어지지 않는 값은 1 로 떨어진다. */
export function normalizeParts(parts: unknown, length: number): number {
  if (typeof parts !== 'number' || !Number.isInteger(parts)) return 1;
  if (parts < 1 || parts > length) return 1;
  if (length % parts !== 0) return 1;
  return parts;
}

/**
 * 한 회차를 통째로 셈한다. 알고리즘과 테스트가 같은 함수를 쓴다 — 화면이 말하는
 * 수와 검사가 재는 수가 갈리지 않게.
 */
export function computeProductQuantizationRound(
  vector: number[],
  grid: number[],
  parts: number,
): ProductQuantizationRound {
  const size = vector.length / parts;
  const codes: number[] = [];
  const values: number[] = [];
  const restored: number[] = [];

  for (let s = 0; s < parts; s += 1) {
    const chunk = vector.slice(s * size, s * size + size);
    const k = pickCode(chunk, grid);
    codes.push(k + 1);
    values.push(grid[k]);
    for (let i = 0; i < size; i += 1) restored.push(grid[k]);
  }

  let squared = 0;
  let norm = 0;
  for (let i = 0; i < vector.length; i += 1) {
    squared += (vector[i] - restored[i]) * (vector[i] - restored[i]);
    norm += vector[i] * vector[i];
  }
  const error = Math.sqrt(squared);
  // 오차도 원본 크기도 무리수라 나눗셈 전에 천분의 일 단위 정수로 끊는다.
  // 그래야 백분율을 정수 나눗셈으로 반올림할 수 있다.
  const errorMilli = Math.round(error * 1000);
  const normMilli = Math.round(Math.sqrt(norm) * 1000);

  return {
    parts,
    size,
    codes,
    values,
    restored,
    errorX100: Math.round(error * 100),
    percent: percentOf(errorMilli, normMilli),
    bytes: parts,
  };
}

export async function productQuantizationAlgorithm(
  ctx: FacetContext<ProductQuantizationData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<ProductQuantizationData>;
  const data = ctx.data;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : DEFAULT_STEP_MS;

  /**
   * 계기는 누적 채널이다. 러너는 되감기 때만 계기를 비우는데, 손잡이를 돌려
   * 다시 도는 것은 되감기가 아니다. 그래서 지금 값을 들고 차이만 보낸다.
   *
   * **델타가 0 이어도 보낸다** — 안 보내면 갈리지 않는 손잡이 값에서 계기 이름이
   * 통째로 빠져 "선언한 계기가 없는 것" 과 구별되지 않는다.
   */
  const shown = new Map<string, number>();
  const show = (name: string, value: number): void => {
    const before = shown.get(name) ?? 0;
    shown.set(name, value);
    ctx.metric(name, value - before);
  };

  /** 걸음 사이의 문. 끝까지 지났으면 true, 도중에 취소됐으면 false. */
  const pause = async (): Promise<boolean> => {
    if (ctx.cancelled) return false;
    return rctx.sleep(stepMs);
  };

  /** 한 회차를 재생한다. 완주했으면 true, 도중에 취소됐으면 false. */
  const playRound = async (parts: number): Promise<boolean> => {
    const round = computeProductQuantizationRound(data.vector, data.grid, parts);
    if (ctx.cancelled) return false;
    await ctx.emit({ type: 'parts-changed', payload: { parts: round.parts, size: round.size } });
    if (!(await pause())) return false;

    for (let s = 0; s < round.parts; s += 1) {
      // 문이 걸음 끝에 있으므로 진입 검사는 바디 첫 줄에서 직접 진다 (C8).
      if (ctx.cancelled) return false;
      await ctx.emit({
        type: 'code-chosen',
        target: `sector:${s}`,
        payload: {
          sector: s,
          from: s * round.size,
          size: round.size,
          code: round.codes[s],
          value: round.values[s],
        },
      });
      if (!(await pause())) return false;
    }

    show('code-bytes', round.bytes);
    show('error-percent', round.percent);
    if (ctx.cancelled) return false;
    await ctx.emit({
      type: 'settled',
      payload: {
        parts: round.parts,
        codes: round.codes.length,
        bytes: round.bytes,
        errorX100: round.errorX100,
        percent: round.percent,
      },
    });
    return true;
  };

  /** 손잡이가 새 토막 수를 줄 때까지 기다린다. 취소됐으면 null. */
  const nextParts = async (): Promise<number | null> => {
    for (;;) {
      // 앞 — continue 로 돌아와도 여기를 지난다.
      if (ctx.cancelled) return null;
      const input = await rctx.waitForInput();
      // 뒤 — waitForInput 의 throw 규약에 기대지 않는다.
      if (ctx.cancelled) return null;
      if (input.type !== 'parts') continue;
      const payload = input.payload as { value?: unknown } | undefined;
      if (typeof payload?.value !== 'number') continue;
      const parts = normalizeParts(payload.value, data.vector.length);
      if (parts !== payload.value) continue;
      return parts;
    }
  };

  let parts = normalizeParts(data.parts, data.vector.length);

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(parts))) return;
      const next = await nextParts();
      if (next === null) return;
      parts = next;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다. 그 밖의
    // 오류는 그대로 올려 러너가 드러내게 둔다 (C8 정본).
    if (!ctx.cancelled) throw err;
  }
}
