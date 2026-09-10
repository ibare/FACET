/**
 * @ffacet/transpiler-python — IR → Python 학습 코드 emitter.
 *
 * 입력 IR 의 paradigm 은 'imperative' 만 지원. 출력은 라인별 { code, phase }.
 * phase 는 IR 의 stmt.phase 를 그대로 전파 (한 stmt 가 여러 라인이면 모두 동일 phase).
 *
 * 디자인 원칙:
 *  - 학습 가독성 우선. Python 관용 표현 채택 (튜플 swap, range, len(), True/False).
 *  - 타입 어노테이션 생략 (Python 학습 코드 관용).
 */

import { registerTranspiler } from '@ffacet/core/runtime';
import type {
  IR,
  IRBinOp,
  IRExpr,
  IRFunc,
  IRStmt,
  TranspileLine,
  TranspileResult,
  Transpiler,
} from '@ffacet/core';

/**
 * 예약된 수학 이름의 파이썬 표기 (`IR_MATH_BUILTINS`).
 *
 * `abs`/`max`/`min` 은 파이썬 내장이라 그대로 두고, 나머지만 `math.` 를 붙인다.
 * `import math` 는 내지 않는다 — 이 emitter 는 함수 본문만 보인다.
 */
const MATH: Record<string, string> = {
  exp: 'math.exp',
  log: 'math.log',
  sqrt: 'math.sqrt',
  floor: 'math.floor',
};

/**
 * 예약된 수학 이름을 이 언어의 표기로 바꾼다.
 *
 * **IR 이 그 이름을 스스로 정의했으면 표기표를 쓰지 않는다.** 인터프리터가 이미
 * 그렇게 하므로(정의가 예약을 이긴다), 여기서 무조건 표기표를 따르면 같은 IR 이
 * 코드 패널과 실행에서 서로 다른 말을 하게 된다.
 */
function makeMathName(ir: IR): (fn: string) => string {
  const defined = new Set(ir.functions.map((f) => f.name));
  return (fn) => (defined.has(fn) ? fn : (MATH[fn] ?? fn));
}

const INDENT = '    ';

function isBinop(e: IRExpr): boolean {
  return e.kind === 'binop';
}

function pyOp(op: IRBinOp): string {
  if (op === '&&') return 'and';
  if (op === '||') return 'or';
  // '//' 는 파이썬의 정수 나눗셈 표기 그대로다. '/' 는 실수를 준다.
  return op;
}

export const pythonTranspiler: Transpiler = {
  id: 'python',
  language: 'python',
  label: { en: 'Python', ko: 'Python' },
  supports: ['imperative'],
  transpile(ir: IR): TranspileResult {
    const mathName = makeMathName(ir);
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
          return `${mathName(e.fn)}(${e.args.map(emitExpr).join(', ')})`;
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
