/**
 * @facet/transpiler-python — IR → Python 학습 코드 emitter.
 *
 * 입력 IR 의 paradigm 은 'imperative' 만 지원. 출력은 라인별 { code, phase }.
 * phase 는 IR 의 stmt.phase 를 그대로 전파 (한 stmt 가 여러 라인이면 모두 동일 phase).
 *
 * 디자인 원칙:
 *  - 학습 가독성 우선. Python 관용 표현 채택 (튜플 swap, range, len(), True/False).
 *  - 타입 어노테이션 생략 (Python 학습 코드 관용).
 */

import { registerTranspiler } from '@facet/core/runtime';
import type {
  IR,
  IRBinOp,
  IRExpr,
  IRFunc,
  IRStmt,
  TranspileLine,
  TranspileResult,
  Transpiler,
} from '@facet/core';

const INDENT = '    ';

function isBinop(e: IRExpr): boolean {
  return e.kind === 'binop';
}

function pyOp(op: IRBinOp): string {
  if (op === '&&') return 'and';
  if (op === '||') return 'or';
  return op;
}

export const pythonTranspiler: Transpiler = {
  id: 'python',
  language: 'python',
  label: { en: 'Python', ko: 'Python' },
  supports: ['imperative'],
  transpile(ir: IR): TranspileResult {
    if (!ir.functions || ir.functions.length === 0) {
      throw new Error(`[transpiler-python] IR "${ir.id}" 에 functions 가 비어 있다`);
    }
    const lines: TranspileLine[] = [];

    function emitExpr(e: IRExpr): string {
      switch (e.kind) {
        case 'lit':
          if (typeof e.value === 'boolean') return e.value ? 'True' : 'False';
          if (typeof e.value === 'string') return JSON.stringify(e.value);
          return String(e.value);
        case 'var':
          return e.name;
        case 'index':
          return `${emitExpr(e.arr)}[${emitExpr(e.idx)}]`;
        case 'len':
          return `len(${emitExpr(e.of)})`;
        case 'binop': {
          const ls = isBinop(e.l) ? `(${emitExpr(e.l)})` : emitExpr(e.l);
          const rs = isBinop(e.r) ? `(${emitExpr(e.r)})` : emitExpr(e.r);
          return `${ls} ${pyOp(e.op)} ${rs}`;
        }
        case 'unop': {
          const x = isBinop(e.x) ? `(${emitExpr(e.x)})` : emitExpr(e.x);
          return e.op === '!' ? `not ${x}` : `-${x}`;
        }
        case 'call':
          return `${e.fn}(${e.args.map(emitExpr).join(', ')})`;
      }
    }

    function emitStmt(s: IRStmt, level: number): void {
      const ind = INDENT.repeat(level);
      switch (s.kind) {
        case 'comment':
          lines.push({ code: `${ind}# ${s.text}`, phase: null });
          return;
        case 'var':
          lines.push({ code: `${ind}${s.name} = ${emitExpr(s.init)}`, phase: s.phase ?? null });
          return;
        case 'assign':
          lines.push({
            code: `${ind}${emitExpr(s.target)} = ${emitExpr(s.expr)}`,
            phase: s.phase ?? null,
          });
          return;
        case 'if': {
          lines.push({ code: `${ind}if ${emitExpr(s.cond)}:`, phase: s.phase ?? null });
          for (const c of s.then) emitStmt(c, level + 1);
          if (s.else && s.else.length > 0) {
            lines.push({ code: `${ind}else:`, phase: s.phase ?? null });
            for (const c of s.else) emitStmt(c, level + 1);
          }
          return;
        }
        case 'for-range': {
          const fromS = emitExpr(s.from);
          const toS = s.inclusive
            ? emitExpr({ kind: 'binop', op: '+', l: s.to, r: { kind: 'lit', value: 1 } })
            : emitExpr(s.to);
          const rangeArgs = fromS === '0' ? toS : `${fromS}, ${toS}`;
          lines.push({
            code: `${ind}for ${s.var} in range(${rangeArgs}):`,
            phase: s.phase ?? null,
          });
          for (const c of s.body) emitStmt(c, level + 1);
          return;
        }
        case 'while':
          lines.push({ code: `${ind}while ${emitExpr(s.cond)}:`, phase: s.phase ?? null });
          for (const c of s.body) emitStmt(c, level + 1);
          return;
        case 'swap': {
          const a = emitExpr(s.a);
          const b = emitExpr(s.b);
          lines.push({ code: `${ind}${a}, ${b} = ${b}, ${a}`, phase: s.phase ?? null });
          return;
        }
        case 'return':
          lines.push({
            code: s.expr ? `${ind}return ${emitExpr(s.expr)}` : `${ind}return`,
            phase: s.phase ?? null,
          });
          return;
        case 'break':
          lines.push({ code: `${ind}break`, phase: s.phase ?? null });
          return;
        case 'continue':
          lines.push({ code: `${ind}continue`, phase: s.phase ?? null });
          return;
        case 'expr-stmt':
          lines.push({ code: `${ind}${emitExpr(s.expr)}`, phase: s.phase ?? null });
          return;
      }
    }

    function emitFunc(f: IRFunc): void {
      const params = f.params.map((p) => p.name).join(', ');
      lines.push({ code: `def ${f.name}(${params}):`, phase: null });
      if (f.body.length === 0) {
        lines.push({ code: `${INDENT}pass`, phase: null });
        return;
      }
      for (const stmt of f.body) emitStmt(stmt, 1);
    }

    ir.functions.forEach((fn, i) => {
      if (i > 0) lines.push({ code: '', phase: null });
      emitFunc(fn);
    });
    return { lines };
  },
};

export function registerPythonTranspiler(): void {
  registerTranspiler(pythonTranspiler.id, pythonTranspiler);
}
