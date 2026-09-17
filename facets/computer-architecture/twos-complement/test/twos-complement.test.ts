/**
 * 화면에 뜨는 수가 참값과 같은지, 그리고 코드 패널이 같은 답을 내는지 잰다.
 *
 * 근거의 정본은 스크래치가 아니라 이 파일이다 — 사다리도 손잡이 값도 `facet.ts` 에서
 * 읽으므로 선언이 바뀌면 여기가 같이 움직인다.
 *
 * 잠그는 것 아홉.
 *   1. 선언이 1차 데이터만 준다 — 범위도 개수도 자리 무게도 적혀 있지 않다.
 *   2. 네 폭 전부에서 두 읽음이 사양의 대조표와 같다.
 *   3. 폭을 키우면 같은 비트열의 2의 보수 값이 음수에서 양수로 넘어간다 (이 완제품의 주장).
 *   4. IR 이 셈하는 값과 algorithm 이 셈하는 값이 **네 폭 전부에서** 같다.
 *   5. IR 의 중간값이 32비트 안에 머문다 — 값이 아니라 **짜임**으로 잠근다.
 *   6. phase 집합이 algorithm 과 IR 에서 같다 (C3).
 *   7. 여섯 언어가 다 성한 코드를 낸다.
 *   8. 계기에는 선언된 이름의 정수만 실린다.
 *   9. 그림이 서고, 큰 수가 쉼표로 끊겨 뜬다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  IR,
  IRExpr,
  IRStmt,
  LocaleStr,
} from '@ffacet/core/runtime';
import { mountView } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { twosComplementAlgorithm, type TwosComplementData } from '../src/algorithm.js';
import { twosComplementFacet } from '../src/facet.js';
import { twosComplementImperativeIR } from '../src/irs.js';
import { twosComplementStageView, STAGE_H, groupDigits } from '../src/twos-complement-stage.js';

/** 선언에서 읽는다. 수를 이 파일에 옮겨 적으면 대조가 아니라 복사가 된다. */
const declared = twosComplementFacet.initialData as unknown as TwosComplementData;

const INT_MAX = 2 ** 31 - 1;
const INT_MIN = -(2 ** 31);

/** 손잡이가 고르는 폭. 이것도 선언이 정한다. */
function handleValues(): number[] {
  const bar = twosComplementFacet.blocks.controls as { controls?: unknown };
  const list = Array.isArray(bar.controls) ? bar.controls : [];
  for (const raw of list) {
    const c = raw as { action?: unknown; segments?: unknown };
    if (c.action !== 'width' || !Array.isArray(c.segments)) continue;
    return (c.segments as Array<{ value: unknown }>)
      .map((s) => s.value)
      .filter((v): v is number => typeof v === 'number');
  }
  return [];
}

/** 슬라이더가 처음 짚는 자리. */
function handleDefault(): number | null {
  const bar = twosComplementFacet.blocks.controls as { controls?: unknown };
  const list = Array.isArray(bar.controls) ? bar.controls : [];
  for (const raw of list) {
    const c = raw as { action?: unknown; segments?: unknown };
    if (c.action !== 'width' || !Array.isArray(c.segments)) continue;
    const hit = (c.segments as Array<{ value: unknown; default?: unknown }>).find(
      (s) => s.default === true,
    );
    return typeof hit?.value === 'number' ? hit.value : null;
  }
  return null;
}

type BitsPayload = { index: number; value: number; width: number; bits: number[] };
type ReadPayload = {
  index: number;
  value: number;
  width: number;
  reading: number;
  terms: number[];
};
type SpanPayload = {
  width: number;
  lowest: number;
  highest: number;
  valueCount: number;
  negativeCount: number;
};

type Run = { events: FacetRuntimeEvent[]; metrics: Record<string, number>; deltas: number[] };

/** 폭 하나로 한 판만 돌리고 멈추는 최소 컨텍스트. */
async function run(width: number): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const deltas: number[] = [];
  const ctx = {
    data: { ...declared, width, stepMs: 0 },
    cancelled: false,
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
    },
    metric(name: string, delta: number | 'inc'): void {
      const d = delta === 'inc' ? 1 : delta;
      deltas.push(d);
      metrics[name] = (metrics[name] ?? 0) + d;
    },
    // 한 판을 마친 뒤의 대기는 곧 취소로 본다 — 손잡이를 밀지 않고 끝낸다.
    async waitForInput(): Promise<{ type: string }> {
      throw new Error('cancelled');
    },
    pollInput(): null {
      return null;
    },
    async sleep(): Promise<boolean> {
      return true;
    },
  };
  try {
    await twosComplementAlgorithm(ctx as unknown as FacetContext<TwosComplementData>);
  } catch (err) {
    if ((err as Error).message !== 'cancelled') throw err;
  }
  return { events, metrics, deltas };
}

function payloads<T>(events: FacetRuntimeEvent[], type: string): T[] {
  return events.filter((e) => e.type === type).map((e) => e.payload as T);
}

/** 선언을 보지 않고 여기서 다시 셈한 참값. 대조의 상대다. */
function truth(value: number, width: number): { bits: number[]; plain: number; signed: number } {
  const bits: number[] = [];
  let rest = value;
  for (let place = 0; place < width; place += 1) {
    bits.push(rest % 2);
    rest = Math.floor(rest / 2);
  }
  let plain = 0;
  for (let place = 0; place < width; place += 1) plain += bits[place] * 2 ** place;
  return { bits, plain, signed: plain - bits[width - 1] * 2 ** width };
}

/** 높은 자리부터 읽은 비트 문자열. */
function bitString(bits: number[], width: number): string {
  let out = '';
  for (let place = width - 1; place >= 0; place -= 1) out += String(bits[place]);
  return out;
}

// ── IR 훑기 ─────────────────────────────────────────────────────────────────

type Scan = {
  lits: number[];
  ops: string[];
  calls: string[];
  types: string[];
  phases: Set<string>;
  /** `*` 의 오른쪽 피연산자 — 전부 리터럴 2 여야 한다. */
  multRight: IRExpr[];
};

function scanExpr(e: IRExpr, acc: Scan): void {
  switch (e.kind) {
    case 'lit':
      if (typeof e.value === 'number') acc.lits.push(e.value);
      return;
    case 'var':
      return;
    case 'index':
      scanExpr(e.arr, acc);
      scanExpr(e.idx, acc);
      return;
    case 'len':
      scanExpr(e.of, acc);
      return;
    case 'binop':
      acc.ops.push(e.op);
      if (e.op === '*') acc.multRight.push(e.r);
      scanExpr(e.l, acc);
      scanExpr(e.r, acc);
      return;
    case 'unop':
      scanExpr(e.x, acc);
      return;
    case 'call':
      acc.calls.push(e.fn);
      for (const a of e.args) scanExpr(a, acc);
      return;
  }
}

function scanStmts(stmts: IRStmt[], acc: Scan): void {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') acc.phases.add(s.phase);
    switch (s.kind) {
      case 'var':
        acc.types.push(s.type.kind);
        scanExpr(s.init, acc);
        break;
      case 'assign':
        scanExpr(s.target, acc);
        scanExpr(s.expr, acc);
        break;
      case 'if':
        scanExpr(s.cond, acc);
        scanStmts(s.then, acc);
        if (s.else) scanStmts(s.else, acc);
        break;
      case 'for-range':
        scanExpr(s.from, acc);
        scanExpr(s.to, acc);
        scanStmts(s.body, acc);
        break;
      case 'while':
        scanExpr(s.cond, acc);
        scanStmts(s.body, acc);
        break;
      case 'return':
        if (s.expr) scanExpr(s.expr, acc);
        break;
      default:
        break;
    }
  }
}

function scan(ir: IR): Scan {
  const acc: Scan = {
    lits: [],
    ops: [],
    calls: [],
    types: [],
    phases: new Set<string>(),
    multRight: [],
  };
  for (const f of ir.functions) {
    acc.types.push(f.returnType.kind);
    for (const p of f.params) acc.types.push(p.type.kind);
    scanStmts(f.body, acc);
  }
  return acc;
}

/**
 * IR 의 짜임을 그대로 흉내 내어 중간값의 위아래 끝을 잰다.
 *
 * 셈하는 것이 아니라 **밟아 보는** 것이다 — 인터프리터는 배정도라 넘쳐도 통과하므로,
 * 실제로 어떤 수가 지나가는지는 이렇게 재는 수밖에 없다.
 */
function intermediateBounds(value: number, width: number): { lo: number; hi: number } {
  let lo = 0;
  let hi = 0;
  const note = (v: number): void => {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  };

  const bit = (v: number, place: number): number => {
    let rest = v;
    note(rest);
    for (let left = place; left > 0; left -= 1) {
      rest = Math.floor(rest / 2);
      note(rest);
    }
    return rest % 2;
  };

  let plain = 0;
  note(plain);
  for (let place = width - 1; place >= 0; place -= 1) {
    plain = plain * 2 + bit(value, place);
    note(plain);
  }

  let signed = -bit(value, width - 1);
  note(signed);
  for (let place = width - 2; place >= 0; place -= 1) {
    signed = signed * 2 + bit(value, place);
    note(signed);
  }

  let highest = 0;
  note(highest);
  for (let left = width - 1; left > 0; left -= 1) {
    highest = highest * 2 + 1;
    note(highest);
  }
  note(-highest - 1);

  return { lo, hi };
}

// ── 검사 ────────────────────────────────────────────────────────────────────

describe('선언한 데이터', () => {
  it('1차 데이터는 사다리와 시작 폭과 비트열뿐이다', () => {
    expect(Object.keys(declared).sort()).toEqual([
      'patterns',
      'stepMs',
      'type',
      'width',
      'widths',
    ]);
    expect(declared.type).toBe('twos-complement');
    expect(declared.widths).toEqual([4, 8, 16, 32]);
    expect(declared.patterns).toEqual([5, 11, 15, 8]);
  });

  it('파생값을 선언에 적어 두지 않았다', () => {
    const flat = JSON.stringify(declared);
    // 범위 · 값의 개수 · 음수의 개수 · 자리 무게는 전부 그 자리에서 셈한다.
    for (const derived of [
      '4294967296',
      '2147483648',
      '2147483647',
      '65536',
      '32768',
      '32767',
      '128',
      '127',
      '-8',
    ]) {
      expect(flat, derived).not.toContain(derived);
    }
  });

  it('손잡이 값이 사다리와 같고 처음 자리가 선언과 맞는다', () => {
    expect(handleValues()).toEqual(declared.widths);
    expect(handleDefault()).toBe(declared.width);
  });

  it('title 이 카드 이름을 앞세운다 (C4)', () => {
    expect((twosComplementFacet.title as Record<string, string>).ko).toMatch(/^2의 보수 —/);
  });

  it('완제품이라 조각 표식을 달지 않는다', () => {
    // `@piece` 표식은 조각 전수 검사가 세는 것이다. 완제품이 달면 그 수가 어긋난다.
    expect(JSON.stringify(twosComplementFacet)).not.toContain('@piece');
  });
});

describe('같은 비트열의 두 읽음', () => {
  it('네 비트에서 사양의 대조표와 같다', async () => {
    /** 사양의 4비트 표. 이 넷이 이 완제품이 서는 근거다. */
    const expected: Record<string, { bits: string; plain: number; signed: number }> = {
      '5': { bits: '0101', plain: 5, signed: 5 },
      '11': { bits: '1011', plain: 11, signed: -5 },
      '15': { bits: '1111', plain: 15, signed: -1 },
      '8': { bits: '1000', plain: 8, signed: -8 },
    };

    const { events } = await run(4);
    const laid = payloads<BitsPayload>(events, 'bits-laid');
    const plain = payloads<ReadPayload>(events, 'read-unsigned');
    const signed = payloads<ReadPayload>(events, 'read-twos');

    expect(laid).toHaveLength(declared.patterns.length);
    laid.forEach((p, i) => {
      const want = expected[String(p.value)];
      expect(want, `비트열 ${p.value}`).toBeDefined();
      expect(bitString(p.bits, 4)).toBe(want!.bits);
      expect(plain[i]!.reading).toBe(want!.plain);
      expect(signed[i]!.reading).toBe(want!.signed);
    });
  });

  it('맨 윗자리가 1 이면 2의 보수 해석에서 예외 없이 음수다', async () => {
    for (const width of handleValues()) {
      const { events } = await run(width);
      const laid = payloads<BitsPayload>(events, 'bits-laid');
      const signed = payloads<ReadPayload>(events, 'read-twos');
      laid.forEach((p, i) => {
        const top = p.bits[width - 1];
        expect(signed[i]!.reading < 0, `폭 ${width} 의 ${p.value}`).toBe(top === 1);
      });
    }
  });

  it('셈이 화면에 적히는 꼴 그대로다 — 1011 은 −8 + 2 + 1 이라 −5 다', async () => {
    const { events } = await run(4);
    const signed = payloads<ReadPayload>(events, 'read-twos');
    const eleven = signed.find((p) => p.value === 11);
    expect(eleven).toBeDefined();
    expect(eleven!.terms).toEqual([-8, 2, 1]);
    expect(eleven!.terms.reduce((a, b) => a + b, 0)).toBe(-5);
    expect(eleven!.reading).toBe(-5);
  });

  it('폭을 키우면 부호 없는 값은 그대로이고 2의 보수 값이 양수가 된다', async () => {
    // 이 완제품의 주장이다 — 비트열이 같아도 폭이 달라지면 뜻이 달라진다.
    const narrow = await run(4);
    const wide = await run(8);
    const plainNarrow = payloads<ReadPayload>(narrow.events, 'read-unsigned').map((p) => p.reading);
    const plainWide = payloads<ReadPayload>(wide.events, 'read-unsigned').map((p) => p.reading);
    const signedNarrow = payloads<ReadPayload>(narrow.events, 'read-twos').map((p) => p.reading);
    const signedWide = payloads<ReadPayload>(wide.events, 'read-twos').map((p) => p.reading);

    // 앞을 0 으로 채우므로 부호 없는 값은 폭을 타지 않는다.
    expect(plainWide).toEqual(plainNarrow);
    expect(plainNarrow).toEqual(declared.patterns);
    // 2의 보수 값은 폭을 탄다. 네 칸에서 음수이던 셋이 여덟 칸에서 양수가 된다.
    expect(signedNarrow).toEqual([5, -5, -1, -8]);
    expect(signedWide).toEqual(declared.patterns);
    expect(signedNarrow.filter((v) => v < 0)).toHaveLength(3);
    expect(signedWide.filter((v) => v < 0)).toHaveLength(0);
  });

  it('폭마다 범위와 개수가 참값과 같다', async () => {
    /** 사양의 손잡이 표. */
    const expected: Record<number, [number, number, number, number]> = {
      4: [-8, 7, 16, 8],
      8: [-128, 127, 256, 128],
      16: [-32768, 32767, 65536, 32768],
      32: [-2147483648, 2147483647, 4294967296, 2147483648],
    };
    for (const width of handleValues()) {
      const { events } = await run(width);
      const span = payloads<SpanPayload>(events, 'span-set')[0]!;
      const [lowest, highest, valueCount, negativeCount] = expected[width]!;
      expect({ ...span }, `폭 ${width}`).toEqual({
        width,
        lowest,
        highest,
        valueCount,
        negativeCount,
      });
      // 음수가 하나 더 많다 — 0 이 양수 쪽 자리를 하나 쓴다.
      expect(negativeCount).toBe(valueCount / 2);
      expect(highest + 1).toBe(-lowest);
    }
  });
});

describe('코드 패널', () => {
  it('IR 이 셈하는 값과 algorithm 이 셈하는 값이 네 폭 전부에서 같다', async () => {
    for (const width of handleValues()) {
      const { events } = await run(width);
      const laid = payloads<BitsPayload>(events, 'bits-laid');
      const plain = payloads<ReadPayload>(events, 'read-unsigned');
      const signed = payloads<ReadPayload>(events, 'read-twos');
      const span = payloads<SpanPayload>(events, 'span-set')[0]!;

      laid.forEach((p, i) => {
        const at = `폭 ${width} 의 ${p.value}`;
        const want = truth(p.value, width);
        // 화면과 참값
        expect(p.bits, at).toEqual(want.bits);
        expect(plain[i]!.reading, at).toBe(want.plain);
        expect(signed[i]!.reading, at).toBe(want.signed);
        // 코드 패널과 화면
        expect(runIR(twosComplementImperativeIR, 'readUnsigned', [p.value, width]), at).toBe(
          plain[i]!.reading,
        );
        expect(runIR(twosComplementImperativeIR, 'readTwos', [p.value, width]), at).toBe(
          signed[i]!.reading,
        );
        for (let place = 0; place < width; place += 1) {
          expect(runIR(twosComplementImperativeIR, 'bitAt', [p.value, place]), `${at} 자리 ${place}`).toBe(
            p.bits[place],
          );
        }
      });

      expect(runIR(twosComplementImperativeIR, 'highestValue', [width]), `폭 ${width}`).toBe(
        span.highest,
      );
      expect(runIR(twosComplementImperativeIR, 'lowestValue', [width]), `폭 ${width}`).toBe(
        span.lowest,
      );
    }
  });

  it('IR 의 중간값이 32비트 안에 머문다 — 짜임으로 잠근다', () => {
    const found = scan(twosComplementImperativeIR);

    // 1. 2의 거듭제곱을 상수로 적지 않는다. 리터럴은 0 · 1 · 2 뿐이다.
    expect([...new Set(found.lits)].sort((a, b) => a - b)).toEqual([0, 1, 2]);
    // 2. 곱셈은 언제나 2 배다 — 접는 셈(호너)이라 중간값이 결과를 넘지 않는다.
    for (const right of found.multRight) {
      expect(right).toEqual({ kind: 'lit', value: 2 });
    }
    // 3. 짧은 회로 함정은 회피가 아니라 제거로 푼다.
    expect(found.ops).not.toContain('&&');
    expect(found.ops).not.toContain('||');
    // 4. 예약 수학 이름을 부르지 않는다 — 부르는 것은 자기 함수뿐이다.
    const own = new Set(twosComplementImperativeIR.functions.map((f) => f.name));
    for (const fn of found.calls) expect(own.has(fn), fn).toBe(true);
    expect([...own]).toEqual(['bitAt', 'readUnsigned', 'readTwos', 'highestValue', 'lowestValue']);
    // 5. 실수가 끼어들 자리가 없다 — 모든 슬롯이 int 라 `//` 도 `double` 을 만나지 않는다.
    expect([...new Set(found.types)]).toEqual(['int']);

    // 6. 실제로 밟아 본 중간값이 int 범위 안이다.
    for (const width of handleValues()) {
      for (const value of declared.patterns) {
        const { lo, hi } = intermediateBounds(value, width);
        expect(hi, `폭 ${width} 의 ${value}`).toBeLessThanOrEqual(INT_MAX);
        expect(lo, `폭 ${width} 의 ${value}`).toBeGreaterThanOrEqual(INT_MIN);
      }
    }

    // 7. 가장 큰 폭에서 천장에 정확히 닿되 넘지 않는다 — 마지막 곱셈 전에 멈추는 꼴.
    expect(runIR(twosComplementImperativeIR, 'highestValue', [32])).toBe(INT_MAX);
    expect(runIR(twosComplementImperativeIR, 'lowestValue', [32])).toBe(INT_MIN);
  });

  it('값의 개수와 음수의 개수는 IR 이 셈하지 않는다', async () => {
    // 폭 32 에서 4,294,967,296 과 2,147,483,648 이라 int 를 넘는다. 화면 쪽만 센다.
    const names = twosComplementImperativeIR.functions.map((f) => f.name);
    expect(names).not.toContain('valueCount');
    expect(names).not.toContain('negativeCount');

    const { events } = await run(32);
    const span = payloads<SpanPayload>(events, 'span-set')[0]!;
    expect(span.valueCount).toBe(2 ** 32);
    expect(span.valueCount).toBeGreaterThan(INT_MAX);
    expect(span.negativeCount).toBeGreaterThan(INT_MAX);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같다', async () => {
    const { events } = await run(4);
    const emitted = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...scan(twosComplementImperativeIR).phases].sort());
    expect([...emitted].sort()).toEqual(['read-twos', 'read-unsigned', 'span', 'unfold']);
    // phase 는 걸음의 경계가 아니므로 silent 다 (C8).
    expect(events.filter((e) => e.type === 'phase').every((e) => e.silent === true)).toBe(true);
    // 시각 변화가 있는 이벤트는 silent 가 아니다.
    expect(events.filter((e) => e.type !== 'phase').every((e) => e.silent === undefined)).toBe(true);
  });
});

describe('여섯 언어 emit (S-transpiler)', () => {
  const ALL = [
    pythonTranspiler,
    javascriptTranspiler,
    typescriptTranspiler,
    javaTranspiler,
    cppTranspiler,
    csharpTranspiler,
  ];

  it.each(ALL.map((t) => [t.id, t] as const))(
    '%s — 다섯 함수가 다 나오고 phase 넷이 모두 붙는다',
    (_id, transpiler) => {
      const res = transpiler.transpile(twosComplementImperativeIR);
      expect(res.lines.length).toBeGreaterThan(20);
      expect(res.lines.filter((l) => l.code.includes('undefined'))).toEqual([]);

      const linePhases = new Set(
        res.lines.map((l) => l.phase).filter((p): p is string => p !== null),
      );
      expect([...linePhases].sort()).toEqual([...scan(twosComplementImperativeIR).phases].sort());

      const all = res.lines.map((l) => l.code).join('\n');
      for (const fn of ['bitAt', 'readUnsigned', 'readTwos', 'highestValue', 'lowestValue']) {
        expect(all).toContain(fn);
      }
      // 셈이 이름 뒤로 사라지지 않는다 — 거듭제곱도 비트 연산도 부르지 않는다.
      expect(all).not.toContain('pow(');
      expect(all).not.toContain('>>');
      expect(all).not.toContain('&');
    },
  );

  it('정수 폭이 유한한 셋에서 실수를 int 슬롯에 담지 않는다', () => {
    for (const transpiler of [javaTranspiler, csharpTranspiler, cppTranspiler]) {
      const all = transpiler
        .transpile(twosComplementImperativeIR)
        .lines.map((l) => l.code)
        .join('\n');
      // 이 IR 에는 실수가 없다 — `floor` 도 `log` 도 닿지 않으므로 담길 일이 없다.
      expect(all, transpiler.id).not.toContain('double');
      expect(all, transpiler.id).not.toContain('Math.floor');
    }
  });
});

describe('걸음과 계기', () => {
  it('걸음은 판 세우기 · 범위 · 비트열마다 셋이다', async () => {
    const { events } = await run(4);
    expect(events.filter((e) => e.type !== 'phase').map((e) => e.type)).toEqual([
      'board-set',
      'span-set',
      'bits-laid',
      'read-unsigned',
      'read-twos',
      'bits-laid',
      'read-unsigned',
      'read-twos',
      'bits-laid',
      'read-unsigned',
      'read-twos',
      'bits-laid',
      'read-unsigned',
      'read-twos',
      'done',
    ]);
  });

  it('계기에는 선언된 이름의 정수만 실린다', async () => {
    const bar = twosComplementFacet.blocks.controls as { metrics?: Array<{ name: string }> };
    const names = (bar.metrics ?? []).map((m) => m.name).sort();
    const { metrics, deltas } = await run(4);

    expect(Object.keys(metrics).sort()).toEqual(names);
    expect(deltas.every((d) => Number.isInteger(d))).toBe(true);
    // 네 칸에서는 넷 중 셋이 갈리고, 자리는 4 × 4 다.
    expect(metrics['sign-flip-count']).toBe(3);
    expect(metrics['bit-count']).toBe(16);
  });

  it('계기는 누적이 아니라 지금 판을 말한다', async () => {
    // 여덟 칸에서는 갈리는 것이 하나도 없다. 누적이면 셋이 남는다.
    const wide = await run(8);
    expect(wide.metrics['sign-flip-count']).toBe(0);
    expect(wide.metrics['bit-count']).toBe(32);
    // 값이 0 이어도 이름은 실린다 — 안 실리면 선언한 계기가 빠진 것과 구별되지 않는다.
    expect(Object.keys(wide.metrics).sort()).toEqual(['bit-count', 'sign-flip-count']);
  });

  it('손잡이를 밀면 그 폭으로 판을 다시 돈다', async () => {
    const events: FacetRuntimeEvent[] = [];
    let pushed = false;
    const ctx = {
      data: { ...declared, width: 4, stepMs: 0 },
      cancelled: false,
      async emit(event: FacetRuntimeEvent): Promise<void> {
        events.push(event);
      },
      metric(): void {},
      async waitForInput(): Promise<{ type: string; payload: unknown }> {
        if (pushed) throw new Error('cancelled');
        pushed = true;
        return { type: 'width', payload: { value: 8, segmentIndex: 1 } };
      },
      pollInput(): null {
        return null;
      },
      async sleep(): Promise<boolean> {
        return true;
      },
    };
    try {
      await twosComplementAlgorithm(ctx as unknown as FacetContext<TwosComplementData>);
    } catch (err) {
      if ((err as Error).message !== 'cancelled') throw err;
    }

    const spans = payloads<SpanPayload>(events, 'span-set');
    expect(spans.map((s) => s.width)).toEqual([4, 8]);
    expect(events.filter((e) => e.type === 'board-set')).toHaveLength(2);
  });

  it('사다리에 없는 폭은 받지 않는다', async () => {
    const events: FacetRuntimeEvent[] = [];
    const sent: number[] = [7, 8];
    let at = 0;
    const ctx = {
      data: { ...declared, width: 4, stepMs: 0 },
      cancelled: false,
      async emit(event: FacetRuntimeEvent): Promise<void> {
        events.push(event);
      },
      metric(): void {},
      async waitForInput(): Promise<{ type: string; payload: unknown }> {
        if (at >= sent.length) throw new Error('cancelled');
        const value = sent[at];
        at += 1;
        return { type: 'width', payload: { value } };
      },
      pollInput(): null {
        return null;
      },
      async sleep(): Promise<boolean> {
        return true;
      },
    };
    try {
      await twosComplementAlgorithm(ctx as unknown as FacetContext<TwosComplementData>);
    } catch (err) {
      if ((err as Error).message !== 'cancelled') throw err;
    }
    // 7 은 사다리에 없으므로 판이 다시 서지 않는다. 8 에서만 선다.
    expect(payloads<SpanPayload>(events, 'span-set').map((s) => s.width)).toEqual([4, 8]);
  });
});

describe('문안', () => {
  const LOCALES = ['en', 'ko', 'ja', 'zh', 'ar', 'es', 'fr', 'hi', 'id', 'pt'];

  it('열 언어를 다 채웠다 — 컨트롤 · 계기 · 코드 패널 라벨까지', () => {
    const bar = twosComplementFacet.blocks.controls as {
      controls?: Array<{ widget?: string; label?: LocaleStr }>;
      metrics?: Array<{ name: string; label: LocaleStr }>;
    };
    const panel = twosComplementFacet.blocks.codePanel as { label?: LocaleStr };
    const tables: Array<[string, LocaleStr]> = [
      ['title', twosComplementFacet.title],
      ['description', twosComplementFacet.description as LocaleStr],
      ...Object.entries(twosComplementFacet.messages ?? {}),
      ...(bar.controls ?? [])
        .filter((c) => c.widget === 'segmented-slider')
        .map((c, i): [string, LocaleStr] => [`control.${i}`, c.label as LocaleStr]),
      ...(bar.metrics ?? []).map((m): [string, LocaleStr] => [`metric.${m.name}`, m.label]),
      ['codePanel', panel.label as LocaleStr],
    ];

    const bad: string[] = [];
    for (const [name, table] of tables) {
      for (const l of LOCALES) {
        if (typeof (table as Record<string, unknown>)[l] !== 'string') bad.push(`${name}.${l}`);
      }
    }
    expect(bad).toEqual([]);
    // 검사가 빈껍데기가 되지 않게 하는 하한.
    expect(tables.length).toBeGreaterThanOrEqual(15);
  });

  it('자리표 집합이 열 언어에서 같다', () => {
    const bad: string[] = [];
    for (const [key, table] of Object.entries(twosComplementFacet.messages ?? {})) {
      const rows = table as Record<string, string>;
      const want = [...new Set([...(rows.en ?? '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
      for (const [locale, value] of Object.entries(rows)) {
        const got = [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
        if (got.join(',') !== want.join(',')) {
          bad.push(`${key} [${locale}] ${got.join(',')} != ${want.join(',')}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});

describe('화면', () => {
  it('큰 수는 쉼표로 끊고 음수는 빼기 기호로 적는다', () => {
    expect(groupDigits(2 ** 32)).toBe('4,294,967,296');
    expect(groupDigits(INT_MIN)).toBe('−2,147,483,648');
    expect(groupDigits(7)).toBe('7');
    expect(groupDigits(-8)).toBe('−8');
  });

  it('가장 넓은 폭에서도 그림이 서고 수가 끊겨 뜬다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = twosComplementStageView;
    expect(view.canvas.height).toBe(STAGE_H);

    const instance = mountView(view, container, {
      config: {},
      locale: 'en',
      theme: 'light',
      initialData: { width: 32, patterns: declared.patterns },
    }) as unknown as {
      setSpan(v: {
        lowest: number;
        highest: number;
        valueCount: number;
        negativeCount: number;
      }): void;
      layBits(v: { index: number; bits: number[] }): void;
      destroy(): void;
    };

    instance.setSpan({
      lowest: INT_MIN,
      highest: INT_MAX,
      valueCount: 2 ** 32,
      negativeCount: 2 ** 31,
    });
    instance.layBits({ index: 1, bits: truth(11, 32).bits });

    const glyphs = [...container.querySelectorAll('text')].map((n) => n.textContent ?? '');
    expect(container.querySelectorAll('svg')).toHaveLength(1);
    expect(glyphs.some((g) => g.includes('4,294,967,296'))).toBe(true);
    expect(glyphs.some((g) => g.includes('−2,147,483,648'))).toBe(true);
    // 안 끊긴 네 자리 이상은 없다. 지수 표기(2^31)는 값이 아니라 표식이다.
    expect(glyphs.filter((g) => /\d{4,}/.test(g))).toEqual([]);
    // 맨 윗자리의 무게만 음수로 적힌다.
    expect(glyphs.filter((g) => g.startsWith('−2^'))).toEqual(['−2^31']);

    instance.destroy();
    container.remove();
  });

  it('마운트한 뒤 캔버스 세로가 변하지 않는다', async () => {
    const { clearRegistry, runFacet } = await import('@ffacet/core/runtime');
    const { registerTwosComplement } = await import('../src/index.js');
    clearRegistry();
    registerTwosComplement();

    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]): void => {
      errors.push(args);
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(twosComplementFacet, container);
    try {
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      const before = svg!.getAttribute('viewBox');
      expect(svg!.childNodes.length).toBeGreaterThan(0);

      await new Promise((r) => setTimeout(r, 1_800));

      expect(svg!.getAttribute('viewBox')).toBe(before);
      expect(svg!.querySelectorAll('rect').length).toBeGreaterThan(4);
      const texts = [...svg!.querySelectorAll('text')].map((t) => t.textContent ?? '');
      // 캡션이 실제로 문장으로 뜬다.
      expect(texts.some((s) => s.length > 20)).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      handle.destroy();
      container.remove();
      console.error = original;
    }
  }, 20_000);
});
