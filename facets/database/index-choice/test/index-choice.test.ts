// @vitest-environment happy-dom
/**
 * index-choice 고유의 주장 — IR ↔ algorithm 전 조합, 사양 표, 회차별 계기, 사다리, 무대 캡션.
 * 공통분(손잡이가 닿는가 · 덮이는 phase · 계기 누적 · transpiler)은 whole-check 가 잰다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { indexChoiceFacet as facetDecl } from '../src/facet.js';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  btreeCost,
  hashCost,
  indexChoiceAlgorithm,
  indexChoiceFacet,
  indexChoiceImperativeIR,
  indexChoiceInitialData,
  indexChoiceProjector,
  indexChoiceStageView,
  insertWritesOf,
  planOf,
  tablePageCount,
  type IndexChoiceData,
} from '../src/index.js';

const data: IndexChoiceData = indexChoiceInitialData;

/** 잎 사슬 차례로 편 열쇠와 잎 번호 — IR 에 넘기는 값 */
function flatLeaves(d: IndexChoiceData): { keys: number[]; leafOf: number[]; inner: number } {
  const byId = new Map(d.btree.pages.map((p) => [p.id, p]));
  let cur = byId.get(d.btree.root);
  let inner = 0;
  while (cur && cur.kind === 'inner') {
    inner += 1;
    cur = byId.get(cur.children[0] as string);
  }
  const keys: number[] = [];
  const leafOf: number[] = [];
  let i = 0;
  while (cur) {
    for (const k of cur.keys) {
      keys.push(k);
      leafOf.push(i);
    }
    i += 1;
    cur = cur.next === null ? undefined : byId.get(cur.next);
  }
  return { keys, leafOf, inner };
}

const PATH_NAME = { seq: 'Seq', btree: 'B+', hash: 'Hash' } as const;

// 사양 실측표 (python3 sim.py index-choice) — 대조용
const SPEC_PICK = [
  ['Seq 8', 'Seq 8', 'Seq 8', 'Seq 8'],
  ['B+ 4', 'B+ 5', 'B+ 7', 'Seq 8'],
  ['Hash 2', 'Seq 8', 'Seq 8', 'Seq 8'],
  ['Hash 2', 'B+ 5', 'B+ 7', 'Seq 8'],
];
const SPEC_WRITES = [1, 2, 2, 3];

describe('index-choice — 사다리와 자료', () => {
  it('사다리가 segments[].value 와 같고, 질의 SQL 이 lo · hi 를 담는다', () => {
    const bar = indexChoiceFacet.blocks?.controls as { controls: { widget?: string; action?: string; segments?: { value: number }[] }[] };
    const seg = (a: string) => bar.controls.find((c) => c.action === a)?.segments?.map((s) => s.value);
    expect(seg('indexSet')).toEqual(data.indexSets.map((_, i) => i));
    expect(seg('query')).toEqual(data.queries.map((_, i) => i));
    expect(data.indexSets.length).toBe(4);
    expect(data.queries.length).toBe(4);
    expect(data.queries[3]).toMatchObject({ lo: 30, hi: 50 });
    for (const q of data.queries) {
      if (q.lo === q.hi) expect(q.sql).toBe(`SELECT * FROM orders WHERE price = ${q.lo}`);
      else expect(q.sql).toBe(`SELECT * FROM orders WHERE price BETWEEN ${q.lo} AND ${q.hi}`);
    }
    expect(facetDecl).toBe(indexChoiceFacet);
  });

  it('IR 에 넘기는 편 배열이 사양과 같다 — 데이터가 커지면 먼저 깨진다', () => {
    const f = flatLeaves(data);
    expect(f.keys).toEqual([8, 12, 17, 21, 26, 31, 35, 40, 44, 49, 53, 58, 63, 67, 70]);
    expect(f.leafOf).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3]);
    expect(f.inner).toBe(2);
    expect(tablePageCount(data)).toBe(8);
    expect([...data.table.prices].sort((a, b) => a - b)).toEqual(f.keys);
  });
});

describe('index-choice — 사양 표 대조', () => {
  it('질의마다 길의 값과 읽는 페이지', () => {
    const b = data.queries.map((q) => btreeCost(data, q.lo, q.hi));
    const h = data.queries.map((q) => hashCost(data, q.lo, q.hi));
    expect(b.map((c) => c.pages)).toEqual([4, 5, 7, 9]);
    expect(h.map((c) => c.pages)).toEqual([2, 10, 11, 13]);
    expect(b.map((c) => `${c.indexPages.join('→')} + ${c.tablePages.join(' ')}`)).toEqual([
      'R→I2→L3 + T8',
      'R→I1→L2 + T2 T5',
      'R→I1→L2→L3 + T2 T5 T6',
      'R→I1→L2→L3 + T2 T5 T6 T1 T8',
    ]);
    expect(h.map((c) => `${c.indexPages.length} + ${c.tablePages.join(' ')}`)).toEqual([
      '1 + T8',
      '8 + T5 T2',
      '8 + T6 T5 T2',
      '8 + T6 T8 T5 T1 T2',
    ]);
    expect(h[0]?.indexPages).toEqual(['B1']);
  });

  it('손잡이 × 손잡이 → 고른 길 · 읽은 페이지, INSERT 쓴 페이지 — 동률은 걸리지 않는다', () => {
    let ties = 0;
    data.indexSets.forEach((_, si) => {
      data.queries.forEach((_, qi) => {
        const { best, ties: t } = planOf(data, si, qi);
        ties += t;
        expect(`${PATH_NAME[best.path]} ${best.pages}`).toBe(SPEC_PICK[si]?.[qi]);
      });
      expect(insertWritesOf(data, si).length).toBe(SPEC_WRITES[si]);
    });
    expect(ties).toBe(0);
  });

  it('INSERT 는 T8 · L2 (넷 → 다섯) · B6 에 쓴다', () => {
    const w = insertWritesOf(data, 3);
    expect(w.map((x) => x.page)).toEqual(['T8', 'L2', 'B6']);
    expect(w[1]?.entries.map((e) => e.key)).toEqual([26, 31, 35, 38, 40]);
    expect(w[1]?.at).toBe(3);
    expect(w[2]?.entries.map((e) => e.key)).toEqual([70, 38]);
    expect(w[0]?.entries).toEqual([
      { key: 49, row: 'r15' },
      { key: 38, row: 'r16' },
    ]);
  });
});

describe('index-choice — IR ↔ algorithm 전 조합', () => {
  it('cheapestPages · insertWrites 가 열여섯 조합에서 algorithm 과 같다', () => {
    const f = flatLeaves(data);
    data.indexSets.forEach((set, si) => {
      data.queries.forEach((q, qi) => {
        const ir = runIR(indexChoiceImperativeIR, 'cheapestPages', [
          f.keys,
          f.leafOf,
          f.inner,
          data.hash.bucketCount,
          tablePageCount(data),
          q.lo,
          q.hi,
          set.btree,
          set.hash,
        ]);
        expect(ir).toBe(planOf(data, si, qi).best.pages);
      });
      expect(runIR(indexChoiceImperativeIR, 'insertWrites', [set.btree, set.hash])).toBe(insertWritesOf(data, si).length);
    });
  });

  it('btreePages · hashPages 가 길마다의 값과 같다', () => {
    const f = flatLeaves(data);
    for (const q of data.queries) {
      expect(runIR(indexChoiceImperativeIR, 'btreePages', [f.keys, f.leafOf, f.inner, q.lo, q.hi])).toBe(btreeCost(data, q.lo, q.hi).pages);
      expect(runIR(indexChoiceImperativeIR, 'hashPages', [f.keys, data.hash.bucketCount, q.lo, q.hi])).toBe(hashCost(data, q.lo, q.hi).pages);
    }
  });
});

type Round = { events: FacetRuntimeEvent[]; metrics: Record<string, number>; steps: number };

/** 알고리즘을 입력 차례대로 돌려 판마다 모은다 (걸음 = sleep 수 + 걸음 0 의 입력 대기 끝) */
async function drive(inputs: { type: string; value: number }[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals: Record<string, number> = {};
  let cur: Round = { events: [], metrics: {}, steps: 1 };
  const queue = [...inputs];
  let cancelled = false;
  let done!: () => void;
  const idle = new Promise<void>((r) => (done = r));
  const ctx = {
    data: JSON.parse(JSON.stringify(data)) as IndexChoiceData,
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async emit(e: FacetRuntimeEvent) {
      cur.events.push(e);
    },
    async sleep() {
      cur.steps += 1;
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ ...cur, metrics: { ...totals } });
      const next = queue.shift();
      if (!next) {
        done();
        return new Promise<never>(() => {});
      }
      cur = { events: [], metrics: {}, steps: 1 };
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([indexChoiceAlgorithm(ctx as never), idle]);
  cancelled = true;
  return rounds;
}

describe('index-choice — 회차별 계기와 걸음', () => {
  it('질의를 A → B → A, 인덱스를 A → B → A 로 돌려 회차마다 사양 표와 같다', async () => {
    const rounds = await drive([
      { type: 'query', value: 3 },
      { type: 'query', value: 1 },
      { type: 'indexSet', value: 0 },
      { type: 'indexSet', value: 2 },
      { type: 'indexSet', value: 3 },
      { type: 'query', value: 0 },
    ]);
    const got = rounds.map((r) => [r.metrics['pages-read'], r.metrics['pages-written'], r.steps]);
    expect(got).toEqual([
      [5, 3, 6], // 둘 다 · 30–36
      [8, 3, 6], // 둘 다 · 30–50
      [5, 3, 6], // 둘 다 · 30–36
      [8, 1, 4], // 없음 · 30–36
      [8, 2, 5], // 해시 · 30–36
      [5, 3, 6], // 둘 다 · 30–36
      [2, 3, 6], // 둘 다 · = 49
    ]);
  });

  it('걸리지 않은 길의 걸음은 건너뛴다 — 걸음 수 없음 4 · B+ 5 · 해시 5 · 둘 다 6', async () => {
    const rounds = await drive([0, 1, 2, 3].map((v) => ({ type: 'indexSet', value: v })));
    expect(rounds.slice(1).map((r) => r.steps)).toEqual([4, 5, 5, 6]);
    const phases = rounds[2]?.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase);
    expect(phases).toEqual(['cost-seq', 'cost-btree', 'pick-cheapest', 'insert-write']);
  });

  it('우리 것이 아닌 입력과 사다리 밖 값은 흘린다', async () => {
    const rounds = await drive([
      { type: 'other', value: 1 },
      { type: 'query', value: 9 },
      { type: 'query', value: 2 },
    ]);
    // 흘린 입력은 판을 열지 않는다 — 기다림이 다시 이어질 뿐 발신이 없다
    expect(rounds.map((r) => r.events.length > 0)).toEqual([true, false, false, true]);
    expect(rounds.filter((r) => r.events.length > 0).map((r) => r.metrics['pages-read'])).toEqual([5, 7]);
  });
});

describe('index-choice — 무대', () => {
  it('mountView 로 띄워 한 판을 흘리면 캡션 · 계수의 수가 payload 와 같다', async () => {
    const rounds = await drive([]);
    const first = rounds[0];
    if (!first) throw new Error('판이 없다');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('en', indexChoiceFacet.messages);
    const stage = mountView(indexChoiceStageView, container, { config: {}, initialData: data, t });
    const projector = indexChoiceProjector({ stage }, { getSpeed: () => 1, t });
    projector.onInit?.(data);
    for (const e of first.events) await projector.onEvent(e);
    const text = container.textContent ?? '';
    expect(text).toContain('SELECT * FROM orders WHERE price BETWEEN 30 AND 36');
    expect(text).toContain('INSERT writes one table page and one page per index. Pages written: 3');
    expect(text).toContain('Pages read: 5');
    expect(text).toContain('orders_price_idx');
    stage.destroy();
    container.remove();
  });

  it('initialData 없이 띄워도 던지지 않는다', () => {
    const container = document.createElement('div');
    const stage = mountView(indexChoiceStageView, container, { config: {} });
    expect(() => stage.destroy()).not.toThrow();
  });
});
