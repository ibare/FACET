// @vitest-environment happy-dom
/**
 * KMP 완제품의 회귀 시험.
 *
 * 재는 것은 다섯이다.
 *   1. 손잡이 다섯 값에서 실측표와 같은 수가 나오는가 (사양의 대조 수치).
 *   2. 두 훑기가 찾은 자리가 `String.indexOf` 와 같은가 — 수를 논하기 전에
 *      구현이 옳은지부터 배제한다.
 *   3. **`irs.ts` 의 IR 이 셈하는 값과 algorithm 이 셈하는 값이 손잡이 다섯 값
 *      전부에서 같은가.** 어긋나면 코드 패널이 화면과 다른 수를 말하는 것이고,
 *      그러면 패널을 다는 까닭 자체가 지워진다 (사양의 검수 조건).
 *   4. algorithm 의 phase 어휘와 IR 의 phase 어휘가 같은가 (C3).
 *   5. 전 이벤트를 흘려도 stage 의 캔버스가 붙어 있고 세로가 그대로인가 (S-view).
 */
import { describe, expect, it } from 'vitest';
import { IRInterpreter } from '@ffacet/ir-interpreter';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import {
  clearRegistry,
  clearViewCatalog,
  mountView,
  registerBuiltinViews,
  runFacet,
} from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent, MetricDelta } from '@ffacet/core/runtime';
import { registerKmp } from '../src/index.js';
import {
  computeKmpRun,
  kmpAlgorithm,
  kmpFailure,
  kmpFailureByDefinition,
  kmpTableCompares,
  type KmpData,
} from '../src/algorithm.js';
import { kmpImperativeIR } from '../src/irs.js';
import { kmpFacet } from '../src/facet.js';
import { kmpProjector } from '../src/projector.js';
import { kmpStageView } from '../src/kmp-stage.js';

/**
 * 사양의 실측표. 이 파일 밖에서 손으로 옮겨 온 유일한 수이고, 아래 시험들이
 * 그것을 algorithm · IR · `String.indexOf` 셋과 견준다.
 */
const MEASURED = [
  { length: 4, pattern: 'abaa', naive: 128, kmp: 78, table: 4, waste: 50, at: 46 },
  { length: 6, pattern: 'ababaa', naive: 168, kmp: 72, table: 7, waste: 96, at: 44 },
  { length: 8, pattern: 'abababaa', naive: 209, kmp: 71, table: 10, waste: 138, at: 42 },
  { length: 10, pattern: 'ababababaa', naive: 246, kmp: 70, table: 13, waste: 176, at: 40 },
  { length: 12, pattern: 'abababababaa', naive: 279, kmp: 69, table: 16, waste: 210, at: 38 },
] as const;

const DATA = kmpFacet.initialData as unknown as KmpData;
const TEXT = DATA.text;

type Run = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
};

/**
 * 알고리즘을 한 판 굴린다.
 *
 * `done` 이 나가면 취소로 돌려 되짚기 루프를 끊는다 — 러너의 reset/destroy 가
 * `waitForInput` 을 reject 하는 것과 같은 경로다 (C8 의 정본).
 */
async function runAlgorithm(patternLength: number): Promise<Run> {
  const data: KmpData = { ...DATA, patterns: [...DATA.patterns], patternLength };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  let cancelled = false;

  const ctx = {
    data,
    get cancelled(): boolean {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent): Promise<void> {
      events.push(event);
      if (event.type === 'done') cancelled = true;
    },
    metric(name: string, delta: MetricDelta): void {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep(): Promise<boolean> {
      return !cancelled;
    },
    async waitForInput(): Promise<never> {
      throw new Error('cancelled');
    },
    pollInput(): null {
      return null;
    },
  };

  await kmpAlgorithm(ctx as unknown as FacetContext<KmpData>);
  return { events, metrics };
}

/** 알려진 값. 구현을 의심하기 전에 견줄 자다. */
function indexOfAll(text: string, pattern: string): number[] {
  const out: number[] = [];
  let i = text.indexOf(pattern);
  while (i !== -1) {
    out.push(i);
    i = text.indexOf(pattern, i + 1);
  }
  return out;
}

describe('kmp 의 데이터', () => {
  it('글과 패턴 족이 선언 그대로다', () => {
    expect(TEXT).toBe('ab'.repeat(24) + 'aaabab');
    expect(TEXT.length).toBe(54);
    expect(DATA.patterns).toEqual(MEASURED.map((r) => r.pattern));
    // 패턴은 `ab` 마디를 거듭한 뒤 `aa` 로 닫는다 — 길수록 앞이 더 겹친다.
    for (const row of MEASURED) {
      expect(row.pattern).toBe('ab'.repeat((row.length - 2) / 2) + 'aa');
      expect(row.pattern.length).toBe(row.length);
    }
    expect(DATA.patternLength).toBe(4);
  });

  it('두 훑기가 찾은 자리는 String.indexOf 와 같다', () => {
    for (const row of MEASURED) {
      const known = indexOfAll(TEXT, row.pattern);
      const run = computeKmpRun(TEXT, row.pattern);
      expect(known, `길이 ${row.length}`).toEqual([row.at]);
      expect(run.naive.hits, `단순 · 길이 ${row.length}`).toEqual(known);
      expect(run.kmp.hits, `KMP · 길이 ${row.length}`).toEqual(known);
    }
  });

  it('실패 함수는 정의 그대로 셈한 것과 같다 — 조각이 보인 표와 어긋나지 않는다', () => {
    for (const row of MEASURED) {
      expect(kmpFailure(row.pattern).fail, `길이 ${row.length}`).toEqual(
        kmpFailureByDefinition(row.pattern),
      );
    }
    // 길이 12 의 표. 열한 글자를 맞히고 어긋나도 아홉을 남긴다.
    expect(kmpFailure('abababababaa').fail).toEqual([0, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 1]);
  });

  it('칸마다의 견줌을 더하면 표 세우기의 합이 된다', () => {
    for (const row of MEASURED) {
      const per = kmpTableCompares(row.pattern);
      const sum = per.reduce((a, b) => a + b, 0);
      expect(sum, `길이 ${row.length}`).toBe(kmpFailure(row.pattern).compares);
      expect(sum).toBe(row.table);
    }
  });
});

describe('손잡이', () => {
  it('다섯 값에서 실측표와 같은 수가 나온다', () => {
    for (const row of MEASURED) {
      const run = computeKmpRun(TEXT, row.pattern);
      expect(
        {
          naive: run.naive.compares,
          kmp: run.kmp.compares,
          table: run.tableCompares,
          waste: run.waste,
        },
        `길이 ${row.length}`,
      ).toEqual({ naive: row.naive, kmp: row.kmp, table: row.table, waste: row.waste });
    }
  });

  it('헛수고가 손잡이를 밀수록 단조로 벌어진다', () => {
    const waste = MEASURED.map((r) => computeKmpRun(TEXT, r.pattern).waste);
    expect(waste).toEqual([50, 96, 138, 176, 210]);
    for (let i = 1; i < waste.length; i += 1) {
      expect(waste[i]!, `${i} 번째`).toBeGreaterThan(waste[i - 1]!);
    }
    // 네 배 넘게 벌어진다. 이 배수가 이 화면의 주장이다.
    expect(waste[4]! / waste[0]!).toBeGreaterThan(4);
  });

  it('KMP 쪽 견줌은 손잡이를 밀어도 거의 움직이지 않는다', () => {
    const kmp = MEASURED.map((r) => computeKmpRun(TEXT, r.pattern).kmp.compares);
    const spread = Math.max(...kmp) - Math.min(...kmp);
    // 글을 한 번만 읽으므로 패턴이 길어져도 치를 것이 늘지 않는다.
    expect(spread).toBeLessThanOrEqual(10);
    // 오히려 조금 줄어든다 — 늘지 않는다는 것이 요점이다.
    expect(kmp[4]!).toBeLessThan(kmp[0]!);
  });

  it('표를 세우는 값을 더해도 단순 방식보다 적다', () => {
    for (const row of MEASURED) {
      const run = computeKmpRun(TEXT, row.pattern);
      expect(run.kmp.compares + run.tableCompares, `길이 ${row.length}`).toBeLessThan(
        run.naive.compares,
      );
    }
  });

  it('알고리즘이 알리는 계기 값이 실측표와 같다', async () => {
    for (const row of MEASURED) {
      const { metrics } = await runAlgorithm(row.length);
      expect(
        {
          naive: metrics['naive-compare-count'],
          kmp: metrics['kmp-compare-count'],
          waste: metrics['wasted-compare-count'],
          table: metrics['table-compare-count'],
        },
        `길이 ${row.length}`,
      ).toEqual({ naive: row.naive, kmp: row.kmp, waste: row.waste, table: row.table });
    }
  });

  it('계기 이름이 facet.ts 선언과 같다 (C5)', async () => {
    const block = kmpFacet.blocks.controls as { metrics?: { name: string }[] };
    const declared = new Set((block.metrics ?? []).map((m) => m.name));
    const { metrics } = await runAlgorithm(12);
    for (const name of Object.keys(metrics)) {
      expect(declared.has(name), `${name} 이 선언되지 않았다`).toBe(true);
      expect(name).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
    }
  });
});

describe('kmp-imperative IR', () => {
  it('IR 이 셈하는 값이 algorithm 과 같다 — 손잡이 다섯 값 전부', () => {
    for (const row of MEASURED) {
      const interp = new IRInterpreter(kmpImperativeIR);
      const fail = new Array<number>(row.pattern.length).fill(0);

      const table = interp.call('build_table', [row.pattern, fail]);
      const naive = interp.call('naive_search', [TEXT, row.pattern]);
      const kmp = interp.call('kmp_search', [TEXT, row.pattern, fail]);
      const run = computeKmpRun(TEXT, row.pattern);

      expect({ table, naive, kmp, fail }, `길이 ${row.length}`).toEqual({
        table: run.tableCompares,
        naive: run.naive.compares,
        kmp: run.kmp.compares,
        fail: run.fail,
      });
      // 사양의 수치와도 같다 — 화면과 코드 패널이 같은 말을 한다.
      expect({ table, naive, kmp }, `길이 ${row.length}`).toEqual({
        table: row.table,
        naive: row.naive,
        kmp: row.kmp,
      });
    }
  });

  it('여섯 언어가 undefined 없이 나온다', () => {
    for (const t of [
      pythonTranspiler,
      javascriptTranspiler,
      typescriptTranspiler,
      javaTranspiler,
      cppTranspiler,
      csharpTranspiler,
    ]) {
      const lines = t.transpile(kmpImperativeIR).lines;
      expect(lines.length, t.id).toBeGreaterThan(30);
      expect(
        lines.filter((l) => l.code.includes('undefined')),
        t.id,
      ).toEqual([]);
    }
  });

  it('자바는 문자열을 charAt 으로 짚는다 — 대괄호로 내면 컴파일되지 않는다', () => {
    const code = javaTranspiler
      .transpile(kmpImperativeIR)
      .lines.map((l) => l.code)
      .join('\n');
    expect(code).toContain('charAt(');
    expect(code).not.toMatch(/\btext\[/);
    expect(code).not.toMatch(/\bpat\[/);
  });

  it('algorithm 의 phase 어휘와 IR 의 phase 어휘가 같다 (C3)', async () => {
    const fromIR = new Set(
      pythonTranspiler
        .transpile(kmpImperativeIR)
        .lines.map((l) => l.phase)
        .filter((p): p is string => p !== null),
    );
    expect([...fromIR].sort()).toEqual(['build', 'found', 'scan', 'shift']);

    for (const row of MEASURED) {
      const { events } = await runAlgorithm(row.length);
      const fromAlgorithm = new Set(
        events
          .filter((e) => e.type === 'phase')
          .map((e) => (e.payload as { phase: string }).phase),
      );
      expect([...fromAlgorithm].sort(), `길이 ${row.length}`).toEqual([...fromIR].sort());
    }
  });

  it('phase 이벤트는 전부 silent 다 (C2)', async () => {
    const { events } = await runAlgorithm(12);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
    // 시각 변화가 있는 이벤트는 silent 가 아니다.
    expect(events.filter((e) => e.type !== 'phase').every((e) => e.silent !== true)).toBe(true);
  });
});

describe('kmp-stage', () => {
  it('전 이벤트를 흘려도 캔버스가 붙어 있고 세로가 그대로다', async () => {
    const { events } = await runAlgorithm(12);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const instance = mountView(kmpStageView, host, {
      config: kmpFacet.blocks.stage as Record<string, unknown>,
      initialData: kmpFacet.initialData as Record<string, unknown>,
    });

    const canvas = host.querySelector('svg');
    expect(canvas).not.toBeNull();
    const viewBox = canvas!.getAttribute('viewBox');

    const projector = kmpProjector({ stage: instance }, { t: (_key, fallback) => fallback });
    projector.onInit?.(kmpFacet.initialData as Record<string, unknown>);
    for (const event of events) await projector.onEvent?.(event);

    expect(host.querySelector('svg')).toBe(canvas);
    expect(canvas!.getAttribute('viewBox')).toBe(viewBox);
    // 두 수가 화면에 남아 견줄 수 있어야 한다.
    expect(canvas!.textContent).toContain('279');
    expect(canvas!.textContent).toContain('69');
    expect(canvas!.textContent).toContain('210');

    instance.destroy();
    host.remove();
  });

  /**
   * 행 표식이 격자를 덮지 않는가.
   *
   * 표식을 격자 왼쪽 고정 폭 여백에 두었다가 물렀다 — 프랑스어
   * `Table des recouvrements` 가 첫 칸을 덮었다. **언어마다 길이가 다른 것을
   * 고정 폭으로 감당할 수 없다.** 글꼴 폭을 추정해 재면 그 추정이 틀릴 때 검사도
   * 함께 틀리므로, 구조로 잰다 — 표식은 제 행 **위**에 있거나 격자 **오른쪽**에
   * 있어야 하고, 격자 띠 안에서 격자보다 왼쪽에서 시작하는 글자는 하나도 없어야 한다.
   */
  it('행 표식이 격자를 덮지 않고 캔버스를 넘지 않는다', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const instance = mountView(kmpStageView, host, {
      config: kmpFacet.blocks.stage as Record<string, unknown>,
      initialData: kmpFacet.initialData as Record<string, unknown>,
    });
    const svg = host.querySelector('svg')!;
    const stage = instance as unknown as { setup(text: string, pattern: string): void };

    const measure = (): void => {
      const n = (v: string | null): number => Number(v ?? 0);
      const rects = [...svg.querySelectorAll('rect')].map((r) => ({
        x: n(r.getAttribute('x')),
        y: n(r.getAttribute('y')),
        w: n(r.getAttribute('width')),
        h: n(r.getAttribute('height')),
      }));
      const texts = [...svg.querySelectorAll('text')].map((t) => ({
        x: n(t.getAttribute('x')),
        y: n(t.getAttribute('y')),
        anchor: t.getAttribute('text-anchor') ?? 'start',
        s: t.textContent ?? '',
      }));

      // 격자 칸 = 폭이 작은 rect. 막대(540)와 폭 0 인 것은 빠진다.
      const cells = rects.filter((r) => r.w > 0 && r.w <= 30);
      expect(cells.length).toBeGreaterThan(50);
      const originX = Math.min(...cells.map((c) => c.x));
      const cellW = Math.max(...cells.map((c) => c.w));
      // 칸이 이보다 좁으면 stage 가 글자를 그리지 않는다.
      expect(cellW, '칸이 좁아 글자가 사라진다').toBeGreaterThanOrEqual(9);

      for (const band of new Set(cells.map((c) => c.y))) {
        const intruding = texts.filter(
          (t) => t.anchor === 'start' && t.y > band && t.y < band + 30 && t.x < originX,
        );
        expect(intruding.map((t) => t.s), `세로 ${band} 띠를 덮는 표식`).toEqual([]);
      }

      for (const r of rects) {
        expect(r.x, '왼쪽으로 새어 나감').toBeGreaterThanOrEqual(0);
        expect(r.x + r.w, `rect x=${r.x}`).toBeLessThanOrEqual(720);
      }
      for (const t of texts) {
        expect(t.x, `text "${t.s.slice(0, 20)}"`).toBeLessThanOrEqual(720);
      }
    };

    // 가장 짧은 패턴과 가장 긴 패턴 양쪽에서 잰다 — 표식 자리가 패턴 길이를 탄다.
    measure();
    stage.setup(kmpFacet.initialData.text as string, 'abababababaa');
    measure();

    instance.destroy();
    host.remove();
  });

  it('러너 위에서 띄우고 굴려도 던지지 않는다', async () => {
    // stage 를 손으로 mount 하는 것과 다른 경로다 — 여기서는 reactive 메커니즘과
    // control-bar 가 물린 채로 돈다. 완제품 셋이 서로 못 보는 자리에서 같은 코어
    // 결함(입력 대기 중 재생·한 걸음이 꺼진 채로 남는 것)에 걸린 자리라 굴려 본다.
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    registerKmp();

    const errors: string[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(' '));
    };

    const container = document.createElement('div');
    document.body.appendChild(container);
    const handle = runFacet(kmpFacet, container);
    try {
      await new Promise((r) => setTimeout(r, 400));
      const svg = container.querySelector('svg');
      expect(svg).not.toBeNull();
      expect(svg!.childNodes.length).toBeGreaterThan(0);
    } finally {
      handle.destroy();
      console.error = original;
      container.remove();
    }
    expect(errors).toEqual([]);
  });

  it('되돌리면 화면이 비워진다', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const instance = mountView(kmpStageView, host, {
      config: kmpFacet.blocks.stage as Record<string, unknown>,
      initialData: kmpFacet.initialData as Record<string, unknown>,
    });
    const projector = kmpProjector({ stage: instance }, { t: (_key, fallback) => fallback });
    projector.onReset?.();
    const canvas = host.querySelector('svg');
    expect(canvas).not.toBeNull();
    expect(canvas!.childNodes.length).toBeGreaterThan(0);

    instance.destroy();
    host.remove();
  });
});
