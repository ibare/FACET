/**
 * 가수와 지수 — float32 서른두 비트가 세 토막으로 갈린다.
 *
 * 한 질문에 답한다: 자릿수를 어떻게 나눠 넓은 범위를 담는가.
 *
 * 선언에서 받는 것은 **값 하나와 비트 배분**뿐이다. 비트열도, 치우침을 뺀 실제
 * 지수도, 가수의 실수값도 여기서 셈한다 — 적어 두면 값을 바꿨을 때 화면이 거짓을
 * 말한다 (S-piece "화면에 쓰는 값은 실측한다").
 *
 * ── 이벤트 (전부 이 facet 고유. silent 없음)
 *
 *   lay-bits      { bits: string; value: string; total: number }
 *                 비트를 한 줄로 편다. bits 는 '0'/'1' 로만 된 길이 total 의 문자열.
 *   split         { sign: number; exponent: number; mantissa: number }
 *                 세 토막으로 갈린다. 값은 각 토막이 차지하는 비트 수.
 *   read-sign     { bit: string; sign: string }
 *                 bit 는 '0'|'1', sign 은 '+'|'−' (U+2212).
 *   read-exponent { raw: number; n: number }
 *                 지수 비트를 그냥 수로 읽은 것과 그 비트 수.
 *   debias        { raw: number; bias: number; actual: number }
 *                 치우침은 2^(n-1) - 1 이고, actual = raw - bias.
 *   read-mantissa { fractionBits: string; fraction: string; n: number }
 *                 fractionBits 는 뒤쪽 0 을 턴 '0.1001' 꼴, fraction 은 그 십진값.
 *   hidden-one    { significandBits: string; significand: string }
 *                 가수 비트에는 없는 앞자리 1 을 붙인 '1.1001' 과 그 십진값.
 *   assemble      { value: string }      셋이 이룬 수.
 *   done          { value: string }      처음 그 수와 같다.
 *   rewind        payload 없음. 되감는다 — 수동 재생의 첫 걸음 앞에서만 나간다.
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

/** 양수 셋 이상을 못 믿을 자리에 대비한 좁히개. */
function positive(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.trunc(value)
    : fallback;
}

export async function mantissaAndExponentAlgorithm(
  base: FacetContext<MantissaAndExponentData>,
): Promise<void> {
  // reactive 로 등록되므로 실제로 오는 것은 ReactiveContext 다 (S-piece).
  const ctx = base as ReactiveContext<MantissaAndExponentData>;
  const data = ctx.data;

  const signLen = positive(data.signBits, 1);
  const expLen = positive(data.exponentBits, 8);
  const manLen = positive(data.mantissaBits, 23);
  const total = signLen + expLen + manLen;
  const stepMs = positive(data.stepMs, 750);
  const source = typeof data.value === 'number' && Number.isFinite(data.value) ? data.value : 6.25;

  // ── 여기서부터가 실측이다. 선언에 적힌 수는 하나도 쓰지 않는다.
  const bits = float32Bits(source);
  const signBit = bits.slice(0, signLen);
  const expBits = bits.slice(signLen, signLen + expLen);
  const manBits = bits.slice(signLen + expLen);

  const sign = signBit === '1' ? '−' : '+';
  const raw = parseInt(expBits, 2);
  const bias = 2 ** (expLen - 1) - 1;
  const actual = raw - bias;
  // 뒤쪽 0 은 값을 바꾸지 않으므로 털어 낸다. 스물세 자리는 줄 위에 그대로 있다.
  const tail = manBits.replace(/0+$/, '') || '0';
  const fraction = parseInt(manBits, 2) / 2 ** manLen;
  const value = decimal(source);

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
    await ctx.emit({ type: 'lay-bits', payload: { bits, value, total } });

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'split',
      payload: { sign: signLen, exponent: expLen, mantissa: manLen },
    });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'read-sign', payload: { bit: signBit, sign } });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'read-exponent', payload: { raw, n: expLen } });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'debias', payload: { raw, bias, actual } });

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'read-mantissa',
      payload: { fractionBits: `0.${tail}`, fraction: decimal(fraction), n: manLen },
    });

    if (!(await gate())) return false;
    await ctx.emit({
      type: 'hidden-one',
      payload: { significandBits: `1.${tail}`, significand: decimal(1 + fraction) },
    });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'assemble', payload: { value } });

    if (!(await gate())) return false;
    await ctx.emit({ type: 'done', payload: { value } });
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
