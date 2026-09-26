// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  compareValues,
  compositeIndexAlgorithm,
  compositeIndexFacet,
  compositeIndexImperativeIR,
  compositeIndexProjector,
  compositeIndexStageView,
  compositeScan,
  type CompositeIndexData,
} from '../src/index.js';

const data = compositeIndexFacet.initialData as CompositeIndexData;

/** 사양 실측표 (python3 sim.py composite-index) — 대조용 */
const SPEC: Record<string, { start: number | null; scanned: number; from: number; to: number; matches: string }> = {
  '0:0': { start: 7, scanned: 4, from: 7, to: 10, matches: '7→r8 8→r5 9→r1' },
  '0:1': { start: 8, scanned: 2, from: 8, to: 9, matches: '8→r5' },
  '0:2': { start: null, scanned: 12, from: 1, to: 12, matches: '2→r2 5→r7 8→r5 10→r4' },
  '1:0': { start: null, scanned: 12, from: 1, to: 12, matches: '3→r8 6→r5 9→r1' },
  '1:1': { start: 6, scanned: 2, from: 6, to: 7, matches: '6→r5' },
  '1:2': { start: 4, scanned: 5, from: 4, to: 8, matches: '4→r2 5→r7 6→r5 7→r4' },
};

const SORTED_SPEC = [
  'action 2018 r10 · action 2019 r2 · action 2021 r6 · comedy 2018 r3 · comedy 2019 r7 · comedy 2020 r11 · drama 2018 r8 · drama 2019 r5 · drama 2020 r1 · horror 2019 r4 · horror 2020 r12 · horror 2021 r9',
  '2018 action r10 · 2018 comedy r3 · 2018 drama r8 · 2019 action r2 · 2019 comedy r7 · 2019 drama r5 · 2019 horror r4 · 2020 comedy r11 · 2020 drama r1 · 2020 horror r12 · 2021 action r6 · 2021 horror r9',
];

/** 부르는 쪽 — 문자열 열은 바이트 사전순 번호로, 정수 열은 그대로 넘긴다 */
function irArgs(orderIndex: number, queryIndex: number): { args: (number | number[])[]; rows: number[] } {
  const order = data.columnOrders[orderIndex]!;
  const query = data.queries[queryIndex]!;
  const code = (col: string, v: string | number): number => {
    if (typeof v === 'number') return v;
    const distinct = [...new Set(data.rows.map((r) => r[col]))]
      .filter((x): x is string => typeof x === 'string')
      .sort(compareValues);
    const rank = distinct.indexOf(v);
    if (rank < 0) throw new Error(`번호가 없는 값 ${v}`);
    return rank;
  };
  const [c0, c1] = order as [string, string];
  const first = data.rows.map((r) => code(c0, r[c0]!));
  const second = data.rows.map((r) => code(c1, r[c1]!));
  const rows = data.rows.map((_, i) => i + 1);
  const useFirst = c0 in query ? 1 : 0;
  const useSecond = useFirst === 1 && c1 in query ? 1 : 0;
  const qFirst = useFirst ? code(c0, query[c0]!) : 0;
  const qSecond = useSecond ? code(c1, query[c1]!) : 0;
  return { args: [first, second, rows, qFirst, qSecond, useFirst, useSecond], rows };
}

describe('composite-index — 셈', () => {
  it('genre 번호가 바이트 사전순이다', () => {
    const distinct = [...new Set(data.rows.map((r) => r.genre as string))].sort(compareValues);
    expect(distinct).toEqual(['action', 'comedy', 'drama', 'horror']);
  });

  it('정렬된 항목이 사양의 차례와 같다', () => {
    for (let o = 0; o < 2; o++) {
      const r = compositeScan(data, o, 0);
      const line = r.entries.map((e) => `${e.values.join(' ')} r${e.row}`).join(' · ');
      expect(line).toBe(SORTED_SPEC[o]);
    }
  });

  it('모든 손잡이 조합에서 사양 실측표와 같다', () => {
    for (let o = 0; o < data.columnOrders.length; o++) {
      for (let q = 0; q < data.queries.length; q++) {
        const r = compositeScan(data, o, q);
        const spec = SPEC[`${o}:${q}`]!;
        expect(r.mode === 'seek' ? r.startPos : null).toBe(spec.start);
        expect(r.scanned).toBe(spec.scanned);
        expect([r.from, r.to]).toEqual([spec.from, spec.to]);
        expect(r.matches.map((m) => `${m.pos}→r${m.row}`).join(' ')).toBe(spec.matches);
      }
    }
  });

  it('IR 의 답(훑은 항목)과 정렬 차례가 모든 조합에서 알고리즘과 같다', () => {
    for (let o = 0; o < data.columnOrders.length; o++) {
      for (let q = 0; q < data.queries.length; q++) {
        const { args, rows } = irArgs(o, q);
        const got = runIR(compositeIndexImperativeIR, 'scanComposite', args);
        const r = compositeScan(data, o, q);
        expect(got).toBe(r.scanned);
        expect(rows).toEqual(r.entries.map((e) => e.row));
      }
    }
  });

  it('IR 중간값 최대는 2021 이다 (정렬 열쇠)', () => {
    let max = 0;
    for (let o = 0; o < 2; o++) {
      const { args } = irArgs(o, 0);
      max = Math.max(max, ...(args[0] as number[]), ...(args[1] as number[]));
    }
    expect(max).toBe(2021);
  });

  it('사다리가 손잡이 segments 와 같다', () => {
    const controls = (compositeIndexFacet.blocks.controls as { controls: { name?: string; segments?: { value: number; label: unknown }[] }[] }).controls;
    const order = controls.find((c) => c.name === 'columnOrder')!;
    const query = controls.find((c) => c.name === 'query')!;
    expect(order.segments!.map((s) => s.value)).toEqual(data.columnOrders.map((_, i) => i));
    expect(order.segments!.map((s) => s.label)).toEqual(data.columnOrders.map((o) => `(${o.join(', ')})`));
    expect(query.segments!.map((s) => s.value)).toEqual(data.queries.map((_, i) => i));
    expect(data.columnOrders).toEqual([
      ['genre', 'year'],
      ['year', 'genre'],
    ]);
    expect(data.queries).toEqual([{ genre: 'drama' }, { genre: 'drama', year: 2019 }, { year: 2019 }]);
    expect(data.rows).toHaveLength(12);
    expect(data.indexNames).toHaveLength(data.columnOrders.length);
    expect(data.querySql).toHaveLength(data.queries.length);
  });

  it('SQL 문장이 질의 사다리의 조건을 그대로 담는다', () => {
    data.queries.forEach((q, i) => {
      const where = Object.entries(q)
        .map(([c, v]) => (typeof v === 'string' ? `${c} = '${v}'` : `${c} = ${v}`))
        .join(' AND ');
      expect(data.querySql[i]).toBe(`SELECT * FROM ${data.table} WHERE ${where}`);
    });
  });
});

type Input = { type: string; payload: { value: number } };

async function play(inputs: Input[]): Promise<{ events: FacetRuntimeEvent[]; totals: Record<string, number>[] }> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const totals: Record<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  let seen = 0;
  const ctx = {
    data,
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    get cancelled() {
      return cancelled;
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      // 판이 끝나 처음 기다릴 때만 적는다 (흘린 입력 뒤의 대기는 같은 판이다)
      if (events.length !== seen) totals.push({ ...metrics });
      seen = events.length;
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        return { type: 'none' };
      }
      return next;
    },
  };
  await compositeIndexAlgorithm(ctx as never);
  return { events, totals };
}

describe('composite-index — 판', () => {
  it('열 차례를 A → B → A 로 돌려도 회차마다 계기가 사양 표와 같다', async () => {
    const { totals, events } = await play([
      { type: 'columnOrder', payload: { value: 1 } },
      { type: 'columnOrder', payload: { value: 0 } },
      { type: 'query', payload: { value: 2 } },
      { type: 'columnOrder', payload: { value: 1 } },
      { type: 'bogus', payload: { value: 9 } },
      { type: 'query', payload: { value: 7 } },
      { type: 'query', payload: { value: 1 } },
    ]);
    expect(totals).toEqual([
      { 'entries-scanned': 4, 'rows-matched': 3 },
      { 'entries-scanned': 12, 'rows-matched': 3 },
      { 'entries-scanned': 4, 'rows-matched': 3 },
      { 'entries-scanned': 12, 'rows-matched': 4 },
      { 'entries-scanned': 5, 'rows-matched': 4 },
      { 'entries-scanned': 2, 'rows-matched': 1 },
    ]);
    // 판마다 걸음 이벤트 다섯
    const kinds = events.filter((e) => e.type !== 'phase').map((e) => e.type);
    expect(kinds.slice(0, 5)).toEqual(['round', 'sort', 'seek', 'scan', 'fetch']);
    expect(kinds).toHaveLength(6 * 5);
  });

  it('무대에 뜬 캡션의 수가 셈한 수와 같다', async () => {
    const { events } = await play([{ type: 'columnOrder', payload: { value: 1 } }]);
    const container = document.createElement('div');
    const stage = mountView(compositeIndexStageView, container, { config: {}, initialData: data, locale: 'en' });
    const projector = compositeIndexProjector({ stage }, undefined);
    projector.onInit?.(data);
    const captions: string[] = [];
    for (const e of events) {
      await projector.onEvent(e);
      if (e.type !== 'phase') captions.push(container.querySelector('svg')!.textContent ?? '');
    }
    expect(captions[3]).toContain('Entries scanned: 4 (positions 7–10)');
    expect(captions[4]).toContain('Rows matched: 3');
    expect(captions[4]).toContain('7→r8');
    expect(captions[6]).toContain('(year, genre)');
    expect(captions[7]).toContain('Leading column not in WHERE: start at position 1');
    expect(captions[8]).toContain('Entries scanned: 12 (positions 1–12)');
    stage.destroy();
  });
});
