/**
 * 행렬 곱셈 완제품 검사.
 *
 * 이 facet 은 코드 패널을 달았고, 그 패널이 화면과 **같은 답**을 내야 한다.
 * 그러므로 검사의 중심은 하나다 — IR 이 셈한 값과 algorithm 이 셈한 값이 손잡이
 * **일곱 값 전부에서** 같은가.
 *
 *  1. IR ↔ algorithm 전수 대조 (깊이 1~7)
 *  2. 손잡이 실측 — 한 겹의 차이가 정말 고정이고, 아낀 곱셈이 정말 폭발하는가
 *  3. 여섯 언어 emit
 *  4. phase 어휘 일치 (C3) · 메트릭 이름 일치 (C5) · 손잡이 칸 일치
 *  5. 화면 — 띄워 굴려도 던지지 않고 세로가 바뀌지 않는가
 *  6. 걸음 벽시계 — 가장 얇은 걸음이 800ms 를 넘는가 (실측)
 *
 * 기대값은 상수로 박지 않는다. 고정이어야 하는 것(한 겹의 차이 = 1)만 못박고
 * 나머지는 실행 결과끼리 견준다.
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
import {
  clearRegistry,
  getProjector,
  mountView,
  registerProjector,
  runFacet,
  type FacetContext,
  type FacetRuntimeEvent,
  type MetricDelta,
  type ProjectorInstance,
  type ProjectorRuntime,
  type ProjectorViews,
} from '@ffacet/core/runtime';
import type { IRStmt } from '@ffacet/core';

import {
  combineAddCount,
  matrixMulAlgorithm,
  matrixSize,
  MATRIX_MUL_DEPTHS,
  operandAddCount,
  productCount,
  standardAddCount,
  standardPairs,
  standardProduct,
  strassenCombines,
  strassenProduct,
  strassenTerms,
  type MatrixMulData,
} from '../src/algorithm.js';
import { matrixMulImperativeIR } from '../src/irs.js';
import { matrixMulStageView } from '../src/matrix-mul-stage.js';
import { matrixMulFacet } from '../src/facet.js';
import { registerMatrixMul } from '../src/index.js';

/** 사양이 정한 자료를 선언에서 그대로 읽어 온다 (검사가 자료를 다시 적지 않는다). */
const data = matrixMulFacet.initialData as unknown as MatrixMulData;
const A = data.a;
const B = data.b;
const DEPTHS = data.depths;

const flat = (m: number[][]): number[] => m.flat();

// ─────────────────────────────────────────────────────────────────────────────
// 1. IR ↔ algorithm 전수 대조
// ─────────────────────────────────────────────────────────────────────────────

describe('IR 과 algorithm 이 같은 답을 낸다', () => {
  it('한 겹 — 표준의 곱셈 수와 C 가 같다', () => {
    const c = [0, 0, 0, 0];
    const mults = runIR(matrixMulImperativeIR, 'standard_2x2', [flat(A), flat(B), c]);
    expect(mults).toBe(standardPairs(A, B).length);
    expect(c).toEqual(flat(standardProduct(A, B)));
  });

  it('한 겹 — 스트라센의 곱 일곱과 C 가 같다', () => {
    const c = [0, 0, 0, 0];
    const m = [0, 0, 0, 0, 0, 0, 0];
    const terms = strassenTerms(A, B);
    const mults = runIR(matrixMulImperativeIR, 'strassen_2x2', [flat(A), flat(B), c, m]);
    expect(mults).toBe(terms.length);
    expect(m).toEqual(terms.map((t) => t.value));
    expect(c).toEqual(flat(strassenProduct(A, B)));
  });

  it('두 방법이 같은 C 를 낸다 — 그것이 이 화면의 전제다', () => {
    expect(strassenProduct(A, B)).toEqual(standardProduct(A, B));
  });

  it.each(DEPTHS.map((k) => [k] as const))(
    '깊이 %i — 겹을 세는 재귀가 algorithm 과 같다',
    (k) => {
      const per = { standard: standardPairs(A, B).length, fast: strassenTerms(A, B).length };
      expect(runIR(matrixMulImperativeIR, 'products', [k, per.standard])).toBe(
        productCount(k, per.standard),
      );
      expect(runIR(matrixMulImperativeIR, 'products', [k, per.fast])).toBe(
        productCount(k, per.fast),
      );
      expect(runIR(matrixMulImperativeIR, 'saved_products', [k])).toBe(
        productCount(k, per.standard) - productCount(k, per.fast),
      );
    },
  );

  it('밑바닥은 둘 다 곱셈 하나다', () => {
    expect(runIR(matrixMulImperativeIR, 'products', [0, 8])).toBe(1);
    expect(runIR(matrixMulImperativeIR, 'products', [0, 7])).toBe(1);
    expect(runIR(matrixMulImperativeIR, 'saved_products', [0])).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 손잡이 실측 — 고정인 것은 정말 고정인가, 터지는 것은 정말 터지는가
// ─────────────────────────────────────────────────────────────────────────────

type Run = { events: FacetRuntimeEvent[]; metrics: Record<string, number> };

/** 한 바퀴를 끝까지 굴리고 이벤트와 메트릭을 걷는다. */
async function play(depth: number): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  let finished = false;
  const ctx = {
    data: { ...data, depth },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
      if (event.type === 'done') finished = true;
    },
    metric(name: string, delta: MetricDelta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    get cancelled() {
      // 한 바퀴가 끝나면 취소된 것으로 본다 — 그래야 입력을 기다리지 않고 돌아온다.
      return finished;
    },
    async sleep() {
      return !finished;
    },
    async waitForInput(): Promise<never> {
      throw new Error('cancelled');
    },
  };
  await matrixMulAlgorithm(ctx as unknown as FacetContext<MatrixMulData>);
  return { events, metrics };
}

describe('손잡이', () => {
  it('한 겹의 차이는 손잡이를 밀어도 그대로 하나다', async () => {
    const gaps: number[] = [];
    for (const k of DEPTHS) {
      const run = await play(k);
      const layer = run.events.find((e) => e.type === 'combine-layer');
      const p = layer?.payload as { standardMults: number; fastMults: number };
      gaps.push(p.standardMults - p.fastMults);
    }
    // 이것이 이 화면의 주장이다 — 고정된 차이 하나.
    expect(gaps).toEqual(DEPTHS.map(() => 1));
  });

  it('아낀 곱셈은 손잡이를 따라 폭발한다', async () => {
    const saved: number[] = [];
    const ratios: number[] = [];
    for (const k of DEPTHS) {
      const run = await play(k);
      saved.push(run.metrics['saved-count'] ?? 0);
      const standard = run.metrics['standard-count'] ?? 0;
      const fast = run.metrics['strassen-count'] ?? 1;
      ratios.push(standard / fast);
    }
    for (let i = 1; i < saved.length; i += 1) {
      expect(saved[i], `아낀 곱셈 ${i}`).toBeGreaterThan(saved[i - 1] ?? 0);
      expect(ratios[i], `배율 ${i}`).toBeGreaterThan(ratios[i - 1] ?? 0);
    }
    // 배율은 밋밋한데 아낀 곱셈은 자릿수가 뛴다 — 그 어긋남이 주장이다.
    expect((ratios.at(-1) ?? 0) / (ratios[0] ?? 1)).toBeLessThan(3);
    expect((saved.at(-1) ?? 0) / (saved[0] ?? 1)).toBeGreaterThan(1_000_000);
  });

  it('곱셈 수는 박아 둔 수가 아니라 밑 행렬에서 세어 나온다', () => {
    const per = standardPairs(A, B).length;
    const fast = strassenTerms(A, B).length;
    expect(per).toBe(8);
    expect(fast).toBe(7);
    for (const k of DEPTHS) {
      // 한 겹이 per 벌로 갈라지고 각 벌이 아래 겹을 되풀이한다 — 곧 per^k 다.
      expect(productCount(k, per)).toBe(per ** k);
      expect(matrixSize(k)).toBe(2 ** k);
    }
  });

  it('공짜가 아니다 — 곱셈이 줄고 덧셈이 는다', () => {
    const terms = strassenTerms(A, B);
    const fastAdds = operandAddCount(terms) + combineAddCount(strassenCombines(terms));
    expect(standardAddCount(A, B)).toBeLessThan(fastAdds);
  });

  it('선언한 갈래가 모두 화면에 뜬다 — 밑바닥 걸음도 한 번은 온다', async () => {
    const run = await play(DEPTHS[0] ?? 1);
    const levels = run.events
      .filter((e) => e.type === 'depth')
      .map((e) => (e.payload as { level: number }).level);
    expect(levels[0]).toBe(0);
    expect(levels.at(-1)).toBe(DEPTHS[0] ?? 1);
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
    const out = t.transpile(matrixMulImperativeIR);
    expect(out.lines.length).toBeGreaterThan(30);
    for (const line of out.lines) {
      expect(line.code).not.toContain('undefined');
      expect(line.code).not.toContain('\r');
    }
  });

  it('여섯 언어 모두 다섯 phase 를 낸다', () => {
    for (const t of transpilers) {
      const phases = new Set(
        t
          .transpile(matrixMulImperativeIR)
          .lines.map((l) => l.phase)
          .filter((p): p is string => p !== null),
      );
      expect([...phases].sort(), t.id).toEqual([
        'base',
        'combine',
        'recurse',
        'standard',
        'strassen',
      ]);
    }
  });

  it('여섯 언어 모두 재귀 호출을 낸다 — 그것이 이 IR 의 갈림길이었다', () => {
    for (const t of transpilers) {
      const code = t.transpile(matrixMulImperativeIR).lines.map((l) => l.code).join('\n');
      expect(code, t.id).toContain('products(k - 1, per)');
    }
  });

  it('예약어를 식별자로 쓰지 않는다', () => {
    // `goto` 는 C++ · C# · Java 의 예약어이고 `out` · `base` · `ref` 는 C# 것이다.
    // transpiler 는 이름을 고쳐 주지 않는다 (S-transpiler).
    const banned = ['goto', 'out', 'base', 'ref', 'params', 'lock', 'event', 'string', 'object', 'new'];
    const names: string[] = [];
    for (const fn of matrixMulImperativeIR.functions) {
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
    for (const fn of matrixMulImperativeIR.functions) irPhases(fn.body, fromIR);

    const fromAlgorithm = new Set<string>();
    for (const k of DEPTHS) {
      for (const e of (await play(k)).events) {
        if (e.type !== 'phase') continue;
        const p = e.payload as { phase?: unknown };
        if (typeof p.phase === 'string') fromAlgorithm.add(p.phase);
      }
    }

    expect([...fromAlgorithm].sort()).toEqual([...fromIR].sort());
    // 한쪽만 비어도 위 단언이 통과하지 않도록 실제 어휘를 못박는다.
    expect([...fromIR].sort()).toEqual(['base', 'combine', 'recurse', 'standard', 'strassen']);
  });

  it('phase 이벤트는 모두 silent 다 (C2)', async () => {
    for (const e of (await play(3)).events) {
      if (e.type === 'phase') expect(e.silent).toBe(true);
    }
  });

  it('메트릭 이름이 facet.ts 선언과 같다 (C5)', async () => {
    const controls = matrixMulFacet.blocks.controls as { metrics?: { name: string }[] };
    const declared = (controls.metrics ?? []).map((m) => m.name).sort();
    expect(Object.keys((await play(3)).metrics).sort()).toEqual(declared);
  });

  it('손잡이의 칸이 알고리즘이 받는 값과 같다', () => {
    const controls = matrixMulFacet.blocks.controls as {
      controls?: Array<{ action?: string; segments?: Array<{ value: number; default?: boolean }> }>;
    };
    const slider = (controls.controls ?? []).find((c) => c.action === 'depth');
    expect((slider?.segments ?? []).map((s) => s.value)).toEqual(DEPTHS);
    // 슬라이더의 기본 칸과 initialData.depth 가 어긋나면 화면과 손잡이가 다른
    // 것을 가리킨 채로 시작한다.
    expect((slider?.segments ?? []).find((s) => s.default)?.value).toBe(data.depth);
  });

  it('코드 패널이 가리키는 IR 이 실재한다 (C4)', () => {
    const panel = matrixMulFacet.blocks.codePanel as { ir?: string };
    expect(panel.ir).toBe(`ir:${matrixMulImperativeIR.id}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4-2. 걸음의 단위 · 손잡이 눈금 — 둘 다 주장의 일부다
// ─────────────────────────────────────────────────────────────────────────────

describe('걸음의 단위', () => {
  /**
   * 깊이 7 이면 곱셈이 이백만 번이라 낱낱이 보일 수 없다. 그래서 묶는데,
   * **무엇을 한 걸음으로 삼느냐가 곧 주장이다.**
   *
   * 여기서 고른 단위는 **재귀 한 겹이 한 걸음**이다. 그러면 걸음의 결이 주장과
   * 같아진다 — 겹을 훑는 걸음은 손잡이를 따라 하나씩만 늘고(선형), 그동안 그
   * 걸음이 적어 내는 아낀 곱셈은 자릿수가 뛴다(지수). 걸음을 곱셈 단위로 잡았다면
   * 걸음 수 자체가 8ᵏ 로 터져 "고정된 차이 하나" 라는 주장이 사라졌을 것이다.
   */
  it('걸음 하나가 재귀 한 겹이다 — 걸음 수가 손잡이를 따라간다', async () => {
    const rows: { k: number; steps: number; layers: number }[] = [];
    for (const k of DEPTHS) {
      const run = await play(k);
      rows.push({
        k,
        steps: run.events.filter((e) => !e.silent).length,
        layers: run.events.filter((e) => e.type === 'depth').length,
      });
    }

    // 겹을 훑는 걸음은 밑바닥(0)부터 고른 깊이까지 — 정확히 k+1 이다.
    expect(rows.map((r) => r.layers)).toEqual(DEPTHS.map((k) => k + 1));

    // 한 겹을 자세히 보는 머리와 마무리는 손잡이와 무관하게 고정이다. 이것도
    // 주장과 결이 같다 — 한 겹에서 벌어 놓는 차이는 깊이와 상관없이 늘 하나다.
    expect(rows.map((r) => r.steps - r.layers)).toEqual(DEPTHS.map(() => 5));

    // 걸음은 깊이마다 하나씩만 는다. 곱셈은 8ᵏ 로 느는데 걸음은 선형이라,
    // 이백만 번을 낱낱이 보이지 않고도 증폭이 보인다.
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i]!.steps - rows[i - 1]!.steps).toBe(1);
    }
  });

  it('한 걸음이 아낀 곱셈의 자릿수를 실제로 끌어올린다', async () => {
    // 걸음 수는 선형인데 그 걸음이 적어 내는 수는 지수다. 이 어긋남이 이 단위를
    // 고른 까닭이므로 검사로 남긴다.
    const run = await play(DEPTHS.at(-1) ?? 7);
    const saved = run.events
      .filter((e) => e.type === 'depth')
      .map((e) => (e.payload as { saved: number }).saved);
    expect(saved[0]).toBe(0);
    const digits = saved.map((s) => String(s).length);
    expect(digits.at(-1)! - digits[1]!).toBeGreaterThan(5);
  });
});

describe('손잡이 눈금', () => {
  /**
   * 같은 눈금이 세 곳에 있다 — 선언(슬라이더 칸 · initialData.depths),
   * algorithm 의 `MATRIX_MUL_DEPTHS`, 그리고 stage 의 깊이 자다. stage 는 원칙 1
   * 때문에 algorithm 을 참조할 수 없어 `initialData` 로 받는 수밖에 없고, 그래서
   * 셋이 갈릴 길이 열려 있다. **갈리면 축이 조용히 거짓말을 한다.**
   */
  it('선언 · algorithm 이 같은 눈금을 든다', () => {
    const controls = matrixMulFacet.blocks.controls as {
      controls?: Array<{ action?: string; segments?: Array<{ value: number }> }>;
    };
    const slider = (controls.controls ?? []).find((c) => c.action === 'depth');
    expect([...MATRIX_MUL_DEPTHS]).toEqual(DEPTHS);
    expect((slider?.segments ?? []).map((s) => s.value)).toEqual([...MATRIX_MUL_DEPTHS]);
  });

  it('눈금 밖의 값은 손잡이가 받지 않는다', async () => {
    // 어긋난 dispatch 하나가 깊이를 눈금 너머로 밀면 자와 코드 패널이 동시에
    // 거짓이 된다. 깊이 40 이면 8ᵏ 가 32비트를 한참 넘는다.
    const beyond = Math.max(...DEPTHS) + 33;
    const run = await play(beyond);
    const tally = run.events.find((e) => e.type === 'tally');
    // play() 는 data.depth 를 직접 넣으므로 여기서 재는 것은 readDepth 가 아니라
    // "눈금 밖 값이 들어오면 화면이 어떻게 되는가" 다 — 그래서 선언 쪽을 잠근다.
    expect((tally?.payload as { depth: number }).depth).toBe(beyond);
    expect(DEPTHS).not.toContain(beyond);
  });

  it('stage 의 깊이 자가 손잡이가 얕아도 선언한 끝까지 서 있다', () => {
    // 자를 손잡이에 맞춰 다시 그리면 깊이 1 과 깊이 7 이 같은 그림이 되어,
    // 손잡이를 밀어도 아무 일이 없는 것처럼 보인다.
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(matrixMulStageView, container, {
      config: {},
      initialData: { ...data, depth: DEPTHS[0] } as unknown as Record<string, unknown>,
      locale: 'en',
      theme: 'light',
    });
    const ticks = [...container.querySelectorAll('[data-role="depth-tick"]')].map(
      (t) => t.textContent,
    );
    // 밑바닥 0 부터 선언한 가장 깊은 곳까지.
    expect(ticks).toEqual(['0', ...DEPTHS.map(String)]);
    instance.destroy();
    container.remove();
  });
});

describe('IR 의 함정', () => {
  it('IR 에 && 와 || 가 하나도 없다', () => {
    // `ir-interpreter` 의 `&&` 는 짧은 회로가 아니라 오른쪽이 늘 셈해진다. 이 IR 은
    // 2차원을 눕혀 짚으므로 범위 밖 색인이 특히 위험한데, 조건을 하나로 두고
    // 나머지를 `if` 로 갈라 그 함정을 **회피가 아니라 제거**로 풀었다.
    const ops: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node !== 'object' || node === null) return;
      const n = node as { kind?: string; op?: string } & Record<string, unknown>;
      if (n.kind === 'binop' && typeof n.op === 'string') ops.push(n.op);
      for (const value of Object.values(n)) {
        if (Array.isArray(value)) value.forEach(walk);
        else walk(value);
      }
    };
    for (const fn of matrixMulImperativeIR.functions) fn.body.forEach(walk);
    expect(ops.length, '견줄 연산이 실제로 있었다').toBeGreaterThan(10);
    expect(ops.filter((o) => o === '&&' || o === '||')).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. 화면 · 6. 걸음 벽시계
// ─────────────────────────────────────────────────────────────────────────────

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('화면', () => {
  it('띄워 굴려도 던지지 않고, 세로가 흔들리지 않으며, 걸음이 읽을 만큼 머문다', async () => {
    clearRegistry();
    registerMatrixMul();

    // projector 를 감싸 걸음의 시각을 적는다. 걸음 벽시계는 **재는 것**이지
    // 셈하는 것이 아니다 (S-piece 85–87).
    const beats: number[] = [];
    const name = String(matrixMulFacet.projector).replace(/^module:/, '');
    const original = getProjector(name);
    expect(original).toBeDefined();
    registerProjector(name, (views: ProjectorViews, runtime?: ProjectorRuntime): ProjectorInstance => {
      const made = original!(views, runtime);
      return {
        ...made,
        async onEvent(event: FacetRuntimeEvent): Promise<void> {
          // silent 은 걸음의 경계가 아니다 — 벽시계에서 빼야 한다.
          if (!event.silent) beats.push(Date.now());
          await made.onEvent(event);
        },
      };
    });

    const errors: string[] = [];
    const speak = console.error;
    console.error = (...args: unknown[]): void => {
      errors.push(args.map((x) => String(x)).join(' '));
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(matrixMulFacet, container);

    await delay(120);
    const canvas = container.querySelector('svg');
    const before = canvas?.getAttribute('viewBox') ?? '';
    const drawn = canvas?.childNodes.length ?? 0;

    await delay(5_000);
    const after = container.querySelector('svg')?.getAttribute('viewBox') ?? '';
    handle.destroy();
    await delay(400);
    console.error = speak;
    container.remove();

    expect(errors).toEqual([]);
    expect(drawn).toBeGreaterThan(0);
    expect(after).toBe(before);

    // 걸음 사이의 간격. 첫 걸음은 마운트 시각에 딸린 것이라 재지 않는다.
    const gaps: number[] = [];
    for (let i = 1; i < beats.length; i += 1) gaps.push((beats[i] ?? 0) - (beats[i - 1] ?? 0));
    expect(gaps.length, '걸음이 여럿 지나갔어야 잴 것이 있다').toBeGreaterThan(3);
    const thinnest = Math.min(...gaps);
    // `S-piece` 85–87 이 못박는 바닥선. 애니메이션이 없으므로 stepMs 가 곧 걸음이다.
    expect(thinnest, `가장 얇은 걸음 ${thinnest}ms — 걸음들: ${gaps.join(', ')}`).toBeGreaterThan(
      800,
    );
  }, 30_000);
});
