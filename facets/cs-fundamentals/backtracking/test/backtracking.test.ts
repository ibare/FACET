// @vitest-environment happy-dom
/**
 * 백트래킹 완제품의 회귀 시험.
 *
 * 재는 것은 셋이다.
 *   1. 알고리즘이 실제로 해 둘을 찾고, 놓은 만큼 물리는가.
 *   2. `irs.ts` 의 IR 을 그대로 실행했을 때 같은 답이 나오는가 (코드 패널이
 *      보여 주는 것이 진짜로 도는 코드인가).
 *   3. algorithm 이 발신하는 phase 집합과 IR 의 phase 집합이 같은가 (C3).
 */
import { describe, expect, it } from 'vitest';
import { IRInterpreter } from '@ffacet/ir-interpreter';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { mountView } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent } from '@ffacet/core/runtime';
import { backtracking, type BacktrackingData } from '../src/algorithm.js';
import { backtrackingProjector } from '../src/projector.js';
import { backtrackingStageView } from '../src/backtracking-stage.js';
import { nQueensBacktrackIR } from '../src/irs.js';
import { backtrackingFacet } from '../src/facet.js';

type Run = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  data: BacktrackingData;
};

async function runAlgorithm(): Promise<Run> {
  const data: BacktrackingData = { type: 'nqueens', n: 4, cols: [-1, -1, -1, -1] };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const ctx: FacetContext<BacktrackingData> = {
    data,
    async emit(event) {
      events.push(event);
    },
    metric(name, delta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    cancelled: false,
  };
  await backtracking(ctx);
  return { events, metrics, data };
}

describe('backtracking algorithm', () => {
  it('4×4 판에서 해 둘을 모두 찾는다', async () => {
    const { events, metrics } = await runAlgorithm();
    const solutions = events
      .filter((e) => e.type === 'solution')
      .map((e) => (e.payload as { cols: number[] }).cols);

    expect(solutions).toEqual([
      [1, 3, 0, 2],
      [2, 0, 3, 1],
    ]);
    expect(metrics['solution-count']).toBe(2);
  });

  it('놓은 만큼 물린다 — 놓음 16 · 물림 16', async () => {
    const { metrics, data, events } = await runAlgorithm();
    expect(metrics['place-count']).toBe(16);
    expect(metrics['undo-count']).toBe(16);
    // 다 훑고 나면 판은 비어 있다. 못 찾아서가 아니라 다 훑었다는 표시다.
    expect(data.cols).toEqual([-1, -1, -1, -1]);
    const done = events.at(-1);
    expect(done?.type).toBe('done');
    expect(done?.payload).toEqual({ solutions: 2, places: 16, undos: 16 });
  });

  it('phase 이벤트는 전부 silent 다 (C2)', async () => {
    const { events } = await runAlgorithm();
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('nqueens-backtrack IR', () => {
  it('IR 을 직접 실행해도 해가 둘이다', () => {
    const interp = new IRInterpreter(nQueensBacktrackIR);
    const cols = [-1, -1, -1, -1];
    expect(interp.call('solve', [cols, 0, 4])).toBe(2);
    // 놓은 자리를 모두 물렸으므로 판이 처음 상태로 돌아온다.
    expect(cols).toEqual([-1, -1, -1, -1]);
  });

  it('IR 의 is_safe 가 두 해를 안전하다고 판정한다', () => {
    const interp = new IRInterpreter(nQueensBacktrackIR);
    for (const sol of [
      [1, 3, 0, 2],
      [2, 0, 3, 1],
    ]) {
      for (let r = 0; r < sol.length; r += 1) {
        expect(interp.call('is_safe', [sol.slice(0, r), r, sol[r]!, 4])).toBe(true);
      }
    }
  });

  it('여섯 언어가 undefined 없이 나온다', () => {
    const all = [
      pythonTranspiler,
      javascriptTranspiler,
      typescriptTranspiler,
      javaTranspiler,
      cppTranspiler,
      csharpTranspiler,
    ];
    for (const t of all) {
      const lines = t.transpile(nQueensBacktrackIR).lines;
      expect(lines.length).toBeGreaterThan(10);
      expect(lines.filter((l) => l.code.includes('undefined'))).toEqual([]);
    }
  });

  it('algorithm 의 phase 어휘와 IR 의 phase 어휘가 같다 (C3)', async () => {
    const { events } = await runAlgorithm();
    const fromAlgorithm = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    const fromIR = new Set(
      pythonTranspiler
        .transpile(nQueensBacktrackIR)
        .lines.map((l) => l.phase)
        .filter((p): p is string => p !== null),
    );
    expect([...fromAlgorithm].sort()).toEqual([...fromIR].sort());
  });
});

describe('backtracking-stage', () => {
  it('전 이벤트를 흘려도 캔버스가 붙어 있고 세로가 그대로다', async () => {
    const { events } = await runAlgorithm();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const instance = mountView(backtrackingStageView, host, {
      config: backtrackingFacet.blocks.stage as Record<string, unknown>,
      initialData: backtrackingFacet.initialData as Record<string, unknown>,
    });

    const canvas = host.querySelector('svg');
    expect(canvas).not.toBeNull();
    const viewBox = canvas!.getAttribute('viewBox');

    const projector = backtrackingProjector(
      { stage: instance },
      { t: (_key, fallback) => fallback },
    );
    projector.onInit?.(backtrackingFacet.initialData as Record<string, unknown>);
    for (const e of events) projector.onEvent?.(e);

    expect(host.querySelector('svg')).toBe(canvas);
    expect(canvas!.getAttribute('viewBox')).toBe(viewBox);
    // 해 둘이 화면에 남아 견줄 수 있어야 한다.
    expect(canvas!.textContent).toContain('[1, 3, 0, 2]');
    expect(canvas!.textContent).toContain('[2, 0, 3, 1]');

    instance.destroy();
  });
});
