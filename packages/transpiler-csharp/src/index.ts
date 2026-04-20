/**
 * @facet/transpiler-csharp — IR → C# 학습 코드 emitter.
 *
 * 디자인 원칙:
 *  - 학습 가독성 우선. 함수만 보여주고 클래스 wrapper / using 은 생략.
 *  - swap 은 C# 7+ 튜플 deconstruction 한 줄.
 *  - len 은 .Length (배열 관용).
 *  - 들여쓰기 4 spaces.
 *  - 메서드명은 IR 의 name 을 그대로 (PascalCase 변환 없음 — 학습 가독성 우선).
 */

import { registerTranspiler } from '@facet/core/runtime';
import type {
  IR,
  IRExpr,
  IRFunc,
  IRStmt,
  IRType,
  TranspileLine,
  TranspileResult,
  Transpiler,
} from '@facet/core';

const INDENT = '    ';

function isBinop(e: IRExpr): boolean {
  return e.kind === 'binop';
}

function csType(t: IRType): string {
  switch (t.kind) {
    case 'int':
      return 'int';
    case 'double':
      return 'double';
    case 'bool':
      return 'bool';
    case 'string':
      return 'string';
    case 'void':
      return 'void';
    case 'list':
      return `${csType(t.of)}[]`;
  }
}

export const csharpTranspiler: Transpiler = {
  id: 'csharp',
  language: 'csharp',
  label: { en: 'C#', ko: 'C#' },
  supports: ['imperative'],
  transpile(ir: IR): TranspileResult {
    if (!ir.functions || ir.functions.length === 0) {
      throw new Error(`[transpiler-csharp] IR "${ir.id}" 에 functions 가 비어 있다`);
    }
    const lines: TranspileLine[] = [];

    function emitExpr(e: IRExpr): string {
      switch (e.kind) {
        case 'lit':
          if (typeof e.value === 'boolean') return e.value ? 'true' : 'false';
          if (typeof e.value === 'string') return JSON.stringify(e.value);
          return String(e.value);
        case 'var':
          return e.name;
        case 'index':
          return `${emitExpr(e.arr)}[${emitExpr(e.idx)}]`;
        case 'len':
          return `${emitExpr(e.of)}.Length`;
        case 'binop': {
          const ls = isBinop(e.l) ? `(${emitExpr(e.l)})` : emitExpr(e.l);
          const rs = isBinop(e.r) ? `(${emitExpr(e.r)})` : emitExpr(e.r);
          return `${ls} ${e.op} ${rs}`;
        }
        case 'unop': {
          const x = isBinop(e.x) ? `(${emitExpr(e.x)})` : emitExpr(e.x);
          return `${e.op}${x}`;
        }
        case 'call':
          return `${e.fn}(${e.args.map(emitExpr).join(', ')})`;
      }
    }

    function emitStmt(s: IRStmt, level: number): void {
      const ind = INDENT.repeat(level);
      switch (s.kind) {
        case 'comment':
          lines.push({ code: `${ind}// ${s.text}`, phase: null });
          return;
        case 'var':
          lines.push({
            code: `${ind}${csType(s.type)} ${s.name} = ${emitExpr(s.init)};`,
            phase: s.phase ?? null,
          });
          return;
        case 'assign':
          lines.push({
            code: `${ind}${emitExpr(s.target)} = ${emitExpr(s.expr)};`,
            phase: s.phase ?? null,
          });
          return;
        case 'if': {
          lines.push({ code: `${ind}if (${emitExpr(s.cond)}) {`, phase: s.phase ?? null });
          for (const c of s.then) emitStmt(c, level + 1);
          if (s.else && s.else.length > 0) {
            lines.push({ code: `${ind}} else {`, phase: s.phase ?? null });
            for (const c of s.else) emitStmt(c, level + 1);
          }
          lines.push({ code: `${ind}}`, phase: null });
          return;
        }
        case 'for-range': {
          const cmp = s.inclusive ? '<=' : '<';
          lines.push({
            code: `${ind}for (int ${s.var} = ${emitExpr(s.from)}; ${s.var} ${cmp} ${emitExpr(s.to)}; ${s.var}++) {`,
            phase: s.phase ?? null,
          });
          for (const c of s.body) emitStmt(c, level + 1);
          lines.push({ code: `${ind}}`, phase: null });
          return;
        }
        case 'while':
          lines.push({ code: `${ind}while (${emitExpr(s.cond)}) {`, phase: s.phase ?? null });
          for (const c of s.body) emitStmt(c, level + 1);
          lines.push({ code: `${ind}}`, phase: null });
          return;
        case 'swap': {
          const a = emitExpr(s.a);
          const b = emitExpr(s.b);
          lines.push({
            code: `${ind}(${a}, ${b}) = (${b}, ${a});`,
            phase: s.phase ?? null,
          });
          return;
        }
        case 'return':
          lines.push({
            code: s.expr ? `${ind}return ${emitExpr(s.expr)};` : `${ind}return;`,
            phase: s.phase ?? null,
          });
          return;
        case 'break':
          lines.push({ code: `${ind}break;`, phase: s.phase ?? null });
          return;
        case 'continue':
          lines.push({ code: `${ind}continue;`, phase: s.phase ?? null });
          return;
        case 'expr-stmt':
          lines.push({ code: `${ind}${emitExpr(s.expr)};`, phase: s.phase ?? null });
          return;
      }
    }

    function emitFunc(f: IRFunc): void {
      const params = f.params.map((p) => `${csType(p.type)} ${p.name}`).join(', ');
      lines.push({
        code: `static ${csType(f.returnType)} ${f.name}(${params}) {`,
        phase: null,
      });
      for (const stmt of f.body) emitStmt(stmt, 1);
      lines.push({ code: `}`, phase: null });
    }

    ir.functions.forEach((fn, i) => {
      if (i > 0) lines.push({ code: '', phase: null });
      emitFunc(fn);
    });
    return { lines };
  },
};

export function registerCsharpTranspiler(): void {
  registerTranspiler(csharpTranspiler.id, csharpTranspiler);
}
