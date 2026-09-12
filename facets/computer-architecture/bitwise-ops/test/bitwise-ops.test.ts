/**
 * 비트 연산 — IR 과 화면이 같은 답을 내는가, 그리고 그 답을 내는 구조가 잠겨 있는가.
 *
 * 이 완제품의 핵심은 **IR 에 비트 연산이 없다는 것**이다. `&` · `^` · `<<` 가
 * 어휘에 없어 자리별 산술로 폈고, 그래서 코드 패널이 보이는 셈과 화면이 보이는
 * 셈이 서로 다른 코드로 두 벌 존재한다. 둘이 어긋나면 그것이 거짓말이고 완제품이
 * 코드 패널을 다는 까닭 자체가 지워진다 (whole-batch-protocol). 여기서 여섯 연산
 * 전부를 대조한다.
 *
 * 곁들여 **중간값이 32비트 안에 머무는 구조**를 잠근다. IR 은 여섯 언어로
 * 옮겨지고 그중 java · C++ · C# 의 `int` 는 2^31 에서 감기는데, `ir-interpreter`
 * 는 배정도라 그 벽이 없다 — **대조하는 수단에 벽이 없으므로 답을 견주는 것만
 * 으로는 원리적으로 안 걸린다.** 그래서 IR 을 직접 걸어 다니며 지나가는 모든
 * 중간값을 세는 계산기를 따로 둔다.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runIR } from '@ffacet/ir-interpreter';
import type { IR, IRExpr, IRStmt } from '@ffacet/core/runtime';

import { bitwiseOpsImperativeIR } from '../src/irs.js';
import {
  bitsOf,
  computeBitwiseOpsResult,
  topWeight,
  type BitwiseOpsData,
} from '../src/algorithm.js';
import { bitwiseOpsFacet } from '../src/facet.js';

/** 선언이 정본이다 — 검사가 제 손으로 적은 수를 보면 선언이 바뀌어도 모른다. */
const data = bitwiseOpsFacet.initialData as unknown as BitwiseOpsData;

/**
 * 사양의 실측표. 화면도 IR 도 아닌 제삼의 자리에서 온 값이라, 둘이 사이좋게
 * 같이 틀리는 경우를 잡는다.
 */
const EXPECTED = [
  { op: 'and', bits: '01010100', value: 84, ones: 3, flips: 2 },
  { op: 'or', bits: '11111110', value: 254, ones: 7, flips: 2 },
  { op: 'xor', bits: '10101010', value: 170, ones: 4, flips: 5 },
  { op: 'not', bits: '00101001', value: 41, ones: 3, flips: 8 },
  { op: 'shl', bits: '10101100', value: 172, ones: 4, flips: 5 },
  { op: 'shr', bits: '01101011', value: 107, ones: 5, flips: 6 },
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// IR 을 걸어 다니며 지나가는 모든 중간값을 세는 계산기.
//
// `ir-interpreter` 를 쓰지 않고 따로 두는 까닭은 그것이 **답만** 돌려주기
// 때문이다. 32비트 천장은 답이 아니라 도중에 스치는 값의 문제라, 도중을 볼 수
// 있는 계산기가 따로 있어야 한다.
//
// 스코프는 함수 호출마다 평평한 표 하나다. 이 IR 은 안쪽 블록이 바깥 이름을
// 가리는 자리가 없어 그것으로 충분하고, 충분한지는 아래 검사가 `ir-interpreter`
// 와 답을 견주어 스스로 증명한다.
// ─────────────────────────────────────────────────────────────────────────────

type Val = number | boolean;
type Frame = Map<string, Val>;
type Ctl = { done: true; value: number } | { done: false };

function traceRun(ir: IR, entry: string, args: number[], seen: number[]): number {
  const fns = new Map(ir.functions.map((f) => [f.name, f]));

  const note = (v: number): number => {
    seen.push(v);
    return v;
  };

  function applyBin(op: string, l: Val, r: Val): Val {
    const a = Number(l);
    const b = Number(r);
    switch (op) {
      case '+':
        return note(a + b);
      case '-':
        return note(a - b);
      case '*':
        return note(a * b);
      case '//':
        return note(Math.floor(a / b));
      case '%':
        return note(a % b);
      case '<':
        return a < b;
      case '>=':
        return a >= b;
      case '==':
        return a === b;
      default:
        // `&&` 는 ir-interpreter 에서 짧은 회로가 아니라 오른쪽이 늘 셈해진다.
        // 이 IR 은 그것을 쓰지 않기로 했으므로 여기 닿으면 규약이 깨진 것이다.
        throw new Error(`이 IR 에 없어야 하는 연산: ${op}`);
    }
  }

  function evalExpr(e: IRExpr, frame: Frame): Val {
    switch (e.kind) {
      case 'lit':
        return typeof e.value === 'number' ? e.value : Number(e.value);
      case 'var': {
        const v = frame.get(e.name);
        if (v === undefined) throw new Error(`미정의 변수: ${e.name}`);
        return v;
      }
      case 'binop':
        return applyBin(e.op, evalExpr(e.l, frame), evalExpr(e.r, frame));
      case 'call':
        return note(callFn(e.fn, e.args.map((a) => evalExpr(a, frame))));
      default:
        // 배열 · len · 단항은 이 IR 에 없다. 생기면 32비트 논증을 다시 해야 한다.
        throw new Error(`이 IR 에 없어야 하는 식: ${e.kind}`);
    }
  }

  function exec(stmts: IRStmt[], frame: Frame): Ctl {
    for (const s of stmts) {
      switch (s.kind) {
        case 'comment':
          break;
        case 'var':
          frame.set(s.name, Number(evalExpr(s.init, frame)));
          break;
        case 'assign': {
          if (s.target.kind !== 'var') throw new Error('이 IR 은 변수에만 대입한다');
          frame.set(s.target.name, Number(evalExpr(s.expr, frame)));
          break;
        }
        case 'if': {
          const taken = evalExpr(s.cond, frame) ? s.then : s.else ?? [];
          const c = exec(taken, frame);
          if (c.done) return c;
          break;
        }
        case 'while': {
          let guard = 0;
          while (evalExpr(s.cond, frame)) {
            guard += 1;
            if (guard > 10_000) throw new Error('루프가 멎지 않는다');
            const c = exec(s.body, frame);
            if (c.done) return c;
          }
          break;
        }
        case 'return':
          return { done: true, value: s.expr ? Number(evalExpr(s.expr, frame)) : 0 };
        default:
          throw new Error(`이 IR 에 없어야 하는 문: ${s.kind}`);
      }
    }
    return { done: false };
  }

  function callFn(name: string, argv: Val[]): number {
    const fn = fns.get(name);
    // 예약 수학 이름(exp · log · sqrt · abs · max · min · floor)은 ir.functions 에
    // 없으므로 여기서 걸린다. 이 IR 은 그중 하나도 쓰지 않는다.
    if (fn === undefined) throw new Error(`IR 밖의 함수를 부른다: ${name}`);
    const frame: Frame = new Map();
    fn.params.forEach((p, i) => frame.set(p.name, Number(argv[i])));
    const c = exec(fn.body, frame);
    return c.done ? c.value : 0;
  }

  return callFn(entry, args);
}

/** IR 안의 모든 phase 이름. */
function phasesOfIR(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if (s.kind !== 'comment' && s.phase !== undefined) out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        walk(s.else ?? []);
      } else if (s.kind === 'while' || s.kind === 'for-range') {
        walk(s.body);
      }
    }
  };
  for (const f of ir.functions) walk(f.body);
  return out;
}

/** IR 이 쓰는 모든 이름 — 함수 · 매개변수 · 지역 변수. */
function identifiersOfIR(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if (s.kind === 'var') out.add(s.name);
      if (s.kind === 'if') {
        walk(s.then);
        walk(s.else ?? []);
      } else if (s.kind === 'while' || s.kind === 'for-range') {
        walk(s.body);
      }
    }
  };
  for (const f of ir.functions) {
    out.add(f.name);
    for (const p of f.params) out.add(p.name);
    walk(f.body);
  }
  return out;
}

describe('비트 연산 — 화면', () => {
  it('여섯 연산의 결과가 사양 실측표와 같다', () => {
    const rows = EXPECTED.map((_, code) => {
      const r = computeBitwiseOpsResult(data, code);
      return { bits: r.bits.join(''), value: r.value, ones: r.onesCount, flips: r.flipCount };
    });
    expect(rows).toEqual(
      EXPECTED.map((e) => ({ bits: e.bits, value: e.value, ones: e.ones, flips: e.flips })),
    );
  });

  it('두 피연산자의 비트열이 선언한 값과 맞는다', () => {
    expect(bitsOf(data.a, data.width).join('')).toBe('11010110');
    expect(bitsOf(data.b, data.width).join('')).toBe('01111100');
  });

  /*
   * 손잡이가 논증을 진다 — 같은 두 수에 규칙만 갈아 끼우는데 결과가 갈리지
   * 않으면 슬라이더가 있어도 아무 뜻이 없다 (whole-batch-protocol 의 조작 실측).
   */
  it('연산마다 결과가 갈린다 — 값도, 켜진 비트 수도', () => {
    const values = EXPECTED.map((_, code) => computeBitwiseOpsResult(data, code).value);
    expect(new Set(values).size).toBe(6);
    const ones = EXPECTED.map((_, code) => computeBitwiseOpsResult(data, code).onesCount);
    expect(new Set(ones).size).toBeGreaterThan(2);
    const flips = EXPECTED.map((_, code) => computeBitwiseOpsResult(data, code).flipCount);
    expect(new Set(flips).size).toBeGreaterThan(2);
  });
});

describe('비트 연산 — 코드 패널과 화면', () => {
  it('IR 이 셈한 값이 화면이 보이는 값과 여섯 연산 전부에서 같다', () => {
    const rows = EXPECTED.map((_, code) => ({
      ir: runIR(bitwiseOpsImperativeIR, 'bitwiseOp', [data.a, data.b, code, data.width]),
      screen: computeBitwiseOpsResult(data, code).value,
    }));
    expect(rows.map((r) => r.ir)).toEqual(rows.map((r) => r.screen));
    // 그리고 둘 다 실측표와 같다 — 사이좋게 같이 틀린 경우를 가른다.
    expect(rows.map((r) => r.ir)).toEqual(EXPECTED.map((e) => e.value));
  });

  it('phase 어휘가 algorithm 과 irs 에서 정확히 일치한다', () => {
    const src = readFileSync(
      fileURLToPath(new URL('../src/algorithm.ts', import.meta.url)),
      'utf8',
    );
    const fromAlgorithm = new Set([...src.matchAll(/\bphase\('([a-z-]+)'\)/g)].map((m) => m[1]!));
    const fromIR = phasesOfIR(bitwiseOpsImperativeIR);
    expect([...fromAlgorithm].sort()).toEqual([...fromIR].sort());
    // 빈 집합끼리 같아 헛통과하는 것을 막는다.
    expect(fromIR.size).toBe(5);
  });
});

describe('비트 연산 — IR 의 구조', () => {
  /*
   * 이 계산기가 `ir-interpreter` 와 답이 같아야 아래 중간값 셈을 믿을 수 있다.
   * 평평한 스코프로 충분하다는 전제가 여기서 증명된다.
   */
  it('중간값 계산기가 ir-interpreter 와 같은 답을 낸다', () => {
    for (let code = 0; code < 6; code += 1) {
      const seen: number[] = [];
      const mine = traceRun(bitwiseOpsImperativeIR, 'bitwiseOp', [data.a, data.b, code, data.width], seen);
      expect(mine).toBe(runIR(bitwiseOpsImperativeIR, 'bitwiseOp', [data.a, data.b, code, data.width]));
      expect(seen.length).toBeGreaterThan(50);
    }
  });

  it('중간값이 32비트 안에 머문다 — java · C++ · C# 의 int 가 감기지 않는다', () => {
    const INT32_MAX = 2 ** 31 - 1;
    let peak = 0;
    for (let code = 0; code < 6; code += 1) {
      const seen: number[] = [];
      traceRun(bitwiseOpsImperativeIR, 'bitwiseOp', [data.a, data.b, code, data.width], seen);
      for (const v of seen) {
        expect(Number.isInteger(v)).toBe(true);
        peak = Math.max(peak, Math.abs(v));
      }
    }
    expect(peak).toBeLessThanOrEqual(INT32_MAX);
    // irs.ts 머리 주석이 상한을 256 이라 적어 두었다. 그 수가 사실인지 재 둔다 —
    // 주석과 코드가 어긋나면 다음 사람의 점검을 막는다.
    expect(peak).toBe(256);
  });

  /*
   * 위 32비트 논증은 **자리 폭이 8 이고 피연산자가 한 바이트라는 것**에 기대고
   * 있다. 그 전제가 무너지면 논증도 무너지므로 전제 자체를 잠근다.
   */
  it('32비트 논증이 기대는 전제가 선언에 그대로 있다', () => {
    expect(data.width).toBe(8);
    expect(data.a).toBeLessThan(256);
    expect(data.b).toBeLessThan(256);
    expect(topWeight(data.width)).toBe(128);
    expect(data.ops).toEqual(['and', 'or', 'xor', 'not', 'shl', 'shr']);
  });

  /*
   * 예약어는 한 언어에서만 조용히 깨진다 — `out` 과 `base` 가 C# 에서만 죽은
   * 전례가 셋이다 (S-transpiler). `and` · `or` · `not` 은 파이썬 예약어라
   * 함수 이름으로 쓸 수 없어 `applyRule` 에 코드 번호로 넘겼다.
   */
  it('IR 의 이름이 여섯 언어 어디서도 예약어가 아니다', () => {
    const reserved = new Set([
      // python
      'and', 'or', 'not', 'is', 'in', 'from', 'pass', 'lambda', 'global', 'def', 'del', 'None',
      // C#
      // `value` 는 여기 없다 — C# 의 **문맥** 키워드라 매개변수 이름으로 쓸 수 있고,
      // 저장소의 다른 IR 둘도 쓰고 있다 (S-transpiler 가 예약어와 가려 적어 두었다).
      'base', 'out', 'ref', 'params', 'event', 'lock', 'checked', 'fixed', 'sealed', 'object',
      'string', 'new', 'this', 'operator',
      // java
      'final', 'synchronized', 'native', 'static', 'public', 'private', 'abstract',
      // cpp
      'template', 'typename', 'delete', 'namespace', 'using',
      // js / ts
      'var', 'let', 'const', 'function', 'class', 'typeof', 'enum', 'interface', 'implements',
      'yield', 'await', 'return', 'case', 'default', 'with', 'int', 'double', 'float', 'bool',
    ]);
    const used = [...identifiersOfIR(bitwiseOpsImperativeIR)];
    expect(used.filter((n) => reserved.has(n))).toEqual([]);
    // 이름을 하나도 못 모으면 위 검사가 헛통과한다.
    expect(used.length).toBeGreaterThan(10);
  });
});
