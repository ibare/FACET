/**
 * @facet/transpiler-typescript — IR → TypeScript 학습 코드 emitter.
 *
 * 디자인 원칙:
 *  - JS 와 동일한 본문 구조에 함수 시그니처(매개변수/반환 타입)만 어노테이션.
 *  - 지역 변수는 추론에 맡겨 어노테이션 생략 (학습 가독성 우선).
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

const INDENT = '  ';

function isBinop(e: IRExpr): boolean {
  return e.kind === 'binop';
}

function tsType(t: IRType): string {
  switch (t.kind) {
    case 'int':
    case 'double':
      return 'number';
    case 'bool':
      return 'boolean';
    case 'string':
      return 'string';
    case 'void':
      return 'void';
    case 'list':
      return `${tsType(t.of)}[]`;
  }
}

export const typescriptTranspiler: Transpiler = {
  id: 'typescript',
  language: 'typescript',
  label: { en: 'TypeScript', ko: 'TypeScript' },
  supports: ['imperative'],
  transpile(ir: IR): TranspileResult {
    if (!ir.functions || ir.functions.length === 0) {
      throw new Error(`[transpiler-typescript] IR "${ir.id}" 에 functions 가 비어 있다`);
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
          return `${emitExpr(e.of)}.length`;
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
          lines.push({ code: `${ind}let ${s.name} = ${emitExpr(s.init)};`, phase: s.phase ?? null });
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
            code: `${ind}for (let ${s.var} = ${emitExpr(s.from)}; ${s.var} ${cmp} ${emitExpr(s.to)}; ${s.var}++) {`,
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
          lines.push({ code: `${ind}[${a}, ${b}] = [${b}, ${a}];`, phase: s.phase ?? null });
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
      const params = f.params.map((p) => `${p.name}: ${tsType(p.type)}`).join(', ');
      lines.push({
        code: `function ${f.name}(${params}): ${tsType(f.returnType)} {`,
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

export function registerTypescriptTranspiler(): void {
  registerTranspiler(typescriptTranspiler.id, typescriptTranspiler);
}
