/**
 * @facet/transpiler-cpp — IR → C++ 학습 코드 emitter.
 *
 * 디자인 원칙:
 *  - 학습 가독성 우선. 함수 본문만 보여주고 #include / using 은 생략.
 *  - 컬렉션은 std::vector, 함수 매개변수에는 reference (&) 로 전달.
 *  - swap 은 std::swap 한 줄.
 *  - 들여쓰기 4 spaces.
 */

import { registerTranspiler } from '@facet/core/runtime';
import type {
  IR,
  IRExpr,
  IRFunc,
  IRParam,
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

function cppType(t: IRType): string {
  switch (t.kind) {
    case 'int':
      return 'int';
    case 'double':
      return 'double';
    case 'bool':
      return 'bool';
    case 'string':
      return 'std::string';
    case 'void':
      return 'void';
    case 'list':
      return `std::vector<${cppType(t.of)}>`;
  }
}

function cppParam(p: IRParam): string {
  // 컬렉션은 reference 로 전달 (학습 알고리즘은 in-place 가 일반).
  if (p.type.kind === 'list') return `${cppType(p.type)}& ${p.name}`;
  return `${cppType(p.type)} ${p.name}`;
}

export const cppTranspiler: Transpiler = {
  id: 'cpp',
  language: 'cpp',
  label: { en: 'C++', ko: 'C++' },
  supports: ['imperative'],
  transpile(ir: IR): TranspileResult {
    if (!ir.functions || ir.functions.length === 0) {
      throw new Error(`[transpiler-cpp] IR "${ir.id}" 에 functions 가 비어 있다`);
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
          return `${emitExpr(e.of)}.size()`;
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
            code: `${ind}${cppType(s.type)} ${s.name} = ${emitExpr(s.init)};`,
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
            code: `${ind}for (int ${s.var} = ${emitExpr(s.from)}; ${s.var} ${cmp} ${emitExpr(s.to)}; ++${s.var}) {`,
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
          lines.push({ code: `${ind}std::swap(${a}, ${b});`, phase: s.phase ?? null });
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
      const params = f.params.map(cppParam).join(', ');
      lines.push({
        code: `${cppType(f.returnType)} ${f.name}(${params}) {`,
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

export function registerCppTranspiler(): void {
  registerTranspiler(cppTranspiler.id, cppTranspiler);
}
