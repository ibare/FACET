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

export type IRBinOp =
  | '+' | '-' | '*' | '/' | '%'
  | '<' | '<=' | '>' | '>='
  | '==' | '!='
  | '&&' | '||';

export type IRUnOp = '!' | '-';

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
