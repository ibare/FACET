/**
 * IR / Transpiler 타입 — 4-layer 와 직교한 코드 표현 모듈.
 *
 * 알고리즘 종류와 무관하게, 동일 알고리즘을 패러다임/언어 조합으로 코드 라인을 산출.
 * 새 4-layer 시스템에서는 code-view 블록 + transpiler 모듈 참조로 활용된다.
 */

export type IR = {
  id: string;
  algorithm: string;
  paradigm: string;
};

export type TranspileLine = { code: string; phase: string | null };

export type TranspileResult = {
  lines: TranspileLine[];
};

export type Transpiler = {
  id: string;
  paradigm: string;
  target: string;
  targetLabel: string;
  transpile(ir: IR): TranspileResult;
};
