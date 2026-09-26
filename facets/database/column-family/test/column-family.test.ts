// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import {
  columnFamilyAlgorithm,
  columnFamilyData,
  columnFamilyFacet,
  columnFamilyImperativeIR,
  columnFamilyStageView,
  compareLayouts,
  layoutFamilies,
  readWith,
  type ColumnFamilyData,
  type ColumnFamilyStage,
} from '../src/index.js';

const data = columnFamilyData;

/** 사양 표 (python3 sim.py column-family) — 대조용. 담는 법 × 묻는 칸 1..4 */
const SPEC_PAGES = [
  [5, 5, 5, 5],
  [3, 3, 6, 6],
  [2, 4, 6, 8],
];
const SPEC_FETCHED = [
  [40, 40, 40, 40],
  [20, 20, 40, 40],
  [10, 20, 30, 40],
];
const SPEC_USED = [10, 20, 30, 40];
const SPEC_FEWEST = [2, 1, 0, 0];

type Segment = { value: number; default?: boolean };
type Slider = { widget: string; action: string; segments: Segment[] };

function slider(action: string): Slider {
  const controls = (columnFamilyFacet.blocks.controls as { controls: unknown[] }).controls;
  const found = controls.find((c) => (c as { action?: unknown }).action === action);
  if (!found) throw new Error(`손잡이 ${action} 이 없다`);
  return found as Slider;
}

/** 부르는 쪽이 칸 이름을 칸 차례의 1/0 으로 바꾼다 */
function askedFlags(d: ColumnFamilyData, columns: number): number[] {
  const q = d.queries[d.columnsLadder.indexOf(columns)];
  if (!q) throw new Error(`질의 ${columns} 가 없다`);
  return d.columns.map((c) => (q.asked.includes(c) ? 1 : 0));
}

describe('column-family — 사다리와 데이터', () => {
  it('사다리가 손잡이 segments 와 같고 기본값이 시작값이다', () => {
    const g = slider('grouping');
    const k = slider('columns');
    expect(g.segments.map((s) => s.value)).toEqual(data.groupingLadder);
    expect(k.segments.map((s) => s.value)).toEqual(data.columnsLadder);
    expect(g.segments.find((s) => s.default)?.value).toBe(data.startGrouping);
    expect(k.segments.find((s) => s.default)?.value).toBe(data.startColumns);
    expect(data.groupingLadder).toEqual([0, 1, 2]);
    expect(data.columnsLadder).toEqual([1, 2, 3, 4]);
    expect(data.rows).toHaveLength(10);
    expect(data.columns).toHaveLength(4);
    for (const gr of data.groupings) expect(gr.familyOf).toHaveLength(4);
  });

  it('질의 SQL 이 묻는 칸을 그 차례대로 담고, 묻는 칸은 뒤에서부터 k 개다', () => {
    data.columnsLadder.forEach((k, i) => {
      const q = data.queries[i]!;
      expect(q.asked).toEqual(data.columns.slice(data.columns.length - k));
      expect(q.sql).toBe(`SELECT ${q.asked.join(', ')} FROM ${data.table}`);
    });
  });

  it('담긴 모양이 사양과 같다', () => {
    const fill = (g: number) => layoutFamilies(data, g).map((f) => [f.name, f.pages.map((p) => p.length)]);
    expect(fill(0)).toEqual([['all', [8, 8, 8, 8, 8]]]);
    expect(fill(1)).toEqual([
      ['profile', [8, 8, 4]],
      ['activity', [8, 8, 4]],
    ]);
    expect(fill(2)).toEqual([
      ['name', [8, 2]],
      ['city', [8, 2]],
      ['visits', [8, 2]],
      ['score', [8, 2]],
    ]);
  });
});

describe('column-family — algorithm ↔ IR ↔ 사양 표, 모든 조합', () => {
  for (const g of data.groupingLadder) {
    for (const k of data.columnsLadder) {
      it(`담는 법 ${g} · 묻는 칸 ${k}`, () => {
        const r = readWith(data, g, k);
        const grouping = data.groupings[g]!;
        const args = [grouping.familyOf, askedFlags(data, k), grouping.families.length, data.rows.length];
        const irPages = runIR(columnFamilyImperativeIR, 'pagesRead', [...args, data.cellsPerPage]);
        const irCells = runIR(columnFamilyImperativeIR, 'cellsFetched', args);
        expect(irPages).toBe(r.pagesRead);
        expect(irCells).toBe(r.cellsFetched);
        expect(r.pagesRead).toBe(SPEC_PAGES[g]![k - 1]);
        expect(r.cellsFetched).toBe(SPEC_FETCHED[g]![k - 1]);
        expect(r.cellsUsed).toBe(SPEC_USED[k - 1]);
        // 칸의 상태 수가 셈과 맞는다
        expect(r.cells).toHaveLength(40);
        expect(r.cells.filter((c) => c.state !== 'unread')).toHaveLength(r.cellsFetched);
        expect(r.cells.filter((c) => c.state === 'used')).toHaveLength(r.cellsUsed);
      });
    }
  }

  it('가장 적은 쪽 — 묻는 칸마다 사양과 같고, 가장 적은 자리에 동률이 없다', () => {
    data.columnsLadder.forEach((k, i) => {
      const { bars, fewest, scale } = compareLayouts(data, k);
      expect(fewest).toBe(SPEC_FEWEST[i]);
      const min = Math.min(...bars.map((b) => b.pages));
      expect(bars.filter((b) => b.pages === min)).toHaveLength(1);
      expect(scale).toBe(8);
    });
  });
});

type Run = { events: FacetRuntimeEvent[]; metrics: Map<string, number>; atCount: { pages: number; fetched: number; used: number }[] };

/** 손잡이 입력 차례를 먹여 algorithm 을 돌린다. 입력이 다 떨어지면 취소한다. */
async function play(inputs: { type: string; value: number }[]): Promise<Run> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const atCount: Run['atCount'] = [];
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'count') {
        atCount.push({
          pages: metrics.get('pages-read') ?? NaN,
          fetched: metrics.get('cells-fetched') ?? NaN,
          used: metrics.get('cells-used') ?? NaN,
        });
      }
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: next.type, payload: { value: next.value, segmentIndex: 0 } };
    },
    pollInput() {
      return null;
    },
  } as unknown as ReactiveContext<ColumnFamilyData>;
  await columnFamilyAlgorithm(ctx);
  return { events, metrics, atCount };
}

describe('column-family — 회차별 계기', () => {
  it('손잡이 A → B → A 로 돌려도 회차마다 사양 표와 같다 (쌓이지 않는다)', async () => {
    const run = await play([
      { type: 'columns', value: 4 },
      { type: 'grouping', value: 2 },
      { type: 'columns', value: 2 },
      { type: 'grouping', value: 1 },
      { type: 'nope', value: 1 },
      { type: 'columns', value: 9 },
      { type: 'columns', value: 1 },
    ]);
    // (둘씩,2) → (둘씩,4) → (칸마다,4) → (칸마다,2) → (둘씩,2) → (둘씩,1)
    const combos: [number, number][] = [
      [1, 2],
      [1, 4],
      [2, 4],
      [2, 2],
      [1, 2],
      [1, 1],
    ];
    expect(run.atCount).toHaveLength(combos.length);
    combos.forEach(([g, k], i) => {
      expect(run.atCount[i]).toEqual({ pages: SPEC_PAGES[g]![k - 1], fetched: SPEC_FETCHED[g]![k - 1], used: SPEC_USED[k - 1] });
    });
  });

  it('한 판은 걸음 넷 (round · store · lift · count), phase 는 셋', async () => {
    const run = await play([]);
    expect(run.events.filter((e) => !e.silent).map((e) => e.type)).toEqual(['round', 'store', 'lift', 'count']);
    expect(run.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase)).toEqual([
      'store-family',
      'lift-pages',
      'count-cells',
    ]);
  });
});

describe('column-family — 무대', () => {
  it('initialData 없이 마운트해도 던지지 않는다', () => {
    const host = document.createElement('div');
    const inst = mountView(columnFamilyStageView, host, { config: {} });
    inst.destroy();
  });

  it('칸 마흔이 쪽으로 옮겨 가고 막대 셋이 값을 받는다', async () => {
    const host = document.createElement('div');
    const inst = mountView(columnFamilyStageView, host, {
      config: {},
      initialData: data as unknown as Record<string, unknown>,
      isInstant: () => true,
    });
    const stage = inst as unknown as ColumnFamilyStage;
    const layout = layoutFamilies(data, 1);
    await stage.startRound({ sql: data.queries[1]!.sql, grouping: 1, caption: 'c0', ms: 0 });
    expect(host.textContent).toContain('SELECT visits, score FROM users');
    await stage.store({
      families: layout.map((f) => ({ name: f.name, label: f.name, pages: f.pages.map((cells) => ({ cells })) })),
      caption: 'c1',
      ms: 0,
    });
    const r = readWith(data, 1, 2);
    await stage.lift({ lifted: r.lifted, cells: r.cells, caption: 'c2', ms: 0 });
    const { bars, fewest, scale } = compareLayouts(data, 2);
    await stage.count({ bars, fewest, scale, caption: 'c3', ms: 0 });
    expect(host.textContent).toContain('c3');
    inst.destroy();
  });
});
