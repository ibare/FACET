// @vitest-environment happy-dom
/**
 * 문서와 키-값 — facet 고유의 주장.
 *
 *   1. 아홉 조합(담는 법 셋 × 질의 셋)의 읽기 · 쓰기 · 걸음 수 · 답이 사양 실측표와 같다
 *   2. 가장 적게 건드린 쪽이 질의를 따라 문서·키-값 → 문서 → 표 셋으로 옮겨 간다 (동률 포함)
 *   3. 회차별 계기 — 문서·통째 → 키-값·고치기 → 문서·통째 = reads 1 → 3 → 1 · writes 0 → 2 → 0
 *   4. 사다리가 segments[].value 와 같다
 *   5. 무대 — 키-값의 값은 GET 전에는 글자가 없고, GET 뒤 앱 쪽에서 펼쳐진다
 *
 * IR 은 두지 않는다 (irs.ts 의 까닭 주석) — IR ↔ algorithm 대조는 없다.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  documentKvAlgorithm,
  documentKvFacet,
  documentKvIRs,
  documentKvProjector,
  documentKvStageView,
  foldDocuments,
  planOf,
  type DocumentKvData,
} from '../src/index.js';

const data = documentKvFacet.initialData as DocumentKvData;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

// 사양 실측표 — [질의][담는 법] = [읽기, 쓰기, 걸음(0 과 끝 포함)]
const TABLE: [number, number, number][][] = [
  [[5, 0, 7], [1, 0, 3], [1, 0, 3]],
  [[3, 0, 5], [2, 0, 4], [3, 0, 5]],
  [[0, 1, 3], [0, 2, 4], [3, 2, 7]],
];

describe('document-kv — 사양 실측표', () => {
  it('아홉 조합의 읽기 · 쓰기 · 걸음 수', () => {
    for (const q of data.queryLadder) {
      for (const l of data.layoutLadder) {
        const p = planOf(data, l, q);
        const want = TABLE[q]![l]!;
        expect([p.reads, p.writes, p.ops.length + 2], `질의 ${q} · 담는 법 ${l}`).toEqual(want);
      }
    }
  });

  it('답 — 셋 모두 같은 내용', () => {
    for (const l of data.layoutLadder) {
      expect(planOf(data, l, 0).answer).toEqual({ queryKind: 'whole', order: 101, name: 'Ana', itemCount: 3 });
      expect(planOf(data, l, 1).answer).toEqual({ queryKind: 'where', ids: [101, 103] });
    }
    expect(data.layoutLadder.map((l) => planOf(data, l, 2).answer)).toEqual(
      [1, 2, 2].map((copies) => ({ queryKind: 'update', copies })),
    );
  });

  it('걸음 차례 — sim.py 의 목록', () => {
    const name = (l: number, q: number) =>
      planOf(data, l, q).ops.map((o) =>
        o.kind === 'read-row' || o.kind === 'write-row'
          ? `${o.kind} ${o.table} ${o.pos}`
          : o.kind === 'read-doc' || o.kind === 'write-doc'
            ? `${o.kind} ${o.doc}`
            : `${o.kind} ${o.key}${o.kind === 'get' && o.hit !== null ? ` ${o.found} ${o.hit}` : ''}`,
      );
    expect(name(0, 0)).toEqual(['read-row orders 1', 'read-row customers 1', 'read-row items 1', 'read-row items 3', 'read-row items 5']);
    expect(name(2, 1)).toEqual(['get order:101 Lima true', 'get order:102 Oslo false', 'get order:103 Lima true']);
    expect(name(2, 2)).toEqual(['get order:101 Ana true', 'put order:101', 'get order:102 Ben false', 'get order:103 Ana true', 'put order:103']);
    expect(name(0, 2)).toEqual(['write-row customers 1']);
    expect(name(1, 2)).toEqual(['write-doc 101', 'write-doc 103']);
  });

  it('가장 적게 건드린 쪽이 질의를 따라 옮겨 간다 (통째 읽기에서 동률)', () => {
    const fewest = (q: number) => {
      const totals = data.layoutLadder.map((l) => {
        const p = planOf(data, l, q);
        return p.reads + p.writes;
      });
      const least = Math.min(...totals);
      return data.layoutLadder.filter((_, i) => totals[i] === least);
    };
    expect(data.queryLadder.map(fewest)).toEqual([[1, 2], [1], [0]]);
  });

  it('문서는 표 셋에서 접는다 — c3 는 어디에도 없다', () => {
    const docs = foldDocuments(data);
    expect(docs.map((d) => d.id)).toEqual([101, 102, 103]);
    expect(docs.map((d) => d.items.length)).toEqual([3, 2, 1]);
    expect(JSON.stringify(docs)).not.toContain('Cho');
  });

  it('IR 을 두지 않는다', () => {
    expect(documentKvIRs).toEqual([]);
  });
});

describe('document-kv — 사다리', () => {
  it('segments[].value 와 initialData 의 사다리가 같다', () => {
    const controls = (documentKvFacet.blocks.controls as { controls: { action: string; segments?: { value: number }[] }[] }).controls;
    const seg = (a: string) => controls.find((c) => c.action === a)?.segments?.map((s) => s.value);
    expect(seg('layout')).toEqual(data.layoutLadder);
    expect(seg('query')).toEqual(data.queryLadder);
    expect(data.layoutLadder).toHaveLength(3);
    expect(data.queryLadder).toHaveLength(3);
    expect(data.layoutLadder.at(-1)).toBe(2);
    expect(data.queryLadder.at(-1)).toBe(2);
  });
});

type Input = { type: string; payload: Record<string, unknown> };

/** 알고리즘을 입력 차례대로 돌려 판마다 (계기 합, 발신) 을 모은다. */
async function drive(inputs: Input[]): Promise<{ metrics: Record<string, number>; events: FacetRuntimeEvent[] }[]> {
  const rounds: { metrics: Record<string, number>; events: FacetRuntimeEvent[] }[] = [];
  const totals: Record<string, number> = {};
  let events: FacetRuntimeEvent[] = [];
  let cancelled = false;
  const queue = [...inputs];
  let done!: () => void;
  const finished = new Promise<void>((r) => (done = r));
  const ctx = {
    data: clone(data),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ metrics: { ...totals }, events });
      events = [];
      const next = queue.shift();
      if (!next) {
        done();
        return new Promise<never>(() => {});
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  void documentKvAlgorithm(ctx as never);
  await finished;
  cancelled = true;
  return rounds;
}

describe('document-kv — 회차별 계기', () => {
  it('문서·통째 → 키-값·고치기 → 문서·통째', async () => {
    const rounds = await drive([
      { type: 'layout', payload: { value: 2 } },
      { type: 'query', payload: { value: 2 } },
      { type: 'layout', payload: { value: 1 } },
      { type: 'query', payload: { value: 0 } },
    ]);
    const at = (i: number) => [rounds[i]!.metrics.reads, rounds[i]!.metrics.writes];
    expect(at(0)).toEqual([1, 0]); // 문서·통째
    expect(at(2)).toEqual([3, 2]); // 키-값·고치기
    expect(at(4)).toEqual([1, 0]); // 문서·통째
  });

  it('사다리 밖의 값은 던진다', async () => {
    const ctx = {
      data: clone(data),
      cancelled: false,
      metric() {},
      async emit() {},
      async sleep() {
        return true;
      },
      async waitForInput() {
        return { type: 'layout', payload: { value: 7 } };
      },
      pollInput() {
        return null;
      },
    };
    await expect(documentKvAlgorithm(ctx as never)).rejects.toThrow(/사다리 밖/);
  });
});

describe('document-kv — 무대', () => {
  it('키-값의 값은 GET 전에는 글자가 없고 GET 뒤 앱 쪽에서 펼쳐진다', async () => {
    const rounds = await drive([{ type: 'layout', payload: { value: 2 } }, { type: 'query', payload: { value: 1 } }]);
    const events = rounds[2]!.events; // 키-값 · 값 속 조건
    const container = document.createElement('div');
    const stage = mountView(documentKvStageView, container, { config: {}, locale: 'en' });
    const projector = documentKvProjector({ stage }, { getSpeed: () => 1, t: (_k, en, vars) => en.replace(/\{(\w+)\}/g, (_m, n: string) => String(vars?.[n] ?? '')) });
    const store = events.find((e) => e.type === 'store');
    expect(store).toBeDefined();
    await projector.onEvent(store!);
    expect(container.textContent).toContain('order:101');
    expect(container.textContent).not.toContain('"city"');
    for (const e of events.filter((x) => x.type === 'get')) await projector.onEvent(e);
    expect(container.textContent).toContain('"city": "Oslo"');
    await projector.onEvent(events.find((e) => e.type === 'done')!);
    expect(container.textContent).toContain('Answer: orders [101, 103]');
    expect(container.textContent).toContain('Reads: 3 · Writes: 0');
    stage.destroy();
  });
});
