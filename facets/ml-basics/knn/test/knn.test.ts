// @vitest-environment happy-dom
/**
 * knn 완제품이 완제품인 까닭을 지키는 검사.
 *
 *  1. IR 을 실제로 돌려 사양의 대조와 맞는지 본다.
 *  2. 여섯 언어로 낸다 — `undefined` 가 섞이지 않았는지, 줄 수가 말이 되는지.
 *  3. phase 집합이 algorithm 과 irs 사이에서 글자까지 같은지 (C3).
 *  4. 조작 (k 슬라이더) 이 실제로 화면을 바꾸는지.
 *  5. happy-dom 에 띄워 굴린다 — 캔버스가 붙어 있는지, viewBox 가 안 바뀌는지,
 *     `console.error` 0 건인지, destroy 뒤 잔여 0 인지.
 *  6. 화면에 뜨는 수가 알고리즘이 셈한 값인지.
 */
import { describe, expect, it } from 'vitest';
import type { FacetRuntimeEvent, IR, IRStmt } from '@ffacet/core/runtime';
import {
  clearRegistry,
  clearViewCatalog,
  registerBuiltinViews,
  runFacet,
} from '@ffacet/core/runtime';
import { IRInterpreter, type Value } from '@ffacet/ir-interpreter';
import { cppTranspiler } from '@ffacet/transpiler-cpp';
import { csharpTranspiler } from '@ffacet/transpiler-csharp';
import { javaTranspiler } from '@ffacet/transpiler-java';
import { javascriptTranspiler } from '@ffacet/transpiler-javascript';
import { pythonTranspiler } from '@ffacet/transpiler-python';
import { typescriptTranspiler } from '@ffacet/transpiler-typescript';

import {
  knn,
  knnClassifyIR,
  knnFacet,
  knnProjector,
  registerKnn,
  type KnnData,
  type KnnPoint,
} from '../src/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// 사양의 대조. 손으로 셈한 값이므로, 어긋나면 어느 쪽이 틀렸는지 따진다.
// ─────────────────────────────────────────────────────────────────────────────

/** 격자 576 칸 중 A 로 판정된 칸. */
const SPEC_A_CELLS: Record<number, number> = { 1: 324, 3: 318, 7: 319, 15: 302 };

/** 두 k 사이에 판정이 갈리는 칸 수. */
const SPEC_FLIPS: Array<[number, number, number]> = [
  [1, 3, 56],
  [3, 7, 37],
  [7, 15, 23],
  [1, 15, 78],
];

/** 섞여 있는 두 점 자신의 판정. 0 = A, 1 = B. */
const SPEC_MIXED: Record<number, { at42_32: number; at52_46: number }> = {
  1: { at42_32: 1, at52_46: 0 },
  3: { at42_32: 0, at52_46: 1 },
  7: { at42_32: 0, at52_46: 1 },
  15: { at42_32: 0, at52_46: 1 },
};

const PHASES = ['decide', 'measure', 'pick-nearest', 'take-neighbor', 'tally-init', 'vote'];

const data = (): KnnData => structuredClone(knnFacet.initialData) as unknown as KnnData;

// ─────────────────────────────────────────────────────────────────────────────
// 1. IR 을 실제로 돌린다.
// ─────────────────────────────────────────────────────────────────────────────

function irClassifier(points: KnnPoint[]): (qx: number, qy: number, k: number) => number {
  const interp = new IRInterpreter(knnClassifyIR);
  const coords: Value = points.map((p) => [p.x, p.y]);
  const labels: Value = points.map((p) => p.label);
  return (qx, qy, k) => {
    // 작업용 배열은 인자로 넘긴다 — IR 안에 zeros 가 없다.
    const dist: Value = points.map(() => 0);
    const used: Value = points.map(() => 0);
    const out = interp.call('classify', [coords, labels, [qx, qy], k, dist, used]);
    if (typeof out !== 'number') throw new Error(`classify 가 수를 내지 않았다: ${String(out)}`);
    return out;
  };
}

function gridOf(d: KnnData, classify: (x: number, y: number, k: number) => number, k: number): number[] {
  const step = (d.planeMax - d.planeMin) / d.gridSize;
  const cells: number[] = [];
  for (let row = 0; row < d.gridSize; row += 1) {
    for (let col = 0; col < d.gridSize; col += 1) {
      cells.push(classify(d.planeMin + (col + 0.5) * step, d.planeMin + (row + 0.5) * step, k));
    }
  }
  return cells;
}

describe('knn IR', () => {
  it('IR 이 사양의 격자 대조와 맞는다', () => {
    const d = data();
    const classify = irClassifier(d.points);
    const grids = new Map<number, number[]>();
    for (const k of d.kValues) grids.set(k, gridOf(d, classify, k));

    const aCells: Record<number, number> = {};
    for (const [k, cells] of grids) {
      expect(cells).toHaveLength(576);
      aCells[k] = cells.filter((c) => c === 0).length;
    }
    expect(aCells).toEqual(SPEC_A_CELLS);

    for (const [a, b, expected] of SPEC_FLIPS) {
      const ga = grids.get(a);
      const gb = grids.get(b);
      if (!ga || !gb) throw new Error(`격자 없음: ${a} / ${b}`);
      const flipped = ga.reduce((sum, v, i) => sum + (v === gb[i] ? 0 : 1), 0);
      expect([a, b, flipped]).toEqual([a, b, expected]);
    }
  });

  it('섞여 있는 두 점은 k = 1 에서만 제 부류로 판정된다', () => {
    const d = data();
    const classify = irClassifier(d.points);
    for (const k of d.kValues) {
      expect([k, classify(4.2, 3.2, k), classify(5.2, 4.6, k)]).toEqual([
        k,
        SPEC_MIXED[k].at42_32,
        SPEC_MIXED[k].at52_46,
      ]);
    }
  });

  it('자기 이름표와 다르게 판정되는 점은 k = 1 에서만 없다', () => {
    const d = data();
    const classify = irClassifier(d.points);
    const wrong = (k: number): number =>
      d.points.filter((p) => classify(p.x, p.y, k) !== p.label).length;
    expect([wrong(1), wrong(3), wrong(7), wrong(15)]).toEqual([0, 3, 2, 2]);
  });

  it('제곱근을 부르지 않는다 — 순서가 안 바뀌므로', () => {
    const source = JSON.stringify(knnClassifyIR);
    expect(source).not.toContain('"sqrt"');
    // 이름 붙인 호출이 아예 없다. 셈을 감싸면 코드 패널이 할 말을 잃는다.
    expect(source).not.toContain('"kind":"call"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. 여섯 언어로 낸다.
// ─────────────────────────────────────────────────────────────────────────────

describe('knn 코드 패널', () => {
  const transpilers = [
    pythonTranspiler,
    javascriptTranspiler,
    typescriptTranspiler,
    javaTranspiler,
    cppTranspiler,
    csharpTranspiler,
  ];

  it('여섯 언어가 성한 소스를 낸다', () => {
    for (const t of transpilers) {
      const out = t.transpile(knnClassifyIR);
      const source = out.lines.map((l) => l.code).join('\n');
      expect([t.id, source.includes('undefined')]).toEqual([t.id, false]);
      expect([t.id, source.includes('null')]).toEqual([t.id, false]);
      // 파이썬은 닫는 괄호가 없어 가장 짧고, 중괄호 언어가 가장 길다.
      expect(out.lines.length).toBeGreaterThanOrEqual(20);
      expect(out.lines.length).toBeLessThanOrEqual(40);
      // 알고리즘의 세 토막이 전부 소스에 남아 있다.
      expect([t.id, source.includes('votesA'), source.includes('bestDist')]).toEqual([
        t.id,
        true,
        true,
      ]);
    }
  });

  it('transpile 은 IR 을 건드리지 않는다', () => {
    const before = JSON.stringify(knnClassifyIR);
    for (const t of transpilers) t.transpile(knnClassifyIR);
    expect(JSON.stringify(knnClassifyIR)).toBe(before);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. phase 대조 (C3).
// ─────────────────────────────────────────────────────────────────────────────

function irPhases(ir: IR): string[] {
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
  return [...found].sort();
}

/**
 * algorithm 을 메커니즘 없이 직접 굴린다.
 *
 * 재생 · 멈춤 · 한 걸음은 이제 메커니즘이 `ctx.sleep` 의 걸음 경계에서 지므로
 * 여기서는 `sleep` 이 늘 통과한다. `until` 이 참이 되는 이벤트에서 취소를
 * 걸어 원하는 지점까지만 굴린다.
 */
async function record(
  d: KnnData,
  opts: {
    inputs?: Array<{ type: string; payload?: unknown }>;
    /** 이 이벤트가 나오면 그때 위젯 입력을 큐에 넣는다. */
    feedOn?: (
      event: FacetRuntimeEvent,
      events: FacetRuntimeEvent[],
    ) => { type: string; payload?: unknown } | null;
    until?: (event: FacetRuntimeEvent, events: FacetRuntimeEvent[]) => boolean;
  } = {},
): Promise<{ events: FacetRuntimeEvent[]; metrics: Record<string, number> }> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  let cancelled = false;
  const queue = [...(opts.inputs ?? [])];
  const ctx = {
    data: d,
    get cancelled() {
      return cancelled;
    },
    async emit(event: FacetRuntimeEvent) {
      events.push(event);
      const fed = opts.feedOn?.(event, events);
      if (fed) queue.push(fed);
      if (opts.until?.(event, events)) cancelled = true;
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async waitForInput() {
      const next = queue.shift();
      if (next) return next;
      cancelled = true;
      throw new Error('cancelled');
    },
    pollInput() {
      return queue.shift() ?? null;
    },
    async sleep() {
      return !cancelled;
    },
  };
  try {
    await knn(ctx as unknown as Parameters<typeof knn>[0]);
  } catch (err) {
    if ((err as Error).message !== 'cancelled') throw err;
  }
  return { events, metrics };
}

describe('knn phase 어휘', () => {
  it('irs 의 phase 집합과 algorithm 이 내는 집합이 같다', async () => {
    const { events } = await record(data(), { until: (e) => e.type === 'verdict' });
    const emitted = new Set<string>();
    for (const e of events) {
      if (e.type !== 'phase') continue;
      expect(e.silent).toBe(true);
      const p = (e.payload as { phase?: unknown }).phase;
      if (typeof p === 'string') emitted.add(p);
    }
    expect([...emitted].sort()).toEqual(PHASES);
    expect(irPhases(knnClassifyIR)).toEqual(PHASES);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. 알고리즘이 화면에 넘기는 수 — 모두 좌표에서 셈한 것이다.
// ─────────────────────────────────────────────────────────────────────────────

describe('knn algorithm', () => {
  it('처음 그리는 경계가 k = 3 의 대조와 맞는다', async () => {
    const { events, metrics } = await record(data(), {
      until: (e) => e.type === 'boundary-drawn',
    });
    const first = events.find((e) => e.type === 'boundary-drawn');
    const p = first?.payload as {
      k: number;
      aCells: number;
      cellTotal: number;
      flipped: number[];
      mislabeled: number[];
      prevK: number;
    };
    expect(p.k).toBe(3);
    expect(p.cellTotal).toBe(576);
    expect(p.aCells).toBe(SPEC_A_CELLS[3]);
    expect(p.mislabeled).toHaveLength(3);
    expect(p.flipped).toEqual([]);
    expect(p.prevK).toBe(-1);
    // 격자 576 물음 + 자료 열여덟 되묻기, 저마다 열여덟씩.
    expect(metrics['distance-count']).toBe((576 + 18) * 18);
    expect(metrics['grid-a-count']).toBe(SPEC_A_CELLS[3]);
    expect(metrics['mislabel-count']).toBe(3);
  });

  it('k 슬라이더가 경계를 다시 셈하고 뒤집힌 칸을 센다', async () => {
    const { events, metrics } = await record(data(), {
      inputs: [{ type: 'k', payload: { value: 1 } }],
      until: (_e, all) => all.filter((x) => x.type === 'boundary-drawn').length === 2,
    });
    const drawn = events.filter((e) => e.type === 'boundary-drawn');
    expect(drawn).toHaveLength(2);
    const second = drawn[1].payload as {
      k: number;
      prevK: number;
      aCells: number;
      flipped: number[];
      mislabeled: number[];
    };
    expect(second.k).toBe(1);
    expect(second.prevK).toBe(3);
    expect(second.aCells).toBe(SPEC_A_CELLS[1]);
    expect(second.flipped).toHaveLength(56);
    // k = 1 은 자료를 통째로 외운다 — 어긋나는 점이 하나도 없다.
    expect(second.mislabeled).toEqual([]);
    expect(metrics['grid-a-count']).toBe(SPEC_A_CELLS[1]);
    expect(metrics['mislabel-count']).toBe(0);
    // 다시 셈하는 값이 거리 셈에 그대로 실린다.
    expect(metrics['distance-count']).toBe((576 + 18) * 18 * 2);
  });

  it('첫 물음점을 끝까지 판정한다', async () => {
    const { events } = await record(data(), { until: (e) => e.type === 'verdict' });
    const begin = events.find((e) => e.type === 'query-begin');
    expect(begin?.payload).toMatchObject({ index: 0, total: 6, x: 4.2, y: 3.2, ownLabel: 1 });

    const taken = events.filter((e) => e.type === 'neighbor-taken');
    expect(taken).toHaveLength(3);
    expect(taken[0].target).toBe('point:17');
    // 자기 자신이 첫 이웃이라 거리는 0 이다.
    expect((taken[0].payload as { radius: number }).radius).toBe(0);
    // 테두리는 뽑을수록 자란다.
    const radii = taken.map((e) => (e.payload as { radius: number }).radius);
    expect(radii[0]).toBeLessThan(radii[1]);
    expect(radii[1]).toBeLessThan(radii[2]);

    const verdict = events.find((e) => e.type === 'verdict');
    expect(verdict?.payload).toMatchObject({
      label: 0,
      votesA: 2,
      votesB: 1,
      ownLabel: 1,
      agrees: false,
    });
  });

  it('물을 때마다 자료 전부를 다시 훑는다 — 학습이 없다', async () => {
    const { events } = await record(data(), { until: (e) => e.type === 'distances-measured' });
    const measured = events.filter((e) => e.type === 'distances-measured');
    expect(measured).toHaveLength(1);
    expect((measured[0].payload as { dists: number[] }).dists).toHaveLength(18);
  });

  it('k 를 옮겨도 처음으로 돌아가지 않고 그 자리를 다시 판정한다', async () => {
    const { events } = await record(data(), {
      // 첫 물음점을 판정한 **뒤에** k 를 옮긴다. 그 자리를 새 k 로 다시 판정하고
      // (verdict 2) 거기서 멈춰 둘을 견준다.
      feedOn: (e, all) =>
        e.type === 'verdict' && all.filter((x) => x.type === 'verdict').length === 1
          ? { type: 'k', payload: { value: 1 } }
          : null,
      until: (_e, all) => all.filter((x) => x.type === 'verdict').length === 2,
    });
    const begins = events.filter((e) => e.type === 'query-begin');
    expect(begins.map((e) => (e.payload as { index: number }).index)).toEqual([0, 0]);
    const verdicts = events.filter((e) => e.type === 'verdict');
    // k = 3 에서는 삼켜지고, k = 1 에서는 제 이름표를 지킨다.
    expect(verdicts.map((e) => (e.payload as { label: number }).label)).toEqual([0, 1]);
    expect(verdicts.map((e) => (e.payload as { agrees: boolean }).agrees)).toEqual([false, true]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5·6. happy-dom 에 띄워 굴리고, 화면에 뜬 수를 실측한다.
// ─────────────────────────────────────────────────────────────────────────────

function nextTick(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe('knn 마운트', () => {
  it('띄우면 캔버스가 붙고 화면의 수가 알고리즘이 셈한 값이다', async () => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    registerKnn();

    const errors: unknown[][] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(knnFacet, host);
    await nextTick(60);

    const svg = host.querySelector('svg');
    expect(svg).not.toBeNull();
    const viewBox = svg?.getAttribute('viewBox');
    expect(viewBox).toBe('0 0 760 456');
    // 격자 576 칸이 실제로 그려졌다.
    expect(svg?.querySelectorAll('rect').length).toBeGreaterThan(576);

    const screen = svg?.textContent ?? '';
    expect(screen).toContain(String(SPEC_A_CELLS[3]));
    expect(screen).toContain('576');

    const readMetric = (name: string): string =>
      host.querySelector(`.facet-control-bar__metric--${name}`)?.textContent ?? '';
    expect(readMetric('grid-a-count')).toContain(String(SPEC_A_CELLS[3]));
    expect(readMetric('mislabel-count')).toContain('3');
    // 마운트하자마자 물음점을 돌기 시작하므로 잰 거리는 계속 는다. 격자 한 판이
    // 바닥이고, 그 뒤로는 물음 하나마다 자료 수(18)씩만 붙는다.
    const distances = Number(readMetric('distance-count').replace(/\D+/g, ''));
    expect(distances).toBeGreaterThanOrEqual((576 + 18) * 18);
    expect(distances % 18).toBe(0);

    // 재생 중에도 viewBox 는 그대로다.
    await nextTick(600);
    expect(svg?.getAttribute('viewBox')).toBe(viewBox);
    // 물음점을 돌고 있다 — 물음점에서 자료 열여덟로 뻗은 실오라기가 그려졌다.
    expect(svg?.querySelectorAll('line').length).toBeGreaterThan(18);

    handle.destroy();
    await nextTick(40);
    expect(host.querySelector('svg')).toBeNull();
    expect(errors).toEqual([]);
    console.error = original;
    host.remove();
  }, 20_000);

  it('k 슬라이더를 옮기면 화면의 수가 그 k 의 값으로 바뀐다', async () => {
    clearRegistry();
    clearViewCatalog();
    registerBuiltinViews();
    registerKnn();

    const host = document.createElement('div');
    document.body.appendChild(host);
    const handle = runFacet(knnFacet, host);
    await nextTick(60);

    const svg = host.querySelector('svg');
    expect(svg?.textContent ?? '').toContain(String(SPEC_A_CELLS[3]));

    // 슬라이더 구간을 실제로 눌러 mechanism.dispatch 경로를 탄다.
    const cells = host.querySelectorAll<HTMLElement>('[data-seg-index]');
    expect(cells.length).toBe(4);
    cells[3].click();
    // 이웃을 세는 도중에 눌러도 걸음 하나 안에서 받는다 (visit 이 'interrupted').
    await nextTick(700);

    const screen = svg?.textContent ?? '';
    expect(screen).toContain(String(SPEC_A_CELLS[15]));
    // 3 → 15 로 옮기면 576 중 마흔 칸의 판정이 뒤집힌다.
    expect(screen).toContain('40');

    handle.destroy();
    host.remove();
  }, 20_000);
});

// ─────────────────────────────────────────────────────────────────────────────
// 코드 패널 배선 — phase 하나가 패널까지 닿는가 (C3 · 코어의 전수 검사와 같은 결).
// ─────────────────────────────────────────────────────────────────────────────

describe('knn projector', () => {
  it('phase 를 코드 패널로 넘긴다', async () => {
    const seen: Array<string | null> = [];
    const calls: string[] = [];
    const stage = new Proxy(
      {},
      {
        get: (_t, key) =>
          key === 'then'
            ? undefined
            : () => {
                calls.push(String(key));
              },
      },
    );
    const projector = knnProjector({
      stage: stage as never,
      codePanel: {
        highlightPhase: (p: string | null) => seen.push(p),
        clearHighlight: () => seen.push(null),
      } as never,
    });
    for (const phase of PHASES) {
      await projector.onEvent({ type: 'phase', payload: { phase }, silent: true });
    }
    expect(seen).toEqual(PHASES);

    // 모든 이벤트가 stage 의 어느 메서드로든 간다 — 조용히 사라지는 것이 없다.
    await projector.onEvent({ type: 'boundary-drawn', payload: { k: 3, cells: [], gridSize: 24 } });
    await projector.onEvent({ type: 'query-begin', payload: { index: 0, total: 6, x: 1, y: 1 } });
    await projector.onEvent({ type: 'distances-measured', payload: { dists: [1] } });
    await projector.onEvent({ type: 'neighbor-taken', payload: { index: 0, rank: 0, radius: 1 } });
    await projector.onEvent({ type: 'vote-cast', payload: { votesA: 1, votesB: 0 } });
    await projector.onEvent({ type: 'verdict', payload: { label: 0, votesA: 1, votesB: 0 } });
    await projector.onEvent({ type: 'done' });
    expect(calls).toEqual([
      'setBoundary',
      'beginQuery',
      'showDistances',
      'takeNeighbor',
      'castVote',
      'setVerdict',
      'finish',
    ]);
  });
});
