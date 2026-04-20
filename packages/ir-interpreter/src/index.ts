/**
 * @facet/ir-interpreter — IR 의 의미를 정의하는 단일 진실 원천 (source of truth).
 *
 * 어떤 언어 transpiler 의 emit 결과도 동일 IR 을 이 인터프리터로 실행한 결과와
 * 의미적으로 동등해야 한다. 라운드트립 검증의 비교 기준.
 *
 * 의미 정의:
 *  - 스코프: 함수 호출마다 root scope. 각 블록 (loop body, if branch) 은 child scope.
 *  - var: 현재 스코프에 새 바인딩.
 *  - assign: 정의된 스코프 (가장 가까운 상위) 의 바인딩을 갱신.
 *  - 배열은 참조 의미 (mutation 가시).
 *  - swap: 두 lvalue 의 값 교환 (변수↔변수, 변수↔index, index↔index 모두).
 *  - len: array.length 또는 string.length.
 *  - call: ir.functions 안의 함수만 호출 가능 (외부 함수 없음).
 */

import type { IR, IRExpr, IRFunc, IRStmt } from '@facet/core';

export type Value = number | boolean | string | Value[] | undefined;

class Scope {
  private vars = new Map<string, Value>();
  constructor(private parent?: Scope) {}

  declare(name: string, value: Value): void {
    this.vars.set(name, value);
  }

  get(name: string): Value {
    if (this.vars.has(name)) return this.vars.get(name);
    if (this.parent) return this.parent.get(name);
    throw new Error(`[ir-interpreter] 미정의 변수: ${name}`);
  }

  assign(name: string, value: Value): void {
    let s: Scope | undefined = this;
    while (s) {
      if (s.vars.has(name)) {
        s.vars.set(name, value);
        return;
      }
      s = s.parent;
    }
    throw new Error(`[ir-interpreter] 미정의 변수에 대입: ${name}`);
  }

  child(): Scope {
    return new Scope(this);
  }
}

type Control =
  | { kind: 'normal' }
  | { kind: 'return'; value: Value | undefined }
  | { kind: 'break' }
  | { kind: 'continue' };

const NORMAL: Control = { kind: 'normal' };

type Lvalue = { get(): Value; set(v: Value): void };

export class IRInterpreter {
  private fns = new Map<string, IRFunc>();

  constructor(ir: IR) {
    for (const f of ir.functions) this.fns.set(f.name, f);
  }

  call(name: string, args: Value[]): Value | undefined {
    const fn = this.fns.get(name);
    if (!fn) throw new Error(`[ir-interpreter] 미등록 함수: ${name}`);
    if (args.length !== fn.params.length) {
      throw new Error(
        `[ir-interpreter] ${name}: 인자 수 불일치 (기대 ${fn.params.length}, 실제 ${args.length})`,
      );
    }
    const scope = new Scope();
    fn.params.forEach((p, i) => scope.declare(p.name, args[i]));
    const c = this.execBlock(fn.body, scope);
    if (c.kind === 'return') return c.value;
    return undefined;
  }

  private execBlock(stmts: IRStmt[], scope: Scope): Control {
    for (const s of stmts) {
      const c = this.execStmt(s, scope);
      if (c.kind !== 'normal') return c;
    }
    return NORMAL;
  }

  private execStmt(s: IRStmt, scope: Scope): Control {
    switch (s.kind) {
      case 'comment':
        return NORMAL;
      case 'var':
        scope.declare(s.name, this.evalExpr(s.init, scope));
        return NORMAL;
      case 'assign': {
        const v = this.evalExpr(s.expr, scope);
        this.lvalueOf(s.target, scope).set(v);
        return NORMAL;
      }
      case 'if': {
        const cond = this.evalExpr(s.cond, scope) as boolean;
        const branch = cond ? s.then : s.else ?? [];
        return this.execBlock(branch, scope.child());
      }
      case 'for-range': {
        const from = this.evalExpr(s.from, scope) as number;
        const to = this.evalExpr(s.to, scope) as number;
        const cmp = s.inclusive ? (i: number) => i <= to : (i: number) => i < to;
        for (let i = from; cmp(i); i++) {
          const iter = scope.child();
          iter.declare(s.var, i);
          const c = this.execBlock(s.body, iter);
          if (c.kind === 'return') return c;
          if (c.kind === 'break') break;
          // continue / normal 모두 다음 반복
        }
        return NORMAL;
      }
      case 'while': {
        while (this.evalExpr(s.cond, scope) as boolean) {
          const c = this.execBlock(s.body, scope.child());
          if (c.kind === 'return') return c;
          if (c.kind === 'break') break;
        }
        return NORMAL;
      }
      case 'swap': {
        const a = this.lvalueOf(s.a, scope);
        const b = this.lvalueOf(s.b, scope);
        const tmp = a.get();
        a.set(b.get());
        b.set(tmp);
        return NORMAL;
      }
      case 'return':
        return { kind: 'return', value: s.expr ? this.evalExpr(s.expr, scope) : undefined };
      case 'break':
        return { kind: 'break' };
      case 'continue':
        return { kind: 'continue' };
      case 'expr-stmt':
        this.evalExpr(s.expr, scope);
        return NORMAL;
    }
  }

  private lvalueOf(target: IRExpr, scope: Scope): Lvalue {
    if (target.kind === 'var') {
      return {
        get: () => scope.get(target.name),
        set: (v) => scope.assign(target.name, v),
      };
    }
    if (target.kind === 'index') {
      const arr = this.evalExpr(target.arr, scope) as Value[];
      const idx = this.evalExpr(target.idx, scope) as number;
      return {
        get: () => arr[idx],
        set: (v) => {
          arr[idx] = v;
        },
      };
    }
    throw new Error(`[ir-interpreter] 잘못된 lvalue: ${target.kind}`);
  }

  private evalExpr(e: IRExpr, scope: Scope): Value {
    switch (e.kind) {
      case 'lit':
        return e.value;
      case 'var':
        return scope.get(e.name);
      case 'index': {
        const arr = this.evalExpr(e.arr, scope) as Value[];
        const idx = this.evalExpr(e.idx, scope) as number;
        return arr[idx];
      }
      case 'len': {
        const v = this.evalExpr(e.of, scope);
        if (Array.isArray(v)) return v.length;
        if (typeof v === 'string') return v.length;
        throw new Error(`[ir-interpreter] len 의 인자가 array/string 이 아님`);
      }
      case 'binop': {
        const l = this.evalExpr(e.l, scope);
        const r = this.evalExpr(e.r, scope);
        switch (e.op) {
          case '+':
            return (l as number) + (r as number);
          case '-':
            return (l as number) - (r as number);
          case '*':
            return (l as number) * (r as number);
          case '/':
            return (l as number) / (r as number);
          case '%':
            return (l as number) % (r as number);
          case '<':
            return (l as number) < (r as number);
          case '<=':
            return (l as number) <= (r as number);
          case '>':
            return (l as number) > (r as number);
          case '>=':
            return (l as number) >= (r as number);
          case '==':
            return l === r;
          case '!=':
            return l !== r;
          case '&&':
            return (l as boolean) && (r as boolean);
          case '||':
            return (l as boolean) || (r as boolean);
        }
        return undefined;
      }
      case 'unop': {
        const x = this.evalExpr(e.x, scope);
        if (e.op === '!') return !(x as boolean);
        if (e.op === '-') return -(x as number);
        return undefined;
      }
      case 'call': {
        const args = e.args.map((a) => this.evalExpr(a, scope));
        return this.call(e.fn, args);
      }
    }
  }
}

/** IR + 함수명 + 인자로 즉시 실행 (mutation 후 인자 그대로 반환). */
export function runIR(ir: IR, entry: string, args: Value[]): Value | undefined {
  return new IRInterpreter(ir).call(entry, args);
}
