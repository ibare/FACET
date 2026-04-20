import { describe, it, expect } from 'vitest';
import type { IR, IRStmt, Transpiler } from '@facet/core';
import { bubblesortImperativeIR } from '@facet/algorithm-bubblesort';
import { quicksortImperativeIR } from '@facet/algorithm-quicksort';
import { pythonTranspiler } from '@facet/transpiler-python';
import { javascriptTranspiler } from '@facet/transpiler-javascript';
import { typescriptTranspiler } from '@facet/transpiler-typescript';
import { javaTranspiler } from '@facet/transpiler-java';
import { cppTranspiler } from '@facet/transpiler-cpp';
import { csharpTranspiler } from '@facet/transpiler-csharp';

const TRANSPILERS: Transpiler[] = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

const IRS: IR[] = [bubblesortImperativeIR, quicksortImperativeIR];

function collectIRPhases(ir: IR): Map<string, number> {
  const counts = new Map<string, number>();
  function walkStmts(stmts: IRStmt[]): void {
    for (const s of stmts) walk(s);
  }
  function walk(s: IRStmt): void {
    if (s.kind !== 'comment' && s.phase) {
      counts.set(s.phase, (counts.get(s.phase) ?? 0) + 1);
    }
    switch (s.kind) {
      case 'if':
        walkStmts(s.then);
        if (s.else) walkStmts(s.else);
        break;
      case 'for-range':
      case 'while':
        walkStmts(s.body);
        break;
    }
  }
  for (const fn of ir.functions) walkStmts(fn.body);
  return counts;
}

function collectEmitPhases(ir: IR, t: Transpiler): Map<string, number> {
  const counts = new Map<string, number>();
  for (const line of t.transpile(ir).lines) {
    if (line.phase) counts.set(line.phase, (counts.get(line.phase) ?? 0) + 1);
  }
  return counts;
}

describe('phase 메타 보존 — 모든 transpiler', () => {
  for (const ir of IRS) {
    describe(ir.id, () => {
      const irPhases = collectIRPhases(ir);
      const irPhaseSet = new Set(irPhases.keys());

      it('IR phase 집합이 비어있지 않음 (학습 phase 가 정의되어 있어야 한다)', () => {
        expect(irPhaseSet.size).toBeGreaterThan(0);
      });

      for (const t of TRANSPILERS) {
        describe(t.id, () => {
          const emitPhases = collectEmitPhases(ir, t);
          const emitPhaseSet = new Set(emitPhases.keys());

          it('emit phase ⊆ IR phase (없는 phase 를 만들지 않음)', () => {
            for (const p of emitPhaseSet) {
              expect(irPhaseSet.has(p)).toBe(true);
            }
          });

          it('IR 에 정의된 모든 phase 가 emit 에도 등장 (phase 누락 없음)', () => {
            for (const p of irPhaseSet) {
              expect(emitPhaseSet.has(p)).toBe(true);
            }
          });

          it('phase 별 emit 라인 수 ≥ IR stmt 수 (분해는 가능, 누락은 불가)', () => {
            for (const [p, irCount] of irPhases) {
              const emitCount = emitPhases.get(p) ?? 0;
              expect(emitCount).toBeGreaterThanOrEqual(irCount);
            }
          });
        });
      }
    });
  }
});
