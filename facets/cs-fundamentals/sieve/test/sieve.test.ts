/**
 * 에라토스테네스의 체 완제품 검사.
 *
 * 이 facet 은 코드 패널을 달았고, 그 패널이 화면과 **같은 답**을 내야 한다.
 * 그러므로 검사의 중심은 하나다 — IR 이 셈한 표시 횟수와 소수 목록이 algorithm 의
 * 것과 **손잡이 세 값 전부에서** 같은가.
 *
 *  1. IR ↔ algorithm 전수 대조 (손잡이 50 · 100 · 120)
 *  2. 손잡이 실측 — 지우개가 정말 고정인가, 그 옆의 수는 정말 느는가
 *  3. 여섯 언어 emit
 *  4. phase 어휘 일치 (C3) · 메트릭 이름 일치 (C5) · 선언 정합
 *  5. 화면 — 띄워서 굴려도 던지지 않고, 세로가 바뀌지 않고, 걸음이 800ms 를 넘는가
 *
 * 기대값은 상수로 박지 않는다. 고정이어야 하는 것(지우개가 손잡이를 따라 움직이지
 * 않는다)만 못박고 나머지는 실행 결과끼리 견준다.
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

import { runSieve, sieveAlgorithm, SIEVE_LIMIT_CHOICES, type SieveData } from '../src/algorithm.js';
import { sieveImperativeIR } from '../src/irs.js';
import { sieveFacet } from '../src/facet.js';
import { SIEVE_COLS, SIEVE_MAX_ROWS, SIEVE_LIMIT_TICKS } from '../src/sieve-stage.js';
import { registerSieve } from '../src/index.js';

/** 사양이 정한 자료를 선언에서 그대로 읽어 온다 (검사가 자료를 다시 적지 않는다). */
const data = sieveFacet.initialData as unknown as SieveData;

const LIMITS = [...SIEVE_LIMIT_CHOICES];

// ─────────────────────────────────────────────────────────────────────────────
// 1. IR ↔ algorithm 전수 대조
// ─────────────────────────────────────────────────────────────────────────────

type Sifted = { markTotal: number; primes: number[]; struck: number[]; erasers: number[] };

/** 손잡이 값 하나로 IR 두 함수를 실제로 돌린다. 배열은 밖에서 받는다. */
function runIrAt(limit: number): Sifted {
  const mark = new Array<number>(limit + 1).fill(0);
  const markTotal = runIR(sieveImperativeIR, 'sieve', [mark, limit]) as number;

  const primes = new Array<number>(limit).fill(0);
  const count = runIR(sieveImperativeIR, 'collect', [mark, primes, limit]) as number;

  const struck: number[] = [];
  for (let n = 2; n <= limit; n += 1) if (mark[n] === 1) struck.push(n);

  const found = primes.slice(0, count);
  return { markTotal, primes: found, struck, erasers: found.filter((p) => p * p <= limit) };
}

/** algorithm 쪽의 같은 값. */
function runTsAt(limit: number): Sifted {
  const run = runSieve(limit);
  const struck = new Set<number>();
  for (const visit of run.visits) for (const n of visit.marks) struck.add(n);
  return {
    markTotal: run.markTotal,
    primes: run.primes,
    struck: [...struck].sort((a, b) => a - b),
    erasers: run.erasers,
  };
}

describe('IR 과 algorithm 이 같은 답을 낸다', () => {
  it.each(LIMITS.map((n) => [n] as const))(
    '한계 %i — 표시 횟수 · 소수 목록 · 지워진 칸 · 지우개가 모두 같다',
    (limit) => {
      const ir = runIrAt(limit);
      const ts = runTsAt(limit);
      expect(ir.markTotal).toBe(ts.markTotal);
      expect(ir.primes).toEqual(ts.primes);
      expect(ir.struck).toEqual(ts.struck);
      expect(ir.erasers).toEqual(ts.erasers);
      // 견줄 것이 실제로 있었는지 본다 — 둘 다 비면 위 단언이 공허하게 통과한다.
      expect(ir.primes.length).toBeGreaterThan(0);
      expect(ir.markTotal).toBeGreaterThan(0);
    },
  );

  it('남은 수가 정말 소수다 — 낱낱이 나눠 본 것과 같다', () => {
    for (const limit of LIMITS) {
      const slow: number[] = [];
      for (let n = 2; n <= limit; n += 1) {
        let prime = true;
        for (let d = 2; d < n; d += 1) if (n % d === 0) { prime = false; break; }
        if (prime) slow.push(n);
      }
      expect(runIrAt(limit).primes).toEqual(slow);
    }
  });

  it('표시 횟수는 칸 수가 아니다 — 겹쳐 지운 것까지 센다', () => {
    // 판의 칸보다 표시가 많은 자리가 있어야 "겹쳐 지운다" 는 설명이 참이다.
    expect(runTsAt(100).markTotal).toBeGreaterThan(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 손잡이 실측 — 움직이지 않는 수가 정말 움직이지 않는가
// ─────────────────────────────────────────────────────────────────────────────

type Run = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

/** 한 판을 끝까지 굴리고 이벤트와 메트릭을 걷는다. */
async function play(limit: number): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  let finished = false;
  const ctx = {
    data: { ...data, limit },
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
  await sieveAlgorithm(ctx as unknown as FacetContext<SieveData>);
  return { events, metrics };
}

describe('손잡이', () => {
  it('판을 키워도 지우는 소수는 그대로다', async () => {
    const lists: string[] = [];
    for (const limit of LIMITS) {
      const run = await play(limit);
      const sifted = run.events.find((e) => e.type === 'sifted');
      const erasers = (sifted?.payload as { erasers?: number[] })?.erasers ?? [];
      lists.push(erasers.join(' '));
      expect(run.metrics['eraser-count']).toBe(erasers.length);
    }
    // 세 값에서 **같은 소수 목록**이 나온다. 개수만 같은 것이 아니다.
    expect(new Set(lists).size).toBe(1);
    expect(lists[0]).toBe('2 3 5 7');
  });

  it('그 옆의 수는 손잡이를 따라 오른다', async () => {
    const primes: number[] = [];
    const marks: number[] = [];
    for (const limit of LIMITS) {
      const run = await play(limit);
      primes.push(run.metrics['prime-count'] ?? 0);
      marks.push(run.metrics['mark-count'] ?? 0);
    }
    for (let i = 1; i < primes.length; i += 1) {
      expect(primes[i], `소수 ${i}`).toBeGreaterThan(primes[i - 1] ?? 0);
      expect(marks[i], `표시 ${i}`).toBeGreaterThan(marks[i - 1] ?? 0);
    }
    // 끝에서 갈리는 폭이 눈에 보일 만큼은 되어야 화면이 말을 한다.
    expect((primes.at(-1) ?? 0) / (primes[0] ?? 1)).toBeGreaterThan(1.9);
  });

  it('지우개 대 소수의 비는 판이 커질수록 줄어든다', () => {
    const ratios = LIMITS.map((limit) => {
      const run = runSieve(limit);
      return run.erasers.length / run.primes.length;
    });
    for (let i = 1; i < ratios.length; i += 1) {
      expect(ratios[i], `비 ${i}`).toBeLessThan(ratios[i - 1] ?? 1);
    }
  });

  it('바깥 루프는 제곱이 판을 넘는 자리에서 멎는다', () => {
    for (const limit of LIMITS) {
      const run = runSieve(limit);
      expect(run.halt * run.halt).toBeGreaterThan(limit);
      expect((run.halt - 1) * (run.halt - 1)).toBeLessThanOrEqual(limit);
      // 지우개는 전부 그 문턱 아래에 있다.
      for (const p of run.erasers) expect(p * p).toBeLessThanOrEqual(limit);
    }
  });

  it('선언한 캡션의 갈래가 손잡이 세 값 모두에서 일어난다', async () => {
    for (const limit of LIMITS) {
      const probes = (await play(limit)).events.filter((e) => e.type === 'probe');
      const skipped = probes.filter((e) => (e.payload as { skipped?: boolean }).skipped === true);
      const picked = probes.filter((e) => (e.payload as { skipped?: boolean }).skipped === false);
      // 둘 중 하나라도 없으면 선언에 있는 캡션이 화면에 뜰 수 없다.
      expect(skipped.length, `건너뜀 ${limit}`).toBeGreaterThan(0);
      expect(picked.length, `지우개 ${limit}`).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 여섯 언어
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
    const out = t.transpile(sieveImperativeIR);
    expect(out.lines.length).toBeGreaterThan(20);
    for (const line of out.lines) {
      expect(line.code).not.toContain('undefined');
      expect(line.code).not.toContain('\r');
    }
  });

  it('여섯 언어 모두 네 phase 를 낸다', () => {
    for (const t of transpilers) {
      const phases = new Set(
        t
          .transpile(sieveImperativeIR)
          .lines.map((l) => l.phase)
          .filter((p): p is string => p !== null),
      );
      expect([...phases].sort(), t.id).toEqual(['collect', 'finish', 'mark', 'outer']);
    }
  });

  it('예약어를 식별자로 쓰지 않는다', () => {
    // `out` · `base` · `ref` 는 C# 것이고 `goto` 는 C++ · C# · Java 것이다.
    // transpiler 는 이름을 고쳐 주지 않는다 (S-transpiler).
    const banned = ['goto', 'out', 'base', 'ref', 'params', 'lock', 'event', 'string', 'object'];
    const names: string[] = [];
    for (const fn of sieveImperativeIR.functions) {
      for (const p of fn.params) names.push(p.name);
      const walk = (stmts: IRStmt[]): void => {
        for (const s of stmts) {
          if (s.kind === 'var') names.push(s.name);
          if (s.kind === 'for-range') {
            names.push(s.var);
            walk(s.body);
          } else if (s.kind === 'while') walk(s.body);
          else if (s.kind === 'if') {
            walk(s.then);
            if (s.else) walk(s.else);
          }
        }
      };
      walk(fn.body);
    }
    expect(names.filter((n) => banned.includes(n))).toEqual([]);
  });

  it('이름 붙인 호출이 하나도 없다 — 셈이 전부 펼쳐져 있다', () => {
    const calls: string[] = [];
    const walk = (e: unknown): void => {
      if (typeof e !== 'object' || e === null) return;
      const node = e as { kind?: string; fn?: string } & Record<string, unknown>;
      if (node.kind === 'call' && typeof node.fn === 'string') calls.push(node.fn);
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(walk);
        else walk(v);
      }
    };
    for (const fn of sieveImperativeIR.functions) fn.body.forEach(walk);
    expect(calls).toEqual([]);
  });

  it('짧은 회로에 기대는 식이 없다 — 인터프리터의 && 는 양쪽을 다 셈한다', () => {
    const ops: string[] = [];
    const walk = (e: unknown): void => {
      if (typeof e !== 'object' || e === null) return;
      const node = e as { kind?: string; op?: string } & Record<string, unknown>;
      if (node.kind === 'binop' && typeof node.op === 'string') ops.push(node.op);
      for (const v of Object.values(node)) {
        if (Array.isArray(v)) v.forEach(walk);
        else walk(v);
      }
    };
    for (const fn of sieveImperativeIR.functions) fn.body.forEach(walk);
    expect(ops.filter((o) => o === '&&' || o === '||')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. phase 어휘 (C3) · 메트릭 (C5) · 선언 정합
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
    for (const fn of sieveImperativeIR.functions) irPhases(fn.body, fromIR);

    const fromAlgorithm = new Set<string>();
    for (const limit of LIMITS) {
      for (const e of (await play(limit)).events) {
        if (e.type !== 'phase') continue;
        const p = e.payload as { phase?: unknown };
        if (typeof p.phase === 'string') fromAlgorithm.add(p.phase);
      }
    }

    expect([...fromAlgorithm].sort()).toEqual([...fromIR].sort());
    // 한쪽만 비어도 위 단언이 통과하지 않도록 실제 어휘를 못박는다.
    expect([...fromIR].sort()).toEqual(['collect', 'finish', 'mark', 'outer']);
  });

  it('phase 이벤트는 모두 silent 다 (C2)', async () => {
    for (const e of (await play(120)).events) {
      if (e.type === 'phase') expect(e.silent).toBe(true);
    }
  });

  it('메트릭 이름이 facet.ts 선언과 같다 (C5)', async () => {
    const controls = sieveFacet.blocks.controls as { metrics?: { name: string }[] };
    const declared = (controls.metrics ?? []).map((m) => m.name).sort();
    expect(Object.keys((await play(120)).metrics).sort()).toEqual(declared);
  });

  it('손잡이의 칸이 알고리즘·stage 의 눈금과 같다', () => {
    const controls = sieveFacet.blocks.controls as {
      controls?: Array<{ action?: string; segments?: Array<{ value: number }> }>;
    };
    const slider = (controls.controls ?? []).find((c) => c.action === 'limit');
    const segments = (slider?.segments ?? []).map((s) => s.value);
    expect(segments).toEqual(LIMITS);
    // View 는 algorithm 을 참조하지 않으므로 눈금을 따로 든다 (원칙 1). 갈리면 축이
    // 거짓말을 한다.
    expect([...SIEVE_LIMIT_TICKS]).toEqual(LIMITS);
    // 가장 큰 판이 stage 가 잡아 둔 자리에 담긴다 — 담기지 않으면 칸이 잘린다.
    expect(Math.ceil(Math.max(...LIMITS) / SIEVE_COLS)).toBeLessThanOrEqual(SIEVE_MAX_ROWS);
  });

  it('코드 패널이 가리키는 IR 이 실제 IR 이다 (C4)', () => {
    const panel = sieveFacet.blocks.codePanel as { ir?: string };
    expect(panel.ir).toBe(`ir:${sieveImperativeIR.id}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. 화면
// ─────────────────────────────────────────────────────────────────────────────

describe('화면', () => {
  it('띄워서 굴려도 던지지 않고 세로가 바뀌지 않는다', async () => {
    clearRegistry();
    registerSieve();

    const container = document.createElement('div');
    document.body.appendChild(container);
    const original = console.error;
    const errors: string[] = [];
    console.error = (...a: unknown[]) => {
      errors.push(a.map(String).join(' '));
    };

    const handle = runFacet(sieveFacet, container);
    try {
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      const box = svg?.getAttribute('viewBox');
      expect(svg?.childNodes.length ?? 0).toBeGreaterThan(0);

      // reactive 라 마운트하면 스스로 굴러간다. 잠깐 굴려 본다.
      await new Promise((r) => setTimeout(r, 1_500));

      expect(errors).toEqual([]);
      expect(svg?.getAttribute('viewBox')).toBe(box);
      // 판의 칸이 실제로 그려졌다.
      expect(svg?.textContent ?? '').toContain('49');
    } finally {
      handle.destroy();
      container.remove();
      console.error = original;
    }
  }, 20_000);

  it('가장 얇은 걸음이 800ms 아래로 떨어지지 않는다', async () => {
    // 셈하지 말고 잰다 — 실제 메커니즘으로 굴리며 걸음 사이의 벽시계를 찍는다.
    // (`stepMs` 선언만 보면 애니메이션이 얹힐 때 거짓이 된다. 이 stage 는 동기라
    //  얹히는 것이 없고, 그 사실도 여기서 함께 드러난다.)
    clearRegistry();
    registerSieve();

    const stamps: number[] = [];
    const recorder: PlainView = {
      mount(): ViewInstance {
        return {
          destroy() {},
          setBoard() {
            stamps.push(Date.now());
          },
          probe() {
            stamps.push(Date.now());
          },
          strike() {
            stamps.push(Date.now());
          },
          halt() {
            stamps.push(Date.now());
          },
          reveal() {
            stamps.push(Date.now());
          },
          setCaption() {},
          resetAll() {},
        } as ViewInstance;
      },
    };
    registerView('sieve-stage', recorder);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(sieveFacet, container);
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
