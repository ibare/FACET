/**
 * IR 과 화면이 네 폭 전부에서 **같은 자리**를 가리키는지, 그리고 IR 의 중간값이
 * 32비트 안에 머무는 **구조**를 잠근다.
 *
 * 값만 확인하는 검사로는 모자란다. `ir-interpreter` 는 배정도라 32비트 천장이
 * 없으므로, 넘치는 곱셈이 IR 에 들어와도 인터프리터는 통과시키고 java · C++ ·
 * C# 만 조용히 다른 답을 낸다 — **대조하는 수단에 그 벽이 없어 원리적으로 안
 * 걸린다.** 그래서 여기서 잠그는 것은 둘이다.
 *
 *   1. 값  — 네 폭 × 두 수열 여덟 자리에서 중간값이 2,147,483,647 이하인가.
 *   2. 구조 — 누산기를 키우는 곱셈·덧셈이 `limit` 판정의 가지 안에만 있는가.
 *
 * 참값은 이 파일이 `bigint` 로 따로 셈한다. 사양의 표를 옮겨 적으면 대조가
 * 아니라 복사가 된다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import type {
  FacetContext,
  FacetRuntimeEvent,
  IRExpr,
  IRStmt,
  ViewInstance,
} from '@ffacet/core/runtime';
import { mountView } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

import { integerOverflowAlgorithm, type IntegerOverflowData } from '../src/algorithm.js';
import { integerOverflowFacet } from '../src/facet.js';
import { integerOverflowImperativeIR } from '../src/irs.js';
import { integerOverflowProjector } from '../src/projector.js';
import { integerOverflowStageView } from '../src/integer-overflow-stage.js';

const INT32_MAX = 2_147_483_647;

/** 선언에서 읽는다 — 수를 이 파일에 옮겨 적지 않는다. */
const declared = integerOverflowFacet.initialData as unknown as IntegerOverflowData;

function segmentsOf(action: string): number[] {
  const bar = integerOverflowFacet.blocks.controls as { controls?: unknown };
  const list = Array.isArray(bar.controls) ? bar.controls : [];
  for (const raw of list) {
    const c = raw as { action?: unknown; segments?: unknown };
    if (c.action !== action || !Array.isArray(c.segments)) continue;
    return (c.segments as Array<{ value: unknown }>)
      .map((s) => s.value)
      .filter((v): v is number => typeof v === 'number');
  }
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// 참값 — bigint 로 따로 셈한다.
// ─────────────────────────────────────────────────────────────────────────────

const limitBig = (width: number): bigint => (1n << BigInt(width - 1)) - 1n;

function termsOf(sequence: string): () => bigint {
  if (sequence === 'fibonacci') {
    let a = 0n;
    let b = 1n;
    return () => {
      const cur = b;
      const nxt = a + b;
      a = b;
      b = nxt;
      return cur;
    };
  }
  let acc = 1n;
  let i = 0n;
  return () => {
    i += 1n;
    acc *= i;
    return acc;
  };
}

function wrapBig(value: bigint, width: number): bigint {
  const mod = 1n << BigInt(width);
  let r = ((value % mod) + mod) % mod;
  if (r >= mod >> 1n) r -= mod;
  return r;
}

type Truth = { survived: number; at: number; truth: bigint; wrapped: bigint };

function oracle(width: number, sequence: string): Truth {
  const limit = limitBig(width);
  const next = termsOf(sequence);
  let survived = 0;
  for (let i = 1; i <= declared.maxSteps; i += 1) {
    const v = next();
    if (v > limit) return { survived, at: i, truth: v, wrapped: wrapBig(v, width) };
    survived = i;
  }
  throw new Error(`걸음 상한 안에서 넘치지 않았다: 폭 ${width}, ${sequence}`);
}

const CASES: Array<{ width: number; sequence: string }> = [];
for (const width of segmentsOf('width')) {
  for (const sequence of declared.sequences) CASES.push({ width, sequence });
}

// ─────────────────────────────────────────────────────────────────────────────
// 알고리즘을 한 회차만 굴린다.
// ─────────────────────────────────────────────────────────────────────────────

type RunResult = {
  events: FacetRuntimeEvent[];
  metrics: Map<string, number>;
  phases: string[];
};

async function runOnce(width: number, sequence: string): Promise<RunResult> {
  const data: IntegerOverflowData = { ...declared, width, sequence };
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const phases: string[] = [];
  let cancelled = false;

  const ctx = {
    data,
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
      if (event.type === 'phase') {
        const p = event.payload as { phase?: unknown };
        if (typeof p?.phase === 'string') phases.push(p.phase);
      }
    },
    metric(name: string, delta: number | 'inc'): void {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    // 한 회차가 끝나면 여기로 온다. 취소로 세워 알고리즘을 정상 종료시킨다.
    async waitForInput(): Promise<never> {
      cancelled = true;
      throw new Error('cancelled');
    },
    pollInput(): null {
      return null;
    },
    async sleep(): Promise<boolean> {
      return !cancelled;
    },
  };

  await integerOverflowAlgorithm(ctx as unknown as FacetContext<IntegerOverflowData>);
  return { events, metrics, phases };
}

function payloadOf(events: FacetRuntimeEvent[], type: string): Record<string, number> {
  const hit = events.find((e) => e.type === type);
  return (hit?.payload ?? {}) as Record<string, number>;
}

// ─────────────────────────────────────────────────────────────────────────────
// IR 을 눈금 달린 채로 실행한다 — 모든 중간값을 기록한다.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 이 IR 이 쓰는 노드만 다루는 작은 실행기. `ir-interpreter` 는 중간값을 내주지
 * 않으므로, **중간값 최대치를 재려면** 여기서 한 번 더 셈하는 수밖에 없다.
 */
function traceIR(width: number, steps: number, mode: number): { kept: number; peak: number } {
  const env = new Map<string, number>();
  let peak = 0;
  const see = (v: number): number => {
    if (Number.isFinite(v) && Math.abs(v) > peak) peak = Math.abs(v);
    return v;
  };

  const fn = integerOverflowImperativeIR.functions[0];
  if (fn === undefined) throw new Error('IR 에 함수가 없다');
  env.set('width', see(width));
  env.set('steps', see(steps));
  env.set('mode', see(mode));

  function evalExpr(e: IRExpr): number {
    switch (e.kind) {
      case 'lit':
        return see(Number(e.value));
      case 'var': {
        const v = env.get(e.name);
        if (v === undefined) throw new Error(`미정의 변수: ${e.name}`);
        return v;
      }
      case 'binop': {
        const l = evalExpr(e.l);
        const r = evalExpr(e.r);
        switch (e.op) {
          case '+':
            return see(l + r);
          case '-':
            return see(l - r);
          case '*':
            return see(l * r);
          case '//':
            return see(Math.floor(l / r));
          case '>':
            return (l > r ? 1 : 0) as number;
          case '==':
            return (l === r ? 1 : 0) as number;
          default:
            throw new Error(`이 검사가 다루지 않는 연산: ${e.op}`);
        }
      }
      default:
        throw new Error(`이 검사가 다루지 않는 식: ${e.kind}`);
    }
  }

  let returned: number | null = null;
  function exec(stmts: IRStmt[]): boolean {
    for (const s of stmts) {
      switch (s.kind) {
        case 'comment':
          break;
        case 'var':
          env.set(s.name, evalExpr(s.init));
          break;
        case 'assign': {
          if (s.target.kind !== 'var') throw new Error('이 검사는 변수 대입만 다룬다');
          env.set(s.target.name, evalExpr(s.expr));
          break;
        }
        case 'if': {
          const branch = evalExpr(s.cond) !== 0 ? s.then : (s.else ?? []);
          if (exec(branch)) return true;
          break;
        }
        case 'for-range': {
          const from = evalExpr(s.from);
          const to = evalExpr(s.to);
          for (let i = from; s.inclusive ? i <= to : i < to; i += 1) {
            env.set(s.var, see(i));
            if (exec(s.body)) return true;
          }
          break;
        }
        case 'return':
          returned = s.expr ? evalExpr(s.expr) : 0;
          return true;
        default:
          throw new Error(`이 검사가 다루지 않는 문: ${s.kind}`);
      }
    }
    return false;
  }

  exec(fn.body);
  if (returned === null) throw new Error('IR 이 값을 돌려주지 않았다');
  return { kept: returned, peak };
}

// ─────────────────────────────────────────────────────────────────────────────
// 구조 잠그개 — 누산기를 키우는 셈이 판정의 가지 안에만 있는가.
// ─────────────────────────────────────────────────────────────────────────────

const ACCUMULATORS = new Set(['acc', 'prev']);

function varsIn(e: IRExpr, out: Set<string> = new Set()): Set<string> {
  if (e.kind === 'var') out.add(e.name);
  else if (e.kind === 'binop') {
    varsIn(e.l, out);
    varsIn(e.r, out);
  } else if (e.kind === 'unop') varsIn(e.x, out);
  else if (e.kind === 'index') {
    varsIn(e.arr, out);
    varsIn(e.idx, out);
  } else if (e.kind === 'call') for (const a of e.args) varsIn(a, out);
  else if (e.kind === 'len') varsIn(e.of, out);
  return out;
}

/** 누산기를 키우는 셈(`*` / `+`)을 모은다. */
function growthOps(e: IRExpr, out: IRExpr[] = []): IRExpr[] {
  if (e.kind === 'binop') {
    if (e.op === '*' || e.op === '+') {
      const names = varsIn(e);
      for (const n of names) {
        if (ACCUMULATORS.has(n)) {
          out.push(e);
          break;
        }
      }
    }
    growthOps(e.l, out);
    growthOps(e.r, out);
  }
  return out;
}

/** 판정 없이 나타난 키우는 셈을 모은다. */
function unguardedGrowth(stmts: IRStmt[], guarded: boolean, out: string[] = []): string[] {
  for (const s of stmts) {
    if (s.kind === 'var' || s.kind === 'assign') {
      const expr = s.kind === 'var' ? s.init : s.expr;
      if (!guarded && growthOps(expr).length > 0) {
        out.push(s.kind === 'var' ? s.name : JSON.stringify(s.target));
      }
    } else if (s.kind === 'if') {
      const guards = varsIn(s.cond).has('limit');
      unguardedGrowth(s.then, guarded || guards, out);
      unguardedGrowth(s.else ?? [], guarded || guards, out);
    } else if (s.kind === 'for-range') {
      unguardedGrowth(s.body, guarded, out);
    } else if (s.kind === 'while') {
      unguardedGrowth(s.body, guarded, out);
    }
  }
  return out;
}

function phasesOf(stmts: IRStmt[], out: Set<string> = new Set()): Set<string> {
  for (const s of stmts) {
    if (s.kind !== 'comment' && s.phase !== undefined) out.add(s.phase);
    if (s.kind === 'if') {
      phasesOf(s.then, out);
      phasesOf(s.else ?? [], out);
    } else if (s.kind === 'for-range' || s.kind === 'while') phasesOf(s.body, out);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────

describe('선언', () => {
  it('1차 데이터만 둔다 — 최대값도 넘는 자리도 적혀 있지 않다', () => {
    expect(Object.keys(declared).sort()).toEqual(
      ['maxSteps', 'sequence', 'sequences', 'type', 'width', 'widths'].sort(),
    );
    expect(declared.widths).toEqual([4, 8, 16, 32]);
    expect(declared.sequences).toEqual(['factorial', 'fibonacci']);
    // 수열 이름은 데이터가 아니라 문안이다.
    for (const id of declared.sequences) {
      expect(integerOverflowFacet.messages?.[`label.${id}`]).toBeDefined();
    }
  });

  it('손잡이 사다리가 데이터의 사다리와 같고, 시작 자리가 선언과 맞는다', () => {
    expect(segmentsOf('width')).toEqual(declared.widths);
    const bar = integerOverflowFacet.blocks.controls as { controls?: unknown };
    const list = Array.isArray(bar.controls) ? bar.controls : [];
    const widthCtl = list.find((c) => (c as { action?: unknown }).action === 'width') as {
      segments: Array<{ value: number; default?: boolean }>;
    };
    expect(widthCtl.segments.find((s) => s.default === true)?.value).toBe(declared.width);
  });

  it('계기는 선언된 이름만 쓴다 (C5)', async () => {
    const bar = integerOverflowFacet.blocks.controls as {
      metrics?: Array<{ name: string }>;
    };
    const names = new Set((bar.metrics ?? []).map((m) => m.name));
    expect([...names].sort()).toEqual(['limit-size', 'survived-count']);
    const { metrics } = await runOnce(declared.width, declared.sequence);
    for (const used of metrics.keys()) expect(names.has(used)).toBe(true);
    for (const n of names) expect(/^[a-z]+(-[a-z]+)*$/.test(n)).toBe(true);
  });
});

describe('IR 과 화면이 같은 자리를 가리킨다', () => {
  it.each(CASES)('폭 $width · $sequence', async ({ width, sequence }) => {
    const want = oracle(width, sequence);
    const mode = declared.sequences.indexOf(sequence);

    // 화면 — 알고리즘이 발신한 것.
    const { events, metrics } = await runOnce(width, sequence);
    const burst = payloadOf(events, 'mark');
    const done = payloadOf(events, 'done');
    const appended = events.filter((e) => e.type === 'append').length;

    expect(done.survived).toBe(want.survived);
    expect(appended).toBe(want.survived);
    expect(burst.index).toBe(want.at);
    expect(String(burst.truth)).toBe(want.truth.toString());
    expect(String(burst.wrapped)).toBe(want.wrapped.toString());
    expect(metrics.get('survived-count')).toBe(want.survived);
    expect(metrics.get('limit-size')).toBe(Number(limitBig(width)));

    // 코드 패널 — IR 이 셈한 것.
    const kept = runIR(integerOverflowImperativeIR, 'survive', [width, declared.maxSteps, mode]);
    expect(kept).toBe(want.survived);

    // 눈금 달린 실행기도 같은 답을 내야 한다 (검사 자신의 건전성).
    expect(traceIR(width, declared.maxSteps, mode).kept).toBe(want.survived);
  });

  it('폭을 올리면 버티는 걸음이 단조로 는다 — 그런데 그릇은 3억 배가 된다', async () => {
    for (const sequence of declared.sequences) {
      const kept = declared.widths.map((w) => oracle(w, sequence).survived);
      for (let i = 1; i < kept.length; i += 1) {
        expect(kept[i]!).toBeGreaterThan(kept[i - 1]!);
      }
    }
    const small = Number(limitBig(declared.widths[0]!));
    const big = Number(limitBig(declared.widths[declared.widths.length - 1]!));
    expect(big / small).toBeGreaterThan(300_000_000);
    // 그릇이 3억 배가 되는 동안 팩토리얼은 아홉 걸음을 더 갈 뿐이다.
    const first = oracle(declared.widths[0]!, 'factorial').survived;
    const last = oracle(declared.widths[declared.widths.length - 1]!, 'factorial').survived;
    expect(last - first).toBe(9);
  });
});

describe('IR 이 32비트 안에 머문다', () => {
  it.each(CASES)('중간값이 천장 아래다 — 폭 $width · $sequence', ({ width, sequence }) => {
    const mode = declared.sequences.indexOf(sequence);
    const { peak } = traceIR(width, declared.maxSteps, mode);
    expect(peak).toBeLessThanOrEqual(INT32_MAX);
    // 중간값의 꼭대기는 **그릇의 최대값이거나 걸음 상한**이고 그 밖의 무엇도
    // 그보다 커지지 않는다. 누산기가 그릇을 넘는 순간이 한 번도 없다는 뜻이다.
    // 폭 4 에서는 그릇(7)보다 걸음 상한(48)이 커서 그쪽이 꼭대기가 된다 —
    // 걸음을 세는 수이지 담기는 값이 아니다.
    expect(peak).toBe(Math.max(Number(limitBig(width)), declared.maxSteps));
  });

  it('누산기를 키우는 셈은 판정의 가지 안에만 있다 — 구조를 잠근다', () => {
    const fn = integerOverflowImperativeIR.functions[0]!;
    expect(unguardedGrowth(fn.body, false)).toEqual([]);
  });

  it('넘칠 수 있는 곱셈은 반드시 나눗셈 판정을 짝으로 가진다', () => {
    const json = JSON.stringify(integerOverflowImperativeIR);
    // 정수 나눗셈으로 판정한다 — 실수 나눗셈을 쓰면 int 슬롯에 담을 수 없다.
    expect(json).toContain('"//"');
    expect(json).not.toContain('"op":"/"');
    // 거듭제곱은 예약 이름에 없고, 비트 연산은 IR 어휘에 없다.
    expect(json).not.toContain('"pow"');
    // 짧은 회로가 아니므로 조건을 잇지 않는다.
    expect(json).not.toContain('"&&"');
  });
});

describe('phase 어휘', () => {
  it('algorithm 이 내는 집합과 irs 의 집합이 같다 (C3)', async () => {
    const fromIR = phasesOf(integerOverflowImperativeIR.functions[0]!.body);
    const emitted = new Set<string>();
    for (const { width, sequence } of CASES) {
      const { phases } = await runOnce(width, sequence);
      for (const p of phases) emitted.add(p);
    }
    expect([...emitted].sort()).toEqual([...fromIR].sort());
    expect([...fromIR].sort()).toEqual(['check', 'grow', 'init', 'overflow']);
  });

  it('phase 는 걸음의 경계가 아니다 — 언제나 silent 다 (C2)', async () => {
    const { events } = await runOnce(declared.width, declared.sequence);
    for (const e of events) {
      if (e.type === 'phase') expect(e.silent).toBe(true);
      else expect(e.silent).toBeUndefined();
    }
  });

  it('projector 가 phase 를 코드 패널까지 넘긴다', () => {
    const seen: (string | null)[] = [];
    const projector = integerOverflowProjector({
      stage: {} as unknown as ViewInstance,
      codePanel: {
        highlightPhase: (p: string | null) => seen.push(p),
      } as unknown as ViewInstance,
    });
    void projector.onEvent({ type: 'phase', payload: { phase: 'probe' }, silent: true });
    expect(seen).toEqual(['probe']);
  });
});

describe('여섯 언어', () => {
  const TRANSPILERS = [
    pythonTranspiler,
    javascriptTranspiler,
    typescriptTranspiler,
    javaTranspiler,
    cppTranspiler,
    csharpTranspiler,
  ];

  /** 정적 타입 언어 — 여기서만 double 이 int 슬롯에 닿으면 컴파일되지 않는다. */
  const STATIC = new Set(['java', 'cpp', 'csharp']);

  it.each(TRANSPILERS.map((t) => [t.language, t] as const))('%s 가 코드를 낸다', (lang, t) => {
    const { lines } = t.transpile(integerOverflowImperativeIR);
    expect(lines.length).toBeGreaterThan(10);
    const code = lines.map((l) => l.code).join('\n');

    if (STATIC.has(lang)) {
      // 자바 · C# 은 `double → int` 에 명시적 캐스트를 요구한다. 정수 나눗셈이
      // 이쪽에서 `Math.floor` 로 나가면 그 한 언어만 조용히 컴파일되지 않는다
      // (S-transpiler). 이 셋에서는 반드시 `/` 로 나가야 한다.
      expect(code).not.toMatch(/Math\.(Floor|floor|Sqrt|sqrt|Exp|exp|Log|log)/);
      expect(code).toMatch(/limit\s*\/\s*\(/);
    }
    // phase 가 라인 메타로 실려야 코드 패널이 짚는다.
    expect(lines.some((l) => l.phase === 'check')).toBe(true);
    expect(lines.some((l) => l.phase === 'overflow')).toBe(true);
  });

  /**
   * 위의 `Math.floor` 는 js · ts · python 에서는 **정상**이다 — `//`(정수
   * 나눗셈)를 그 언어의 표기로 옮긴 것뿐이다. 진짜로 막아야 하는 것은 IR 이
   * 실수를 돌려주는 수학 이름을 **직접 부르는** 것이고, 그것은 emit 이 아니라
   * IR 에서 본다.
   */
  it('IR 이 실수를 돌려주는 수학 이름을 부르지 않는다 (S-transpiler)', () => {
    const json = JSON.stringify(integerOverflowImperativeIR);
    for (const name of ['exp', 'log', 'sqrt', 'floor']) {
      expect(json).not.toContain(`"fn":"${name}"`);
    }
  });
});

describe('화면', () => {
  it('그림이 서고, 캔버스가 컨테이너에 남고, 세로가 바뀌지 않는다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = integerOverflowStageView;
    const instance = mountView(view, container, {
      config: {},
      locale: 'en',
      theme: 'light',
    }) as ViewInstance & {
      setVessel(w: number, l: number, s: string, m: number): void;
      setStep(i: number, v: number): void;
      setOverflow(i: number, t: number, w: number): void;
      setDone(n: number): void;
    };

    const svg = container.querySelector('svg');
    expect(svg, '러너가 붙인 캔버스가 남아 있어야 한다').not.toBeNull();
    const before = svg?.getAttribute('viewBox');

    const want = oracle(8, 'factorial');
    instance.setVessel(8, Number(limitBig(8)), 'factorial', declared.maxSteps);
    for (let i = 1; i <= want.survived; i += 1) instance.setStep(i, i);
    instance.setOverflow(want.at, Number(want.truth), Number(want.wrapped));
    instance.setDone(want.survived);

    expect(svg?.childNodes.length, '빈 그림이 아니다').toBeGreaterThan(0);
    expect(svg?.getAttribute('viewBox'), '세로가 바뀌지 않는다').toBe(before);

    // 넘친 뒤 화면에 오는 수는 참이어야 한다 — 8비트의 6! 은 -48 이다.
    expect(svg?.textContent).toContain('-48');

    instance.destroy();
    container.remove();
  });
});
