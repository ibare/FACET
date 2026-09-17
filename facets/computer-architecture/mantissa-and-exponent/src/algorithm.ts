/**
 * 가수와 지수 — float32 서른두 비트가 세 토막으로 갈린다.
 *
 * 한 질문에 답한다: 자릿수를 어떻게 나눠 넓은 범위를 담는가.
 *
 * 선언에서 받는 것은 **값 하나와 비트 배분**뿐이다. 비트열도, 치우침을 뺀 실제
 * 지수도, 가수의 실수값도 여기서 셈한다 — 적어 두면 값을 바꿨을 때 화면이 거짓을
 * 말한다 (S-piece "화면에 쓰는 값은 실측한다").
 *
 * ── 발신은 국면만 말한다 (payload 가 없다)
 *
 * 화면에 나란히 뜨는 수 — 비트열 · 부호 · 읽은 지수 · 치우침 · 실제 지수 · 가수의
 * 이진 표기와 십진값 · 숨은 1 을 붙인 값 · 그 셋이 이루는 수 — 는 전부
 * `readFloat32Parts` 하나에서 나온다. 걸음이 그것을 실어 나르면 **같은 수가 두
 * 출처에서** 나오는 꼴이 되므로 싣지 않는다. 장면이 같은 함수를 부른다
 * (`scene.ts` · 프로토콜 4 절의 B 갈래).
 *
 * 내주는 쪽을 고른 까닭. 이 조각에는 밟아 가는 셈이 없다 — 반복도 분기도 없고,
 * 걸음은 셈의 단계가 아니라 **설명의 국면**이다. `readFloat32Parts` 는 메모리에
 * 적힌 비트를 꺼내 배분대로 자르는 **바탕 읽기**이지 이 조각의 주장이 아니다.
 * 주장은 "서른두 자리가 셋으로 갈리고 그 셋이 제 몫을 맡는다" 이고, 그것을 정하는
 * 것은 함수가 아니라 **비트 배분**(1 · 8 · 23)이다. 함수를 떼어 내도 주장이 그대로
 * 남으므로 내주는 쪽 잣대에 든다.
 *
 * 되짚어 볼 것 하나 — 내주면 장면이 *조각이 피하려는 셈*을 하게 되는 수가 있다.
 * 이 조각은 피하려는 셈이 없다. 무엇을 하지 않아도 된다고 말하는 조각이 아니라
 * 한 수가 어떻게 적혀 있는지를 읽어 보이는 조각이다.
 *
 * ── 이벤트 (전부 이 facet 고유. silent 없음. payload 없음)
 *
 *   lay-bits      비트를 한 줄로 편다.
 *   split         세 토막으로 갈린다.
 *   read-sign     첫 비트를 부호로 읽는다.
 *   read-exponent 지수 비트를 그냥 수로 읽는다.
 *   debias        읽은 수에서 치우침을 뺀다.
 *   read-mantissa 가수 비트를 소수 자리로 읽는다.
 *   hidden-one    저장되지 않는 앞자리 1 을 도로 붙인다.
 *   assemble      셋이 한 수를 이룬다.
 *   done          처음 그 수와 같다.
 *   rewind        되감는다 — 수동 재생의 첫 걸음 앞에서만 나간다.
 *
 * 메트릭 없음 — 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MantissaAndExponentData = {
  type: string;
  /** 쪼개 볼 값. float32 로 적힌다. */
  value: number;
  /** 부호가 차지하는 비트 수. */
  signBits: number;
  /** 지수가 차지하는 비트 수. 치우침이 여기서 나온다 — 2^(n-1) - 1. */
  exponentBits: number;
  /** 가수가 차지하는 비트 수. */
  mantissaBits: number;
  /** 걸음 하나가 끝난 뒤의 정지 시간 (S-piece). */
  stepMs: number;
};

/** 한 값을 배분대로 잘라 읽은 결과. 화면에 뜨는 수가 전부 여기서 나온다. */
export type Float32Parts = {
  /** 배분. 읽은 자리를 다시 셀 일이 없게 함께 낸다. */
  signLen: number;
  expLen: number;
  manLen: number;
  total: number;
  /** float32 로 적었을 때의 비트열. '0'/'1' 서른두 글자. */
  bits: string;
  /** 부호 자리의 비트. */
  signBit: string;
  /** '+' 또는 '−' (U+2212). */
  sign: string;
  /** 지수 비트를 그냥 수로 읽은 것. */
  raw: number;
  /** 치우침. 2^(n-1) - 1. */
  bias: number;
  /** 치우침을 뺀 실제 지수. */
  actual: number;
  /** 뒤쪽 0 을 턴 '0.1001' 꼴. */
  fractionBits: string;
  /** 그 십진값. */
  fraction: string;
  /** 앞자리 1 을 붙인 '1.1001' 꼴. */
  significandBits: string;
  /** 그 십진값. */
  significand: string;
  /** 셋이 이루는 수 — 처음 그 값이다. */
  value: string;
};

/** float32 로 적었을 때의 비트열. '0'/'1' 서른두 글자. */
function float32Bits(value: number): string {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  return view.getUint32(0).toString(2).padStart(32, '0');
}

/** 떠다니는 끝자리를 털어 사람이 읽는 십진수로. */
function decimal(value: number): string {
  return String(Number(value.toFixed(8)));
}

/**
 * 양수 셋 이상을 못 믿을 자리에 대비한 좁히개.
 *
 * 장면도 `initialData` 를 같은 잣대로 좁혀야 하므로 내준다 — 두 자리에서 다르게
 * 좁히면 algorithm 과 화면이 서로 다른 배분을 쓴다.
 */
export function positiveCount(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : fallback;
}

/** 쪼개 볼 값을 좁힌다. 위와 같은 까닭으로 내준다. */
export function readSourceValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * 값 하나와 비트 배분에서 화면이 쓰는 수를 전부 낸다 — 장면이 부르는 것과
 * **같은 함수**다. 걸음이 아무것도 실어 오지 않으므로 출처가 하나다.
 */
export function readFloat32Parts(
  value: number,
  signLen: number,
  expLen: number,
  manLen: number,
): Float32Parts {
  const bits = float32Bits(value);
  const signBit = bits.slice(0, signLen);
  const expBits = bits.slice(signLen, signLen + expLen);
  const manBits = bits.slice(signLen + expLen);

  const raw = parseInt(expBits, 2);
  const bias = 2 ** (expLen - 1) - 1;
  // 뒤쪽 0 은 값을 바꾸지 않으므로 털어 낸다. 스물세 자리는 줄 위에 그대로 있다.
  const tail = manBits.replace(/0+$/, '') || '0';
  const fraction = parseInt(manBits, 2) / 2 ** manLen;

  return {
    signLen,
    expLen,
    manLen,
    total: signLen + expLen + manLen,
    bits,
    signBit,
    sign: signBit === '1' ? '−' : '+',
    raw,
    bias,
    actual: raw - bias,
    fractionBits: `0.${tail}`,
    fraction: decimal(fraction),
    significandBits: `1.${tail}`,
    significand: decimal(1 + fraction),
    value: decimal(value),
  };
}

export async function mantissaAndExponentAlgorithm(
  base: FacetContext<MantissaAndExponentData>,
): Promise<void> {
  // reactive 로 등록되므로 실제로 오는 것은 ReactiveContext 다 (S-piece).
  const ctx = base as ReactiveContext<MantissaAndExponentData>;
  const data = ctx.data;
  const stepMs = positiveCount(data.stepMs, 750);

  let manual = false;
  let openFirst = true;

  /**
   * 걸음 사이의 문.
   *
   * 마운트 직후와 되감은 직후의 첫 걸음은 그냥 지난다 — 문은 걸음 *사이*의
   * 것이라 첫 걸음 앞에는 기다릴 앞걸음이 없다. 문을 먼저 두면 stepMs 만큼 빈
   * 화면이 보인 뒤에야 그림이 선다 (S-piece).
   */
  async function gate(): Promise<boolean> {
    if (openFirst) {
      openFirst = false;
      return true;
    }
    if (!manual) return ctx.sleep(stepMs);
    for (;;) {
      if (ctx.cancelled) return false;
      // 받은 것의 종류를 본다 — 위젯 입력이 붙는 날 그것까지 걸음으로 세지 않도록.
      if ((await ctx.waitForInput()).type === 'advance') return true;
    }
  }

  /** 한 회차. 걸음마다 리터럴 type 으로 낸다 (C2). */
  async function play(): Promise<boolean> {
    if (!(await gate())) return false;
    await ctx.emit({ type: 'lay-bits' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'split' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'read-sign' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'read-exponent' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'debias' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'read-mantissa' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'hidden-one' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'assemble' });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done' });
    return true;
  }

  for (;;) {
    if (!(await play())) return;
    // 할 말을 마쳤다. 곱씹으려는 사람의 한 걸음을 기다린다.
    for (;;) {
      if (ctx.cancelled) return;
      if ((await ctx.waitForInput()).type === 'advance') break;
    }
    // 처음 누르는 한 걸음은 되감고 첫 걸음까지 간다 (S-piece).
    manual = true;
    openFirst = true;
    await ctx.emit({ type: 'rewind' });
  }
}
