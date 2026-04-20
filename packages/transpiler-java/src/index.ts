/**
 * @facet/transpiler-java — IR → Java 학습 코드 emitter.
 *
 * 디자인 원칙:
 *  - 학습 가독성 우선. 단일 static 메서드만 보여주고 클래스 wrapper 는 생략.
 *  - swap 은 임시 변수 3줄로 분해 (Java 관용). 모든 라인이 동일 phase 를 가진다.
 *  - 들여쓰기 4 spaces.
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

function javaType(t: IRType): string {
  switch (t.kind) {
    case 'int':
      return 'int';
    case 'double':
      return 'double';
    case 'bool':
      return 'boolean';
    case 'string':
      return 'String';
    case 'void':
      return 'void';
    case 'list':
      return `${javaType(t.of)}[]`;
  }
}

type SymTable = Map<string, IRType>;

function inferType(e: IRExpr, syms: SymTable): IRType {
  switch (e.kind) {
    case 'lit':
      if (typeof e.value === 'boolean') return { kind: 'bool' };
      if (typeof e.value === 'string') return { kind: 'string' };
      return Number.isInteger(e.value) ? { kind: 'int' } : { kind: 'double' };
    case 'var': {
      const t = syms.get(e.name);
      if (!t) throw new Error(`[transpiler-java] 알 수 없는 변수: ${e.name}`);
      return t;
    }
    case 'index': {
      const arrT = inferType(e.arr, syms);
      if (arrT.kind !== 'list') {
        throw new Error(`[transpiler-java] 비-리스트 타입에 인덱스 접근: ${arrT.kind}`);
      }
      return arrT.of;
    }
    case 'len':
      return { kind: 'int' };
    case 'binop': {
      const boolOps = ['<', '<=', '>', '>=', '==', '!=', '&&', '||'];
      if (boolOps.includes(e.op)) return { kind: 'bool' };
      return inferType(e.l, syms);
    }
    case 'unop':
      return e.op === '!' ? { kind: 'bool' } : inferType(e.x, syms);
    case 'call':
      // 학습 알고리즘에서 호출 결과 타입은 알 수 없음 → void 로 표기. 사용처 없음 가정.
      return { kind: 'void' };
  }
}

export const javaTranspiler: Transpiler = {
  id: 'java',
  language: 'java',
  label: { en: 'Java', ko: 'Java' },
  supports: ['imperative'],
  transpile(ir: IR): TranspileResult {
    if (!ir.functions || ir.functions.length === 0) {
      throw new Error(`[transpiler-java] IR "${ir.id}" 에 functions 가 비어 있다`);
    }
    const lines: TranspileLine[] = [];
    let tmpCounter = 0;
    const nextTmp = () => `tmp${++tmpCounter}`;

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

    function emitStmt(s: IRStmt, level: number, syms: SymTable): void {
      const ind = INDENT.repeat(level);
      switch (s.kind) {
        case 'comment':
          lines.push({ code: `${ind}// ${s.text}`, phase: null });
          return;
        case 'var':
          syms.set(s.name, s.type);
          lines.push({
            code: `${ind}${javaType(s.type)} ${s.name} = ${emitExpr(s.init)};`,
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
          const inner = new Map(syms);
          for (const c of s.then) emitStmt(c, level + 1, inner);
          if (s.else && s.else.length > 0) {
            lines.push({ code: `${ind}} else {`, phase: s.phase ?? null });
            const innerElse = new Map(syms);
            for (const c of s.else) emitStmt(c, level + 1, innerElse);
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
          const inner: SymTable = new Map(syms);
          inner.set(s.var, { kind: 'int' });
          for (const c of s.body) emitStmt(c, level + 1, inner);
          lines.push({ code: `${ind}}`, phase: null });
          return;
        }
        case 'while': {
          lines.push({ code: `${ind}while (${emitExpr(s.cond)}) {`, phase: s.phase ?? null });
          const inner = new Map(syms);
          for (const c of s.body) emitStmt(c, level + 1, inner);
          lines.push({ code: `${ind}}`, phase: null });
          return;
        }
        case 'swap': {
          const aS = emitExpr(s.a);
          const bS = emitExpr(s.b);
          const elemT = javaType(inferType(s.a, syms));
          const tmp = nextTmp();
          const phase = s.phase ?? null;
          lines.push({ code: `${ind}${elemT} ${tmp} = ${aS};`, phase });
          lines.push({ code: `${ind}${aS} = ${bS};`, phase });
          lines.push({ code: `${ind}${bS} = ${tmp};`, phase });
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
      const params = f.params.map((p) => `${javaType(p.type)} ${p.name}`).join(', ');
      lines.push({
        code: `static ${javaType(f.returnType)} ${f.name}(${params}) {`,
        phase: null,
      });
      const syms: SymTable = new Map();
      for (const p of f.params) syms.set(p.name, p.type);
      for (const stmt of f.body) emitStmt(stmt, 1, syms);
      lines.push({ code: `}`, phase: null });
    }

    ir.functions.forEach((fn, i) => {
      if (i > 0) lines.push({ code: '', phase: null });
      emitFunc(fn);
    });
    return { lines };
  },
};

export function registerJavaTranspiler(): void {
  registerTranspiler(javaTranspiler.id, javaTranspiler);
}
