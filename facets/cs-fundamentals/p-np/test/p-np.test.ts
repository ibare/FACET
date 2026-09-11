/**
 * P/NP 분류 완제품 검사.
 *
 * 이 facet 은 코드 패널을 달았고, 그 패널이 화면과 **같은 답**을 내야 한다.
 * 그러므로 검사의 중심은 하나다 — IR 이 셈한 합과 후보의 수가 algorithm 의 것과
 * **손잡이 여섯 값 전부에서** 같은가.
 *
 *  1. IR ↔ algorithm 전수 대조 (손잡이 6 · 8 · 10 · 12 · 15 · 20)
 *  2. 손잡이 실측 — 확인은 정말 기고 찾기는 정말 뛰는가
 *  3. 32비트 — 값이 아니라 **구조**로 막혀 있는가
 *  4. 여섯 언어 emit
 *  5. phase 어휘 (C3) · 메트릭 (C5) · 자리표 집합 · 선언 정합
 *  6. 화면 — 띄워서 굴려도 던지지 않고, 세로가 바뀌지 않고, 걸음이 800ms 를 넘는가
 *
 * 기대값은 상수로 박지 않는다. 이 파일이 1차 데이터만 읽어 따로 세고 그 결과를
 * algorithm 이 **발신한 것**과 견준다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { runFacet, clearRegistry, registerView } from '@ffacet/core/runtime';
import type {
  FacetContext,
  FacetRuntimeEvent,
  MetricDelta,
  PlainView,
  ViewInstance,
} from '@ffacet/core/runtime';
import type { IRStmt } from '@ffacet/core';

import {
  computePNpResult,
  pNpAlgorithm,
  P_NP_N_CHOICES,
  P_NP_SWEEP_STEPS,
  type PNpData,
} from '../src/algorithm.js';
import { pNpImperativeIR } from '../src/irs.js';
import { pNpFacet } from '../src/facet.js';
import { P_NP_CAPACITY, P_NP_GRID_COLS, P_NP_N_TICKS, P_NP_SHEET } from '../src/p-np-stage.js';
import { registerPNp } from '../src/index.js';

/** 사양이 정한 자료를 선언에서 그대로 읽어 온다 (검사가 자료를 다시 적지 않는다). */
const data = pNpFacet.initialData as unknown as PNpData;

const SIZES = [...P_NP_N_CHOICES];

// ─────────────────────────────────────────────────────────────────────────────
// 0. 이 파일이 따로 세는 전수. 알고리즘의 셈을 빌려 쓰지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

/** 앞 n 개에서 번호가 가장 작은 답을 직접 찾는다. */
function answerHere(n: number): { mask: number; picked: number[]; sum: number } {
  const values = data.values.slice(0, n);
  const total = 2 ** n;
  for (let mask = 0; mask < total; mask += 1) {
    const picked: number[] = [];
    let sum = 0;
    for (let i = 0; i < n; i += 1) {
      if ((mask >> i) % 2 !== 1) continue;
      picked.push(values[i]!);
      sum += values[i]!;
    }
    if (sum === data.target) return { mask, picked, sum };
  }
  throw new Error(`검사: n=${n} 에 답이 없다`);
}

/** 후보의 수를 곱셈 없이 센다 — IR 과 같은 셈법. */
function candidatesHere(n: number): number {
  let total = 1;
  for (let i = 0; i < n; i += 1) total += total;
  return total;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. IR ↔ algorithm 전수 대조
// ─────────────────────────────────────────────────────────────────────────────

/** 손잡이 값 하나로 IR 두 함수를 실제로 돌린다. 배열은 밖에서 받는다. */
function runIrAt(n: number): { sum: number; candidates: number } {
  const nums = data.values.slice(0, n);
  const answer = answerHere(n);
  const pick = Array.from({ length: n }, (_, i) => ((answer.mask >> i) % 2 === 1 ? 1 : 0));
  return {
    sum: runIR(pNpImperativeIR, 'check', [nums, pick, n]) as number,
    candidates: runIR(pNpImperativeIR, 'candidates', [n]) as number,
  };
}

describe('IR 과 algorithm 이 같은 답을 낸다', () => {
  it.each(SIZES.map((n) => [n] as const))(
    'n=%i — 건네받은 후보의 합과 후보의 수가 모두 같다',
    (n) => {
      const ir = runIrAt(n);
      const ts = computePNpResult(data, n);

      expect(ir.sum).toBe(ts.given.sum);
      expect(ir.candidates).toBe(ts.candidates);
      // 견줄 것이 실제로 있었는지 본다 — 둘 다 비면 위 단언이 공허하게 통과한다.
      expect(ir.sum).toBe(data.target);
      expect(ir.candidates).toBe(2 ** n);
      // 이 파일이 따로 센 것과도 같다.
      expect(ir.candidates).toBe(candidatesHere(n));
      expect(ts.given.picked).toEqual(answerHere(n).picked);
    },
  );

  it('IR 의 check 는 고르지 않은 수를 더하지 않는다', () => {
    // 아무것도 안 고른 후보의 합은 0 이고, 전부 고른 후보의 합은 전체 합이다.
    for (const n of SIZES) {
      const nums = data.values.slice(0, n);
      const none = new Array<number>(n).fill(0);
      const all = new Array<number>(n).fill(1);
      expect(runIR(pNpImperativeIR, 'check', [nums, none, n])).toBe(0);
      expect(runIR(pNpImperativeIR, 'check', [nums, all, n])).toBe(
        nums.reduce((a, b) => a + b, 0),
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 손잡이 실측
// ─────────────────────────────────────────────────────────────────────────────

type Run = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

/** 한 판을 끝까지 굴리고 이벤트와 메트릭을 걷는다. */
async function play(n: number): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  let finished = false;
  const ctx = {
    data: { ...data, n },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
      if (event.type === 'done') finished = true;
    },
    metric(name: string, delta: MetricDelta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    get cancelled() {
      // 한 판이 끝나면 취소된 것으로 본다 — 그래야 입력을 기다리지 않고 돌아온다.
      return finished;
    },
    async sleep() {
      return !finished;
    },
    async waitForInput(): Promise<never> {
      throw new Error('cancelled');
    },
  };
  await pNpAlgorithm(ctx as unknown as FacetContext<PNpData>);
  return { events, metrics };
}

function payload(e: FacetRuntimeEvent | undefined): Record<string, unknown> {
  return (e?.payload ?? {}) as Record<string, unknown>;
}

describe('손잡이', () => {
  it('1차 데이터는 수와 목표, 손잡이 시작값과 걸음뿐이다', () => {
    expect(Object.keys(pNpFacet.initialData).sort()).toEqual([
      'n',
      'stepMs',
      'target',
      'type',
      'values',
    ]);
    expect(pNpFacet.initialData.type).toBe('p-np');
    // 손잡이의 끝까지 쓸 수 있을 만큼 수가 있어야 한다.
    expect(data.values.length).toBeGreaterThanOrEqual(Math.max(...SIZES));
  });

  it('찾기는 두 배씩 뛴다 — 수 하나가 늘 때마다 후보가 갑절', async () => {
    const found: number[] = [];
    for (const n of SIZES) {
      const run = await play(n);
      const total = payload(run.events.find((e) => e.type === 'count-candidates')).candidates;
      found.push(total as number);
      expect(run.metrics['find-looks']).toBe(total);
    }
    for (let i = 1; i < found.length; i += 1) {
      expect(found[i], `후보 ${i}`).toBeGreaterThan(found[i - 1] ?? 0);
    }
    // 끝과 처음의 배율이 만 배를 넘는다 — 그래야 "폭발" 이 말이 된다.
    expect((found.at(-1) ?? 0) / (found[0] ?? 1)).toBeGreaterThan(10_000);
  });

  it('확인은 기어간다 — 수 하나가 늘 때마다 덧셈이 하나', async () => {
    const adds: number[] = [];
    for (const n of SIZES) {
      const run = await play(n);
      adds.push(run.metrics['add-steps'] ?? 0);
      // 확인이 들여다본 후보는 손잡이와 무관하게 늘 하나다.
      expect(run.metrics['check-looks'], `확인 ${n}`).toBe(1);
    }
    // 덧셈은 정확히 n-1 이라 손잡이를 그대로 따라간다.
    expect(adds).toEqual(SIZES.map((n) => n - 1));
    // 손잡이가 세 배 넘게 커지는 동안 확인 쪽은 네 배를 넘지 않는다.
    expect((adds.at(-1) ?? 0) / (adds[0] ?? 1)).toBeLessThan(4);
  });

  it('두 줄이 같은 규칙을 쓴다 — 후보 하나당 값이 양쪽에서 같다', async () => {
    for (const n of SIZES) {
      const gap = payload((await play(n)).events.find((e) => e.type === 'gap'));
      const round = computePNpResult(data, n);
      expect(gap.checkLooks).toBe(1);
      expect(gap.findLooks).toBe(round.candidates);
      // 후보당 덧셈은 한 값이고 양쪽이 나눠 쓴다. 그래서 배율이 곧 후보의 수다.
      expect(gap.adds).toBe(n - 1);
      expect((gap.findLooks as number) / (gap.checkLooks as number)).toBe(round.candidates);
    }
  });

  it('걸음 수가 손잡이를 따라 늘지 않는다 — 여섯 값에서 모두 아홉', async () => {
    const counts: number[] = [];
    for (const n of SIZES) {
      const steps = (await play(n)).events.filter((e) => e.type !== 'phase');
      counts.push(steps.length);
    }
    expect(new Set(counts).size).toBe(1);
    expect(counts[0]).toBe(6 + P_NP_SWEEP_STEPS);
  });

  it('훑기는 하나도 빠뜨리지 않고 끝까지 간다', async () => {
    for (const n of SIZES) {
      const sweeps = (await play(n)).events.filter((e) => e.type === 'sweep');
      expect(sweeps.length).toBe(P_NP_SWEEP_STEPS);
      let cursor = 0;
      for (const s of sweeps) {
        const p = payload(s);
        expect(p.seen as number).toBeGreaterThan(cursor);
        expect(p.total).toBe(2 ** n);
        cursor = p.seen as number;
      }
      // 마지막 걸음이 전체에 닿는다 — 다 보기 전에는 다 봤는지 모른다.
      expect(cursor).toBe(2 ** n);
    }
  });

  it('건네받은 후보는 최악보다 적게 들지만 자는 최악을 보인다', async () => {
    for (const n of SIZES) {
      const p = payload((await play(n)).events.find((e) => e.type === 'check-sum'));
      expect(p.used).toBe((p.picked as number[]).length - 1);
      expect(p.adds).toBe(n - 1);
      // 둘이 갈려야 자의 빈 칸이 뜻을 가진다.
      expect(p.used as number).toBeLessThan(p.adds as number);
      expect(p.sum).toBe(data.target);
    }
  });

  it('선언한 캡션의 갈래가 손잡이 여섯 값 모두에서 일어난다', async () => {
    // 이 facet 은 갈래 없는 아홉 걸음이라, 걸음 종류가 곧 캡션 키의 집합이다.
    for (const n of SIZES) {
      const kinds = new Set((await play(n)).events.map((e) => e.type));
      expect([...kinds].sort(), `n=${n}`).toEqual([
        'check-sum',
        'check-verdict',
        'count-candidates',
        'done',
        'gap',
        'phase',
        'problem',
        'sweep',
      ]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 32비트 — 검사가 값으로는 못 잡는다. 구조로 막고 그 구조를 잠근다.
// ─────────────────────────────────────────────────────────────────────────────

function walkNodes(fnBodies: IRStmt[][], visit: (node: Record<string, unknown>) => void): void {
  const walk = (e: unknown): void => {
    if (typeof e !== 'object' || e === null) return;
    const node = e as Record<string, unknown>;
    visit(node);
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach(walk);
      else walk(v);
    }
  };
  for (const body of fnBodies) body.forEach(walk);
}

const bodies = pNpImperativeIR.functions.map((f) => f.body);

describe('32비트 벽을 구조로 비껴간다', () => {
  it('IR 에 곱셈이 한 번도 없다', () => {
    // `ir-interpreter` 는 배정도라 넘침을 못 잡는다. 그래서 값이 아니라 구조를
    // 잠근다 — 뒷사람이 값을 곱하는 줄을 더하면 여기서 걸린다 (`fast-power` 의 본).
    const ops: string[] = [];
    walkNodes(bodies, (node) => {
      if (node.kind === 'binop' && typeof node.op === 'string') ops.push(node.op);
    });
    expect(ops).not.toContain('*');
    expect(ops).not.toContain('/');
  });

  it('IR 이 셈하는 가장 큰 값이 32비트 안에 있다', () => {
    const biggest = runIR(pNpImperativeIR, 'candidates', [Math.max(...SIZES)]) as number;
    expect(biggest).toBe(2 ** Math.max(...SIZES));
    expect(biggest).toBeLessThan(2 ** 31 - 1);
    // 합 쪽의 최대는 수 전부를 더한 것이라 비교도 안 되게 작다.
    const all = data.values.slice(0, Math.max(...SIZES));
    expect(runIR(pNpImperativeIR, 'check', [all, new Array(all.length).fill(1), all.length]))
      .toBeLessThan(2 ** 31 - 1);
  });

  it('비트마스크와 두 배 셈이 32비트 안에 있다 — 순서가 중간값을 정한다', () => {
    const maxN = Math.max(...SIZES);
    // 자리값을 하나씩 보므로 가장 큰 자리값이 2^(n-1) 이고 후보 번호도 2^n 아래다.
    expect(1 << (maxN - 1)).toBeLessThan(2 ** 31 - 1);
    expect(2 ** maxN - 1).toBeLessThan(2 ** 31 - 1);

    // 두 배로 세는 쪽은 **중간값이 답을 넘지 않는다.** 거듭제곱을 따로 구해 곱했다면
    // 중간값이 답보다 커질 수 있었다 — 무엇을 셈하느냐보다 어떤 순서로 셈하느냐가
    // 중간값을 정한다. 부분합을 전부 훑어 최대를 잠근다.
    let total = 1;
    const partials: number[] = [];
    for (let i = 0; i < maxN; i += 1) {
      total += total;
      partials.push(total);
    }
    expect(Math.max(...partials)).toBe(2 ** maxN);
    expect(Math.max(...partials)).toBeLessThan(2 ** 31 - 1);
  });

  it('짧은 회로에 기대는 식이 없다 — 인터프리터의 && 는 양쪽을 다 셈한다', () => {
    const ops: string[] = [];
    walkNodes(bodies, (node) => {
      if (node.kind === 'binop' && typeof node.op === 'string') ops.push(node.op);
    });
    expect(ops.filter((o) => o === '&&' || o === '||')).toEqual([]);
  });

  it('예약 수학 이름도 정수 나눗셈도 없고 슬롯이 전부 정수다', () => {
    // `log`/`floor` 의 결과는 실수라 `int` 슬롯에 담으면 **자바와 C# 이 컴파일되지
    // 않는다**(명시적 캐스트를 요구한다). `//` 는 실수 피연산자에서 그 셋이 `/` 로
    // 옮겨 인터프리터의 내림과 갈린다. 인터프리터는 셋을 다 통과시키므로 — 32비트와
    // 같은 종류의 구멍이다 — 값이 아니라 구조로 막고 여기서 잠근다.
    const ops = new Set<string>();
    const calls: string[] = [];
    walkNodes(bodies, (node) => {
      if (node.kind === 'binop' && typeof node.op === 'string') ops.add(node.op);
      // 예약 수학 이름도 `call` 노드로 나타난다.
      if (node.kind === 'call' && typeof node.fn === 'string') calls.push(node.fn);
    });
    expect(calls).toEqual([]);
    expect([...ops].sort()).toEqual(['+', '<', '==']);

    const kinds: string[] = [];
    for (const fn of pNpImperativeIR.functions) {
      kinds.push(fn.returnType.kind);
      for (const p of fn.params) kinds.push(p.type.kind === 'list' ? p.type.of.kind : p.type.kind);
    }
    walkNodes(bodies, (node) => {
      if (node.kind !== 'var') return;
      const t = node.type as { kind?: string } | undefined;
      if (typeof t?.kind === 'string') kinds.push(t.kind);
    });
    // 실수가 닿을 슬롯이 하나도 없다.
    expect([...new Set(kinds)]).toEqual(['int']);
  });

  it('이름 붙인 호출이 하나도 없다 — 셈이 전부 펼쳐져 있다', () => {
    const calls: string[] = [];
    walkNodes(bodies, (node) => {
      if (node.kind === 'call' && typeof node.fn === 'string') calls.push(node.fn);
    });
    expect(calls).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. 여섯 언어
// ─────────────────────────────────────────────────────────────────────────────

const transpilers = [
  pythonTranspiler,
  javascriptTranspiler,
  typescriptTranspiler,
  javaTranspiler,
  cppTranspiler,
  csharpTranspiler,
];

describe('여섯 언어 emit', () => {
  it.each(transpilers.map((t) => [t.id, t] as const))('%s 가 성한 코드를 낸다', (_id, t) => {
    const out = t.transpile(pNpImperativeIR);
    expect(out.lines.length).toBeGreaterThan(14);
    for (const line of out.lines) {
      expect(line.code).not.toContain('undefined');
      expect(line.code).not.toContain('\r');
    }
  });

  it('여섯 언어 모두 네 phase 를 낸다', () => {
    for (const t of transpilers) {
      const phases = new Set(
        t
          .transpile(pNpImperativeIR)
          .lines.map((l) => l.phase)
          .filter((p): p is string => p !== null),
      );
      expect([...phases].sort(), t.id).toEqual(['check', 'count', 'gap', 'verdict']);
    }
  });

  it('예약어를 식별자로 쓰지 않는다', () => {
    // `out` · `base` · `ref` · `value` 는 C# 것이고 `goto` 는 C++ · C# · Java 것이다.
    // transpiler 는 이름을 고쳐 주지 않는다 (S-transpiler).
    const banned = [
      'goto', 'out', 'base', 'ref', 'params', 'lock', 'event', 'string', 'object', 'value',
    ];
    const names: string[] = [];
    for (const fn of pNpImperativeIR.functions) {
      for (const p of fn.params) names.push(p.name);
    }
    walkNodes(bodies, (node) => {
      if (node.kind === 'var' && typeof node.name === 'string') names.push(node.name);
      if (node.kind === 'for-range' && typeof node.var === 'string') names.push(node.var);
    });
    expect(names.filter((n) => banned.includes(n))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. phase 어휘 (C3) · 메트릭 (C5) · 자리표 · 선언 정합
// ─────────────────────────────────────────────────────────────────────────────

function irPhases(stmts: IRStmt[], out: Set<string>): Set<string> {
  for (const s of stmts) {
    if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
    if (s.kind === 'if') {
      irPhases(s.then, out);
      if (s.else) irPhases(s.else, out);
    } else if (s.kind === 'for-range' || s.kind === 'while') {
      irPhases(s.body, out);
    }
  }
  return out;
}

describe('어휘 정합', () => {
  it('irs.ts 와 algorithm.ts 의 phase 집합이 같다', async () => {
    const fromIR = new Set<string>();
    for (const fn of pNpImperativeIR.functions) irPhases(fn.body, fromIR);

    const fromAlgorithm = new Set<string>();
    for (const n of SIZES) {
      for (const e of (await play(n)).events) {
        if (e.type !== 'phase') continue;
        const p = e.payload as { phase?: unknown };
        if (typeof p.phase === 'string') fromAlgorithm.add(p.phase);
      }
    }

    expect([...fromAlgorithm].sort()).toEqual([...fromIR].sort());
    // 한쪽만 비어도 위 단언이 통과하지 않도록 실제 어휘를 못박는다.
    expect([...fromIR].sort()).toEqual(['check', 'count', 'gap', 'verdict']);
  });

  it('phase 이벤트는 모두 silent 다 (C2)', async () => {
    for (const e of (await play(20)).events) {
      if (e.type === 'phase') expect(e.silent).toBe(true);
    }
  });

  it('메트릭 이름이 facet.ts 선언과 같다 (C5)', async () => {
    const controls = pNpFacet.blocks.controls as { metrics?: { name: string }[] };
    const declared = (controls.metrics ?? []).map((m) => m.name).sort();
    expect(Object.keys((await play(20)).metrics).sort()).toEqual(declared);
  });

  it('손잡이의 칸이 알고리즘·stage 의 눈금과 같다', () => {
    const controls = pNpFacet.blocks.controls as {
      controls?: Array<{ action?: string; segments?: Array<{ value: number }> }>;
    };
    const slider = (controls.controls ?? []).find((c) => c.action === 'size');
    expect((slider?.segments ?? []).map((s) => s.value)).toEqual(SIZES);
    // View 는 algorithm 을 참조하지 않으므로 눈금을 따로 든다 (원칙 1). 갈리면
    // 사다리가 조용히 거짓말을 한다.
    expect([...P_NP_N_TICKS]).toEqual(SIZES);
  });

  it('손잡이의 끝이 stage 의 격자 두 층에 담긴다', () => {
    // 담기지 않으면 후보가 잘려 화면이 거짓이 된다. 사본 문제가 아니라 용량 문제다.
    expect(P_NP_SHEET).toBe(P_NP_GRID_COLS * P_NP_GRID_COLS);
    expect(P_NP_CAPACITY).toBe(P_NP_SHEET * P_NP_SHEET);
    expect(2 ** Math.max(...SIZES)).toBeLessThanOrEqual(P_NP_CAPACITY);
    // 후보의 수가 늘 줄로 딱 떨어져야 격자가 반 칸을 그리지 않는다.
    for (const n of SIZES) expect(2 ** n % P_NP_GRID_COLS).toBe(0);
  });

  it('자리표 집합이 열 언어에서 모두 같다', () => {
    // 여든 칸을 눈으로 대조할 수 없고, 빠진 자리표는 화면에서 그냥 안 보일 뿐이라
    // 띄워 봐도 모른다 (`primality` 가 이 검사를 두게 된 까닭).
    const marks = (s: string): string[] => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
    for (const [key, value] of Object.entries(pNpFacet.messages ?? {})) {
      const locales = Object.entries(value as Record<string, string>);
      expect(locales.length, `${key} 의 언어 수`).toBe(10);
      const want = marks((value as Record<string, string>).en ?? '');
      for (const [locale, text] of locales) {
        expect(marks(text), `${key} / ${locale}`).toEqual(want);
      }
    }
  });

  it('코드 패널이 가리키는 IR 이 실제 IR 이고, 등록 이름이 선언과 맞는다 (C4)', () => {
    const panel = pNpFacet.blocks.codePanel as { ir?: string };
    expect(panel.ir).toBe(`ir:${pNpImperativeIR.id}`);
    expect(pNpImperativeIR.id).toBe('p-np-imperative');
    expect(pNpFacet.id).toBe('facet:pNp');
    expect(pNpFacet.algorithm).toBe('module:pNp');
    expect(pNpFacet.projector).toBe('module:pNpProjector');
  });

  it('title.ko 가 사양이 못박은 카드 이름 그대로다 (C4)', () => {
    // 카탈로그 카드 이름은 gen-facet-catalog 가 이 title 에서 그대로 뽑으므로 둘은
    // 구조적으로 같다. 이 단언이 지키는 것은 그 정합이 아니라 **사양이 정한 이름**이
    // 뒷사람 손에 조용히 바뀌지 않는 것이다.
    expect(pNpFacet.title.ko).toBe('P/NP 분류');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. 화면
// ─────────────────────────────────────────────────────────────────────────────

describe('화면', () => {
  it('띄워서 굴려도 던지지 않고 세로가 바뀌지 않는다', async () => {
    clearRegistry();
    registerPNp();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const original = console.error;
    const errors: string[] = [];
    console.error = (...a: unknown[]) => {
      errors.push(a.map(String).join(' '));
    };

    const handle = runFacet(pNpFacet, container);
    try {
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      const box = svg?.getAttribute('viewBox');
      expect(svg?.childNodes.length ?? 0).toBeGreaterThan(0);

      // reactive 라 마운트하면 스스로 굴러간다. 잠깐 굴려 본다.
      await new Promise((r) => setTimeout(r, 1_500));

      expect(errors).toEqual([]);
      expect(svg?.getAttribute('viewBox')).toBe(box);
      // 고를 수 있는 수가 실제로 그려졌다.
      expect(svg?.textContent ?? '').toContain(String(data.values[0]));
    } finally {
      handle.destroy();
      container.remove();
      console.error = original;
    }
  }, 20_000);

  it('화면에 뜬 큰 수가 전부 천 단위로 끊겨 있다', async () => {
    // **검사가 원리적으로 비껴가던 자리다.** en 원본 대조는 문안만 보고, i18n 검사는
    // 키가 찼는지만 보며, 위의 검사들은 payload 를 보지 **그려진 글자**를 안 본다.
    // 그래서 띄워서 텍스트 노드를 훑는다.
    //
    // 표기는 두 층위다 — 식의 일부(계수 · 지수)는 구분 없이, 값으로 읽는 수는 구분을
    // 넣어서. 이 화면에 뜨는 수는 전부 뒤쪽이라 네 자리 이상이 붙어 있으면 누락이다.
    clearRegistry();
    registerPNp();

    const container = document.createElement('div');
    document.body.appendChild(container);
    // 손잡이의 끝에서 봐야 큰 수가 실제로 뜬다.
    const handle = runFacet(
      { ...pNpFacet, initialData: { ...pNpFacet.initialData, n: 20 } },
      container,
    );
    try {
      await new Promise((r) => setTimeout(r, 4_500));
      const svg = container.querySelector('svg');
      const texts = [...(svg?.querySelectorAll('text') ?? [])].map((t) => t.textContent ?? '');

      const bare = texts.filter((t) => /\d{4,}/.test(t));
      expect(bare, `구분 없는 큰 수: ${bare.join(' / ')}`).toEqual([]);
      // 큰 수가 실제로 떠 있었어야 위 단언이 공허하지 않다.
      expect(texts.join(' | ')).toContain('1,048,576');
    } finally {
      handle.destroy();
      container.remove();
    }
  }, 20_000);

  it('가장 얇은 걸음이 800ms 아래로 떨어지지 않는다', async () => {
    // 셈하지 말고 잰다 — 실제 메커니즘으로 굴리며 걸음 사이의 벽시계를 찍는다.
    // (`stepMs` 선언만 보면 애니메이션이 얹힐 때 거짓이 된다. 이 stage 는 동기라
    //  얹히는 것이 없고, 그 사실도 여기서 함께 드러난다.)
    clearRegistry();
    registerPNp();

    const stamps: number[] = [];
    const tick = (): void => {
      stamps.push(Date.now());
    };
    const recorder: PlainView = {
      mount(): ViewInstance {
        return {
          destroy() {},
          setProblem: tick,
          showSum: tick,
          showVerdict: tick,
          countCandidates: tick,
          sweep: tick,
          settle: tick,
          setCaption() {},
          resetAll() {},
        } as ViewInstance;
      },
    };
    registerView('p-np-stage', recorder);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(pNpFacet, container);
    try {
      await new Promise((r) => setTimeout(r, 3_000));
    } finally {
      handle.destroy();
      container.remove();
    }

    const gaps: number[] = [];
    for (let i = 1; i < stamps.length; i += 1) gaps.push((stamps[i] ?? 0) - (stamps[i - 1] ?? 0));
    // 몇 걸음은 실제로 지나갔어야 잰 것이 있다.
    expect(gaps.length).toBeGreaterThanOrEqual(2);
    // 바닥선은 800ms 이고, 타이머 오차와 CI 부하를 감안해 조금 낮춰 본다.
    expect(Math.min(...gaps)).toBeGreaterThan(700);
    expect(data.stepMs).toBeGreaterThanOrEqual(800);
  }, 20_000);
});
