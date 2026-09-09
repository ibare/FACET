/**
 * 플로이드-워셜 — 완제품이 완제품인 까닭을 지키는 검사.
 *
 * 재는 것은 넷이다.
 *
 *   1. IR 이 실제로 돈다. 그 답이 **다른 알고리즘**(벨만-포드)의 답과 같다.
 *      기준표를 손으로 적어 두고 그것과 맞추면 검사가 자기 자신을 재게 되므로,
 *      기준을 이 파일 안에서 다른 방법으로 다시 셈한다.
 *   2. 여섯 언어가 undefined 없이 나오고, 줄마다 붙은 phase 가 어휘 안에 있다.
 *   3. phase 집합이 irs 와 algorithm 에서 **완전히 같다** (C3).
 *   4. 화면에 뜬 수가 알고리즘이 셈한 수다. stage 를 happy-dom 에 띄우고
 *      projector 로 이벤트를 다 흘린 뒤, 칸에 실제로 그려진 글자를 읽어 본다.
 *
 * 사양이 준 대조값 넷 가운데 둘(`0→4 = 11`, `4→3 = 16`)은 사양이 준 간선
 * 목록과 맞지 않는다. 여기서 벨만-포드로 따로 셈해 보면 각각 10 과 9 이고,
 * 사양의 다른 두 값(`0→2 = 5`, `1→3 = 3`)과도 그쪽이 아귀가 맞는다 —
 * `0→2 = 5` 이고 간선 `2→3` 이 1, `3→4` 가 4 이므로 `0→4` 는 11 일 수 없다.
 * 그래서 대조값이 아니라 그래프를 원본으로 삼았다.
 */
// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView } from '@ffacet/core/runtime';
import type { FacetContext, FacetRuntimeEvent, IR, IRStmt } from '@ffacet/core';
import { runIR } from '@ffacet/ir-interpreter';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';

import {
  FLOYD_WARSHALL_INF,
  computeFloydWarshallTable,
  floydWarshallAlgorithm,
} from '../src/algorithm.js';
import type { FloydWarshallData } from '../src/algorithm.js';
import { floydWarshallTripleIR } from '../src/irs.js';
import { floydWarshallProjector } from '../src/projector.js';
import { floydWarshallStageView } from '../src/floyd-warshall-stage.js';
import { floydWarshallFacet } from '../src/facet.js';

const DATA = floydWarshallFacet.initialData as unknown as FloydWarshallData;
const N = DATA.vertices.length;

/** irs.ts 와 algorithm.ts 가 함께 쓰기로 한 어휘. 둘 다 여기에 맞춰 잰다. */
const PHASES = ['build-table', 'add-edges', 'pick-pivot', 'probe', 'rewrite', 'done'];

// ── 기준표를 다른 알고리즘으로 셈한다 (시작점마다 벨만-포드).
function bellmanFordTable(data: FloydWarshallData): number[][] {
  const n = data.vertices.length;
  const out: number[][] = [];
  for (let s = 0; s < n; s += 1) {
    const d = new Array<number>(n).fill(FLOYD_WARSHALL_INF);
    d[s] = 0;
    for (let round = 0; round < n - 1; round += 1) {
      for (const e of data.edges) {
        if (d[e.from] === FLOYD_WARSHALL_INF) continue;
        if (d[e.from] + e.weight < d[e.to]) d[e.to] = d[e.from] + e.weight;
      }
    }
    out.push(d);
  }
  return out;
}

// ── 재생 경로를 이벤트만 받아 굴린다.
type Run = {
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  phases: string[];
};

async function playAlgorithm(data: FloydWarshallData): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const phases: string[] = [];
  const ctx: FacetContext<FloydWarshallData> = {
    data,
    emit: async (event: FacetRuntimeEvent) => {
      events.push(event);
      if (event.type === 'phase') {
        const p = event.payload as { phase?: unknown };
        if (typeof p?.phase === 'string') phases.push(p.phase);
      }
    },
    metric: (name: string, delta: number | 'inc') => {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    cancelled: false,
  };
  await floydWarshallAlgorithm(ctx);
  return { events, metrics, phases };
}

/** 이벤트만 보고 표를 다시 세운다 — 화면이 받는 것과 같은 정보로. */
function tableFromEvents(events: FacetRuntimeEvent[]): number[][] {
  const table: number[][] = [];
  for (let i = 0; i < N; i += 1) table.push(new Array<number>(N).fill(Number.NaN));
  for (const e of events) {
    if (e.type !== 'state-changed' && e.type !== 'rewrite') continue;
    const p = e.payload as { i?: unknown; j?: unknown; value?: unknown };
    if (typeof p.i !== 'number' || typeof p.j !== 'number' || typeof p.value !== 'number') continue;
    table[p.i][p.j] = p.value;
  }
  return table;
}

/** IR 트리를 훑어 phase 를 모은다. */
function phasesOfIR(ir: IR): Set<string> {
  const out = new Set<string>();
  const walk = (stmts: IRStmt[]): void => {
    for (const s of stmts) {
      if ('phase' in s && typeof s.phase === 'string') out.add(s.phase);
      if (s.kind === 'if') {
        walk(s.then);
        if (s.else) walk(s.else);
      } else if (s.kind === 'for-range' || s.kind === 'while') {
        walk(s.body);
      }
    }
  };
  for (const fn of ir.functions) walk(fn.body);
  return out;
}

describe('플로이드-워셜 — IR', () => {
  it('IR 을 돌린 표가 벨만-포드의 표와 같다', () => {
    const dist: number[][] = [];
    for (let i = 0; i < N; i += 1) dist.push(new Array<number>(N).fill(0));
    const out = runIR(floydWarshallTripleIR, 'floydWarshall', [
      DATA.edges.map((e) => e.from),
      DATA.edges.map((e) => e.to),
      DATA.edges.map((e) => e.weight),
      dist,
    ]) as number[][];

    const reference = bellmanFordTable(DATA);
    expect(out).toEqual(reference);

    // 기준이 정말 뜻있는 표인지 — 자기 자신은 0, 닿는 자리는 유한.
    expect(reference[0][0]).toBe(0);
    expect(reference[0][2]).toBe(5);
    expect(reference[1][3]).toBe(3);
    expect(reference[0][4]).toBeLessThan(FLOYD_WARSHALL_INF);
  });

  it('세 갈래(순수 셈 · 재생 · IR)가 같은 표를 낸다', async () => {
    const pure = computeFloydWarshallTable(DATA);
    const played = tableFromEvents((await playAlgorithm(DATA)).events);
    const dist: number[][] = [];
    for (let i = 0; i < N; i += 1) dist.push(new Array<number>(N).fill(0));
    const viaIR = runIR(floydWarshallTripleIR, 'floydWarshall', [
      DATA.edges.map((e) => e.from),
      DATA.edges.map((e) => e.to),
      DATA.edges.map((e) => e.weight),
      dist,
    ]) as number[][];

    expect(played).toEqual(pure);
    expect(viaIR).toEqual(pure);
    expect(pure).toEqual(bellmanFordTable(DATA));
  });

  it('여섯 언어가 undefined 없이 나오고 줄의 phase 가 어휘 안에 있다', () => {
    const langs = [
      pythonTranspiler,
      javascriptTranspiler,
      typescriptTranspiler,
      javaTranspiler,
      cppTranspiler,
      csharpTranspiler,
    ];
    const seen = new Set<string>();
    for (const t of langs) {
      const { lines } = t.transpile(floydWarshallTripleIR);
      expect(lines.length).toBeGreaterThan(15);
      for (const line of lines) {
        expect(line.code).not.toContain('undefined');
        if (line.phase !== null) {
          expect(PHASES).toContain(line.phase);
          seen.add(`${t.id}:${line.phase}`);
        }
      }
      // 이 IR 의 심장 — 완화 조건이 이름 뒤로 숨지 않았는지 본다.
      const body = lines.map((l) => l.code).join('\n');
      expect(body).toContain('dist[i][k] + dist[k][j]');
      expect(body).not.toContain('through(');
    }
    // 여섯 언어 × 여섯 phase 가 빠짐없이 라벨을 달았다.
    expect(seen.size).toBe(langs.length * PHASES.length);
  });

  it('phase 집합이 irs 와 algorithm 에서 완전히 같다', async () => {
    const fromIR = [...phasesOfIR(floydWarshallTripleIR)].sort();
    const fromAlgorithm = [...new Set((await playAlgorithm(DATA)).phases)].sort();
    expect(fromIR).toEqual([...PHASES].sort());
    expect(fromAlgorithm).toEqual(fromIR);
  });
});

describe('플로이드-워셜 — 재생', () => {
  it('가운데 다섯 번, 물음 백 번, 고쳐 적기는 물음보다 적다', async () => {
    const run = await playAlgorithm(DATA);
    expect(run.metrics['pivot-count']).toBe(N);
    // 가운데마다 자기 자신을 뺀 모든 쌍 — 5 × (5×5 − 5) = 100.
    expect(run.metrics['probe-count']).toBe(N * (N * N - N));
    expect(run.metrics['rewrite-count']).toBeGreaterThan(0);
    expect(run.metrics['rewrite-count']).toBeLessThan(run.metrics['probe-count']);

    // 고쳐 적은 횟수는 값이 실제로 줄어든 횟수와 같아야 한다.
    const shrinks = run.events.filter((e) => {
      if (e.type !== 'rewrite') return false;
      const p = e.payload as { previous?: unknown; value?: unknown };
      return typeof p.previous === 'number' && typeof p.value === 'number' && p.value < p.previous;
    }).length;
    expect(shrinks).toBe(run.metrics['rewrite-count']);
  });

  it('phase 이벤트는 전부 silent 이고 그 밖의 이벤트는 걸음이 된다', async () => {
    const run = await playAlgorithm(DATA);
    for (const e of run.events) {
      if (e.type === 'phase') expect(e.silent).toBe(true);
      else expect(e.silent).toBeUndefined();
    }
    expect(run.events.filter((e) => e.type === 'phase').length).toBeGreaterThan(0);
  });

  it('메트릭 이름은 facet.ts 가 선언한 것뿐이다', async () => {
    const controls = floydWarshallFacet.blocks.controls as {
      metrics?: { name: string }[];
    };
    const declared = (controls.metrics ?? []).map((m) => m.name).sort();
    const used = Object.keys((await playAlgorithm(DATA)).metrics).sort();
    expect(used).toEqual(declared);
  });
});

describe('플로이드-워셜 — 무대', () => {
  it('칸에 그려진 글자가 알고리즘이 셈한 표다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => errors.push(args);

    const stage = mountView(floydWarshallStageView, container, {
      config: {},
      initialData: DATA as unknown as Record<string, unknown>,
      locale: 'en',
      theme: 'light',
    });

    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const viewBoxAtMount = svg?.getAttribute('viewBox') ?? '';

    const panelPhases: (string | null)[] = [];
    const projector = floydWarshallProjector(
      {
        stage,
        codePanel: {
          destroy: () => undefined,
          highlightPhase: (p: string | null) => panelPhases.push(p),
        },
      },
      undefined,
    );
    projector.onInit?.(DATA);

    const run = await playAlgorithm(DATA);
    for (const event of run.events) await projector.onEvent(event);

    // 화면에서 읽는다 — 알고리즘이 셈한 값을 다시 쓰지 않는다.
    const table = computeFloydWarshallTable(DATA);
    const drawn: string[][] = [];
    const expected: string[][] = [];
    for (let i = 0; i < N; i += 1) {
      const drawnRow: string[] = [];
      const expectedRow: string[] = [];
      for (let j = 0; j < N; j += 1) {
        const node = svg?.querySelector(`[data-cell="${i}-${j}"]`);
        drawnRow.push(node?.textContent ?? '(없음)');
        expectedRow.push(
          table[i][j] >= FLOYD_WARSHALL_INF ? '∞' : String(table[i][j]),
        );
      }
      drawn.push(drawnRow);
      expected.push(expectedRow);
    }
    expect(drawn).toEqual(expected);

    // 코드 패널은 phase 를 전부 받았다.
    expect([...new Set(panelPhases)].sort()).toEqual([null, ...PHASES].sort());

    // 세로는 마운트한 뒤 바뀌지 않았다.
    expect(svg?.getAttribute('viewBox')).toBe(viewBoxAtMount);
    expect(errors).toEqual([]);
    console.error = originalError;

    // 거둔 뒤 남는 것이 없다.
    (stage as { destroy: () => void }).destroy();
    expect(container.querySelectorAll('[data-cell]').length).toBe(0);
    container.remove();
  });

  it('되돌리면 칸이 다시 비고, 마운트 직후에도 캔버스가 붙어 있다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(floydWarshallStageView, container, {
      config: {},
      initialData: DATA as unknown as Record<string, unknown>,
      locale: 'en',
      theme: 'light',
    });
    // 러너가 붙여 준 캔버스를 view 가 떼어내지 않았다.
    expect(container.querySelectorAll('svg').length).toBe(1);

    const s = stage as unknown as {
      setCell: (i: number, j: number, v: number, inf: boolean) => void;
      setPivot: (k: number) => void;
      pivotIndex: () => number;
      reset: () => void;
      destroy: () => void;
    };
    s.setCell(0, 1, 3, false);
    expect(container.querySelector('[data-cell="0-1"]')?.textContent).toBe('3');
    s.setCell(0, 2, FLOYD_WARSHALL_INF, true);
    expect(container.querySelector('[data-cell="0-2"]')?.textContent).toBe('∞');
    s.setPivot(2);
    expect(s.pivotIndex()).toBe(2);

    // 갈아 끼우던 중에 되돌려도 잔상과 전이가 남지 않는다.
    (stage as unknown as { applyRewrite: (i: number, j: number, v: number) => void })
      .applyRewrite(0, 1, 2);
    expect(container.querySelectorAll('text[style]').length).toBeGreaterThan(0);

    s.reset();
    expect(container.querySelector('[data-cell="0-1"]')?.textContent).toBe('');
    expect(container.querySelector('[data-cell="0-2"]')?.textContent).toBe('');
    expect(s.pivotIndex()).toBe(-1);
    expect(container.querySelectorAll('text[style]').length).toBe(0);
    s.destroy();
    container.remove();
  });
});
