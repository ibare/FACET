// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView } from '@ffacet/core/runtime';
import type { FacetRuntimeEvent, IR, IRStmt } from '@ffacet/core/runtime';
import { mergeSort, type MergeSortData } from '../src/algorithm.js';
import { mergeSortRecursiveIR } from '../src/irs.js';
import { mergeSortProjector } from '../src/projector.js';
import { mergeSortStageView } from '../src/merge-sort-stage.js';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';

const SEED = [38, 27, 43, 3, 9, 82, 10];

type Run = {
  data: MergeSortData;
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
};

async function run(values: number[]): Promise<Run> {
  const data: MergeSortData = { type: 'array', values: [...values] };
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  await mergeSort({
    data,
    cancelled: false,
    async emit(event) {
      events.push(event);
    },
    metric(name, delta) {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
  });
  return { data, events, metrics };
}

function irPhases(ir: IR): Set<string> {
  const found = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if (s.kind !== 'comment' && s.phase) found.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      } else if (s.kind === 'for-range' || s.kind === 'while') {
        walk(s.body);
      }
    }
  };
  for (const fn of ir.functions) walk(fn.body);
  return found;
}

describe('머지 정렬 알고리즘', () => {
  it('사양의 데이터를 정렬한다', async () => {
    const { data } = await run(SEED);
    expect(data.values).toEqual([3, 9, 10, 27, 38, 43, 82]);
  });

  it('견줌 14 · 옮김 20 · 깊이 3 — 사양의 대조와 맞는다', async () => {
    const { metrics } = await run(SEED);
    expect(metrics['compare-count']).toBe(14);
    expect(metrics['move-count']).toBe(20);
    expect(metrics['recurse-depth']).toBe(3);
  });

  it('맨 위의 합침이 맨 마지막이다', async () => {
    const { events } = await run(SEED);
    const merges = events.filter((e) => e.type === 'merge-end');
    expect(merges).toHaveLength(6);
    const last = merges[merges.length - 1]!.payload as { lo: number; hi: number; depth: number };
    expect(last).toMatchObject({ lo: 0, hi: 6, depth: 0 });
    // 그 앞의 다섯은 모두 더 깊은 자리에서 일어났다.
    for (const m of merges.slice(0, -1)) {
      expect((m.payload as { depth: number }).depth).toBeGreaterThan(0);
    }
  });

  it('빈 배열과 한 칸 배열에서도 멎는다', async () => {
    expect((await run([])).data.values).toEqual([]);
    expect((await run([7])).data.values).toEqual([7]);
  });

  it('phase 이벤트는 모두 silent 다', async () => {
    const { events } = await run(SEED);
    const phases = events.filter((e) => e.type === 'phase');
    expect(phases.length).toBeGreaterThan(0);
    expect(phases.every((e) => e.silent === true)).toBe(true);
  });
});

describe('phase 어휘 동기화 (C3)', () => {
  it('algorithm 이 발신한 phase 집합 = irs 의 phase 집합', async () => {
    const { events } = await run(SEED);
    const emitted = new Set(
      events
        .filter((e) => e.type === 'phase')
        .map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...emitted].sort()).toEqual([...irPhases(mergeSortRecursiveIR)].sort());
  });
});

describe('IR → 여섯 언어', () => {
  const all = [
    pythonTranspiler,
    javascriptTranspiler,
    typescriptTranspiler,
    javaTranspiler,
    cppTranspiler,
    csharpTranspiler,
  ];

  it('여섯 모두 imperative 를 받고 undefined 를 섞지 않는다', () => {
    for (const t of all) {
      expect(t.supports).toContain(mergeSortRecursiveIR.paradigm);
      const { lines } = t.transpile(mergeSortRecursiveIR);
      expect(lines.length).toBeGreaterThan(25);
      expect(lines.some((l) => l.code.includes('undefined'))).toBe(false);
      // 재귀와 보조 함수 둘이 모두 나온다.
      const src = lines.map((l) => l.code).join('\n');
      expect(src).toContain('merge_sort(arr, lo, mid)');
      expect(src).toContain('copy_range');
    }
  });

  it('phase 라벨이 줄에 실려 나온다', () => {
    for (const t of all) {
      const { lines } = t.transpile(mergeSortRecursiveIR);
      const labelled = new Set(lines.map((l) => l.phase).filter((p): p is string => p !== null));
      expect(labelled).toEqual(irPhases(mergeSortRecursiveIR));
    }
  });
});

describe('stage + projector', () => {
  it('재생을 끝까지 돌려도 캔버스가 붙어 있고 세로가 그대로다', async () => {
    const { events } = await run(SEED);

    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(mergeSortStageView, container, {
      config: { type: 'merge-sort-stage' },
      initialData: { type: 'array', values: [...SEED] },
      t: (_key, fallback) => fallback,
    });

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const viewBox = svg!.getAttribute('viewBox');

    const seen: (string | null)[] = [];
    const codePanel = {
      highlightPhase(phase: string | null) {
        seen.push(phase);
      },
      clearHighlight() {
        seen.push(null);
      },
    };

    const projector = mergeSortProjector(
      { stage, codePanel: codePanel as unknown as Record<string, unknown> },
      { getSpeed: () => 1, t: (_key, fallback) => fallback },
    );
    projector.onInit?.({ type: 'array', values: [...SEED] });
    for (const e of events) await projector.onEvent(e);

    // 캔버스는 그대로 붙어 있고, 세로는 마운트 때 정한 값에서 변하지 않았다.
    expect(container.querySelector('svg')).toBe(svg);
    expect(svg!.getAttribute('viewBox')).toBe(viewBox);
    // 코드 패널이 모든 phase 를 받았다.
    expect(seen.filter((p) => p !== null).length).toBe(
      events.filter((e) => e.type === 'phase').length,
    );
    // 마지막 그림에는 정렬된 일곱 값이 모두 들어 있다.
    const texts = [...svg!.querySelectorAll('text')].map((t) => t.textContent);
    for (const v of SEED) expect(texts).toContain(String(v));

    stage.destroy();
    expect(container.querySelector('g')).toBeNull();
    container.remove();
  });
});
