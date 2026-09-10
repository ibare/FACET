/**
 * 예약된 수학 이름이 실제로 셈해지고, 여섯 언어가 저마다의 표기로 옮기는가.
 *
 * `IR_MATH_BUILTINS` 는 IR 이 정의하지 않고도 부를 수 있는 유일한 이름들이다.
 * 지수·제곱근을 IR 안에서 정의하게 하면 코드 패널이 알고리즘 대신 테일러 급수를
 * 보이게 되므로 그 일곱만 예약해 두었다.
 *
 * **하나가 빠지면 그 언어에서만 조용히 깨진다.** transpiler 여섯이 각자 자기
 * 표기 테이블을 갖는데, 새 이름을 더하면서 한 곳을 빠뜨려도 나머지 다섯은
 * 멀쩡하니 눈으로는 안 보인다. 그래서 전수로 잰다.
 *
 * 아래 표기표는 transpiler 의 것과 **일부러 두 벌이다.** 한 벌을 나눠 쓰면
 * 구현이 틀릴 때 검사도 같이 틀린다. 이것은 "이 언어에서 이렇게 나와야 한다"는
 * 기대이지 구현의 복사가 아니다.
 */
import { describe, expect, it } from 'vitest';
import { IR_MATH_BUILTINS, type IR, type IRExpr, type IRStmt } from '@ffacet/core';
import { runIR } from '../src/index.js';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

/** 인자 둘을 받는 것과 하나를 받는 것. */
const ARITY_2 = new Set(['max', 'min']);

const lit = (value: number): IRExpr => ({ kind: 'lit', value });

/** 이름 하나를 부르고 그 값을 돌려주는 가장 작은 IR. */
function probe(fn: string): IR {
  const args = ARITY_2.has(fn) ? [lit(3), lit(7)] : [lit(2)];
  const body: IRStmt[] = [{ kind: 'return', expr: { kind: 'call', fn, args } }];
  return {
    id: `ir:probe-${fn}`,
    algorithm: 'probe',
    paradigm: 'imperative',
    functions: [{ name: 'probe', params: [], returnType: { kind: 'double' }, body }],
  };
}

/** 참값. 인터프리터가 이것과 같은 답을 내야 한다. */
const EXPECTED: Record<string, number> = {
  exp: Math.exp(2),
  log: Math.log(2),
  sqrt: Math.SQRT2,
  abs: 2,
  floor: 2,
  max: 7,
  min: 3,
};

/** 언어별로 소스에 나와야 하는 호출 표기. */
const NOTATION: Record<string, Record<string, string>> = {
  python: { exp: 'math.exp(', log: 'math.log(', sqrt: 'math.sqrt(', floor: 'math.floor(', abs: 'abs(', max: 'max(', min: 'min(' },
  javascript: { exp: 'Math.exp(', log: 'Math.log(', sqrt: 'Math.sqrt(', floor: 'Math.floor(', abs: 'Math.abs(', max: 'Math.max(', min: 'Math.min(' },
  typescript: { exp: 'Math.exp(', log: 'Math.log(', sqrt: 'Math.sqrt(', floor: 'Math.floor(', abs: 'Math.abs(', max: 'Math.max(', min: 'Math.min(' },
  java: { exp: 'Math.exp(', log: 'Math.log(', sqrt: 'Math.sqrt(', floor: 'Math.floor(', abs: 'Math.abs(', max: 'Math.max(', min: 'Math.min(' },
  cpp: { exp: 'std::exp(', log: 'std::log(', sqrt: 'std::sqrt(', floor: 'std::floor(', abs: 'std::abs(', max: 'std::max(', min: 'std::min(' },
  csharp: { exp: 'Math.Exp(', log: 'Math.Log(', sqrt: 'Math.Sqrt(', floor: 'Math.Floor(', abs: 'Math.Abs(', max: 'Math.Max(', min: 'Math.Min(' },
};

const TRANSPILERS = {
  python: pythonTranspiler,
  javascript: javascriptTranspiler,
  typescript: typescriptTranspiler,
  java: javaTranspiler,
  cpp: cppTranspiler,
  csharp: csharpTranspiler,
};

function emit(t: { transpile(ir: IR): { lines: Array<{ code: string }> } }, ir: IR): string {
  return t.transpile(ir).lines.map((l) => l.code).join('\n');
}

describe('예약된 수학 이름', () => {
  it('인터프리터가 실제로 셈한다', () => {
    for (const fn of IR_MATH_BUILTINS) {
      expect(runIR(probe(fn), 'probe', []), fn).toBeCloseTo(EXPECTED[fn]!, 10);
    }
  });

  it('자바스크립트로 옮긴 코드가 같은 답을 낸다', () => {
    for (const fn of IR_MATH_BUILTINS) {
      const code = emit(javascriptTranspiler, probe(fn));
      const run = new Function(`${code}\nreturn probe;`)() as () => number;
      expect(run(), fn).toBeCloseTo(EXPECTED[fn]!, 10);
    }
  });

  it('여섯 언어가 저마다의 표기로 옮긴다', () => {
    const missing: string[] = [];
    for (const [lang, t] of Object.entries(TRANSPILERS)) {
      for (const fn of IR_MATH_BUILTINS) {
        const code = emit(t, probe(fn));
        const want = NOTATION[lang]?.[fn];
        if (want === undefined) {
          missing.push(`${lang} :: ${fn} — 기대 표기가 이 검사에 없다`);
          continue;
        }
        if (!code.includes(want)) missing.push(`${lang} :: ${fn} — ${want} 가 없다\n    ${code.trim()}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('IR 이 같은 이름을 스스로 정의했으면 그것이 이긴다', () => {
    // 예약은 정의를 **대신하는** 것이지 덮어쓰는 것이 아니다.
    const ir = probe('sqrt');
    ir.functions.push({
      name: 'sqrt',
      params: [{ name: 'x', type: { kind: 'double' } }],
      returnType: { kind: 'double' },
      body: [{ kind: 'return', expr: { kind: 'lit', value: 99 } }],
    });
    expect(runIR(ir, 'probe', [])).toBe(99);
  });

  it('정의가 있으면 여섯 언어도 표기표를 쓰지 않는다', () => {
    // 인터프리터는 정의를 우선하는데 transpiler 가 무조건 표기표를 따르면,
    // **같은 IR 이 코드 패널과 실행에서 서로 다른 말을 한다.** 코드 패널에는
    // `Math.sqrt(2)` 가 뜨는데 실제로 돌면 99 가 나오는 꼴이다.
    const ir = probe('sqrt');
    ir.functions.push({
      name: 'sqrt',
      params: [{ name: 'x', type: { kind: 'double' } }],
      returnType: { kind: 'double' },
      body: [{ kind: 'return', expr: { kind: 'lit', value: 99 } }],
    });
    const wrong: string[] = [];
    for (const [lang, t] of Object.entries(TRANSPILERS)) {
      const code = emit(t, ir);
      const notation = NOTATION[lang]?.sqrt;
      if (notation && code.includes(notation)) {
        wrong.push(`${lang} — IR 이 sqrt 를 정의했는데 ${notation} 로 냈다`);
      }
      if (!/\bsqrt\(/.test(code)) wrong.push(`${lang} — 정의한 이름 sqrt 를 부르지 않는다`);
    }
    expect(wrong).toEqual([]);
  });
});
