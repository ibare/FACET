/**
 * IR — 알고리즘의 학습용 추상 표현.
 *
 * 6개 1차 언어(Python/JavaScript/TypeScript/Java/C++/C#)에서 자연스럽게 emit
 * 되는 최소 공통 구조만 노드로 채택. 학술적 패러다임 변종(list comprehension,
 * stream, ranges 등)은 1차 범위에서 제외.
 *
 * Transpiler 는 이 IR 트리를 받아 라인별 코드 + phase 라벨을 emit. phase 어휘는
 * 알고리즘이 emit 하는 'phase' 이벤트와 같아야 동기 하이라이트가 동작한다.
 */

import type { LocaleStr } from './locale.js';

// ─────────────────────────────────────────────────────────────────────────────
// 타입 시스템 — 정적 언어(Java/C++/C#/TS) emit 를 위해 IR 가 타입을 보유.
// 동적 언어(Python/JS) emitter 는 타입을 무시하거나 추론용으로만 사용.
// ─────────────────────────────────────────────────────────────────────────────

export type IRType =
  | { kind: 'int' }
  | { kind: 'double' }
  | { kind: 'bool' }
  | { kind: 'string' }
  | { kind: 'void' }
  | { kind: 'list'; of: IRType };

// ─────────────────────────────────────────────────────────────────────────────
// 식 (expression)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 이항 연산.
 *
 * `'//'` 는 **정수 나눗셈**이다. `'/'` 와 갈라 두는 이유는 언어마다 결과가
 * 다르기 때문이다 — 파이썬 3 에서 `(i-1)/2` 는 실수라 `heap[(i-1)/2]` 가
 * 터지고, 자바·C++·C# 에서는 정수끼리면 그냥 `/` 가 정수 나눗셈이다.
 * 자리 번호를 셈하는 자료구조(힙 등)는 이것이 없으면 코드 패널이 틀린 코드를
 * 보인다. 각 transpiler 가 자기 언어의 표기로 옮긴다.
 */
export type IRBinOp =
  | '+' | '-' | '*' | '/' | '//' | '%'
  | '<' | '<=' | '>' | '>='
  | '==' | '!='
  | '&&' | '||';

export type IRUnOp = '!' | '-';

/**
 * IR 이 이름만으로 부를 수 있는 수학 함수.
 *
 * `call` 은 본래 IR 이 정의한 함수만 가리킨다. 그런데 지수·제곱근처럼 **어느
 * 언어에나 있고 이름만 다른** 것까지 IR 안에서 정의하게 하면, 코드 패널이
 * 알고리즘 대신 테일러 급수를 보이게 된다. 그것은 완제품이 코드 패널을 다는
 * 까닭 자체를 지운다.
 *
 * 그래서 이 이름들만 예약해 둔다. 인터프리터는 실제로 셈하고, transpiler 는
 * 자기 언어 표기로 옮긴다 (`exp` → `math.exp` · `Math.exp` · `std::exp` ·
 * `Math.Exp`). 파이썬의 `import math` 나 C++ 의 `#include <cmath>` 는 내지
 * 않는데, 코드 패널이 본래 함수 본문만 보이기 때문이다.
 *
 * **`zeros` 처럼 어느 언어에도 그 이름이 없는 것은 여기 넣지 않는다.** 그것은
 * 표기를 옮기는 일이 아니라 없는 것을 지어내는 일이고, 배열을 만드는 방식은
 * 언어마다 뜻이 달라 한 이름으로 덮을 수 없다.
 *
 * 새 이름을 더하면 **여섯 transpiler 가 모두 그것을 옮겨야 한다.**
 * `packages/ir-interpreter/test/math-builtins.test.ts` 가 그 전수를 본다 — 하나가 빠지면
 * 그 언어에서만 조용히 깨지기 때문이다.
 */
export const IR_MATH_BUILTINS = ['exp', 'log', 'sqrt', 'abs', 'max', 'min', 'floor'] as const;

export type IRMathBuiltin = (typeof IR_MATH_BUILTINS)[number];

export function isIRMathBuiltin(name: string): name is IRMathBuiltin {
  return (IR_MATH_BUILTINS as readonly string[]).includes(name);
}


export type IRExpr =
  | { kind: 'lit'; value: number | string | boolean }
  | { kind: 'var'; name: string }
  | { kind: 'index'; arr: IRExpr; idx: IRExpr }
  | { kind: 'len'; of: IRExpr }
  | { kind: 'binop'; op: IRBinOp; l: IRExpr; r: IRExpr }
  | { kind: 'unop'; op: IRUnOp; x: IRExpr }
  | { kind: 'call'; fn: string; args: IRExpr[] };

// ─────────────────────────────────────────────────────────────────────────────
// 문 (statement) — 모든 노드는 phase? 슬롯을 가진다.
// ─────────────────────────────────────────────────────────────────────────────

export type IRStmt =
  | { kind: 'var'; name: string; type: IRType; init: IRExpr; phase?: string }
  | { kind: 'assign'; target: IRExpr; expr: IRExpr; phase?: string }
  | { kind: 'if'; cond: IRExpr; then: IRStmt[]; else?: IRStmt[]; phase?: string }
  | {
      kind: 'for-range';
      var: string;
      from: IRExpr;
      to: IRExpr;
      inclusive: boolean;
      body: IRStmt[];
      phase?: string;
    }
  | { kind: 'while'; cond: IRExpr; body: IRStmt[]; phase?: string }
  | { kind: 'swap'; a: IRExpr; b: IRExpr; phase?: string }
  | { kind: 'return'; expr?: IRExpr; phase?: string }
  | { kind: 'break'; phase?: string }
  | { kind: 'continue'; phase?: string }
  | { kind: 'expr-stmt'; expr: IRExpr; phase?: string }
  | { kind: 'comment'; text: string };

// ─────────────────────────────────────────────────────────────────────────────
// 함수 / 프로그램
// ─────────────────────────────────────────────────────────────────────────────

export type IRParam = { name: string; type: IRType };

export type IRFunc = {
  name: string;
  params: IRParam[];
  returnType: IRType;
  body: IRStmt[];
};

export type IRParadigm = 'imperative';

export type IR = {
  id: string;
  algorithm: string;
  paradigm: IRParadigm;
  /** 첫 함수가 entry point. 재귀/보조 함수 다중 정의 가능. */
  functions: IRFunc[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Transpiler — 언어별 범용 emitter. 알고리즘에 무관.
// ─────────────────────────────────────────────────────────────────────────────

export type TranspileLine = { code: string; phase: string | null };

export type TranspileResult = {
  lines: TranspileLine[];
};

export type TranspilerLanguage =
  | 'python'
  | 'javascript'
  | 'typescript'
  | 'java'
  | 'cpp'
  | 'csharp';

export type Transpiler = {
  /** 보통 언어 식별자와 동일: 'python', 'javascript', ... */
  id: string;
  language: TranspilerLanguage;
  /** 표시용 라벨. 호스트가 언어 선택 UI 에서 사용. */
  label: LocaleStr;
  /** 처리 가능한 paradigm 집합. 1차 범위는 ['imperative']. */
  supports: IRParadigm[];
  transpile(ir: IR): TranspileResult;
};
