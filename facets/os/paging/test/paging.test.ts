// @vitest-environment happy-dom
/**
 * paging — facet 고유의 주장.
 *   1. IR `countWalks` 의 답 · physical 버퍼가 다섯 칸 수 모두에서 algorithm 과 같다
 *   2. 판 끝 값이 사양 표와 같다 · 손잡이 A → B → A 로 돌려 회차마다 계기가 표와 같다
 *   3. 사다리가 segments[].value 와 같다 · 매개변수 길이 · 사다리 끝값
 *   4. stage 는 mountView 로 마운트해 판 하나를 그려도 던지지 않는다
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import {
  pagingAlgorithm,
  pagingFacet,
  pagingImperativeIR,
  pagingStageView,
  translateAll,
  type PagingData,
  type PagingStage,
  type PagingStep,
} from '../src/index.js';

const data = pagingFacet.initialData as PagingData;

const TABLE: Record<number, { hits: number; walks: number; reads: number; rate: number; final: number[] }> = {
  0: { hits: 0, walks: 16, reads: 32, rate: 0, final: [] },
  1: { hits: 1, walks: 15, reads: 31, rate: 6, final: [1] },
  2: { hits: 3, walks: 13, reads: 29, rate: 19, final: [1, 0] },
  3: { hits: 10, walks: 6, reads: 22, rate: 63, final: [0, 1, 4] },
  4: { hits: 11, walks: 5, reads: 21, rate: 69, final: [0, 1, 2, 4] },
};
const PHYSICAL = [
  0x9a10, 0x9a14, 0x4300, 0x9b20, 0xd040, 0x4308, 0x9c00, 0x2ff0, 0x9c04, 0x4310, 0xd044, 0x9d00, 0x4500, 0x7008, 0x9d04,
  0x4504,
];

function knob(): { values: number[]; initial: number } {
  const controls = (pagingFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
  const slider = controls.find((c) => c.widget === 'segmented-slider');
  if (!slider) throw new Error('손잡이가 없다');
  const segments = slider.segments as { value: number; default?: boolean }[];
  const initial = segments.find((s) => s.default);
  if (!initial) throw new Error('기본 구간이 없다');
  return { values: segments.map((s) => s.value), initial: initial.value };
}

describe('paging — 데이터와 사다리', () => {
  it('사다리가 segments[].value 와 같고 첫 판 값이 기본 구간이다', () => {
    const k = knob();
    expect(data.tlbLadder).toEqual(k.values);
    expect(data.tlbSlots).toBe(k.initial);
    expect(Math.max(...data.tlbLadder)).toBe(4);
  });

  it('매개변수 크기 — 주소 16 · 표 5 · 페이지 4096 (IR 의 리터럴과 같다)', () => {
    expect(data.addresses).toHaveLength(16);
    expect(data.pageTable).toHaveLength(5);
    expect(data.pageBytes).toBe(4096);
  });
});

describe('paging — 사양 표 · IR 대조', () => {
  for (const slots of data.tlbLadder) {
    it(`칸 ${slots}: algorithm 셈이 사양 표와 같고 IR 과 같은 답을 낸다`, () => {
      const run = translateAll(data, slots);
      const row = TABLE[slots]!;
      expect({ hits: run.hits, walks: run.walks, reads: run.reads }).toEqual({
        hits: row.hits,
        walks: row.walks,
        reads: row.reads,
      });
      expect(Math.floor((run.hits * 100 + 8) / 16)).toBe(row.rate);
      expect(run.finalPages).toEqual(row.final);
      expect(run.steps.map((s) => s.physical)).toEqual(PHYSICAL);
      expect(run.tieCount).toBe(0);

      const slotPage = [0, 0, 0, 0];
      const slotFrame = [0, 0, 0, 0];
      const slotUsed = [0, 0, 0, 0];
      const physical = new Array<number>(16).fill(0);
      const walks = runIR(pagingImperativeIR, 'countWalks', [
        [...data.addresses],
        [...data.pageTable],
        slots,
        slotPage,
        slotFrame,
        slotUsed,
        physical,
      ]);
      expect(walks).toBe(run.walks);
      expect(physical).toEqual(run.steps.map((s) => s.physical));
      expect(slotPage.slice(0, slots)).toEqual(run.finalPages);
    });
  }
});

/** 알고리즘을 입력 목록으로 돌려 판마다 계기 끝값을 모은다. */
async function playRounds(inputs: number[]): Promise<{ metrics: Record<string, number>; steps: number }[]> {
  const queue = inputs.map((value) => ({ type: 'tlbSlots', payload: { value, segmentIndex: value, tlbSlots: String(value) } }));
  const totals: Record<string, number> = {};
  const rounds: { metrics: Record<string, number>; steps: number }[] = [];
  let steps = 0;
  let cancelled = false;
  const ctx = {
    data: JSON.parse(JSON.stringify(data)) as PagingData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      void e;
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      steps += 1;
      return true;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      rounds.push({ metrics: { ...totals }, steps });
      steps = 0;
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        return { type: 'none' };
      }
      return next;
    },
  } as unknown as ReactiveContext<PagingData>;
  await pagingAlgorithm(ctx);
  return rounds;
}

describe('paging — 회차별 계기', () => {
  it('2 → 3 → 2 로 돌리면 판마다 사양 표와 같다 (쌓이지 않는다) · 판마다 17 걸음', async () => {
    const rounds = await playRounds([3, 2]);
    expect(rounds).toHaveLength(3);
    const want = [2, 3, 2].map((s) => TABLE[s]!);
    rounds.forEach((r, i) => {
      expect(r.metrics).toEqual({ 'tlb-hits': want[i]!.hits, 'table-walks': want[i]!.walks, 'memory-reads': want[i]!.reads });
      expect(r.steps).toBe(17);
    });
  });

  it('다섯 값을 차례로 돌아도 판 끝 값이 표와 같다', async () => {
    const rounds = await playRounds([0, 1, 3, 4]);
    [2, 0, 1, 3, 4].forEach((s, i) => {
      const row = TABLE[s]!;
      expect(rounds[i]!.metrics).toEqual({ 'tlb-hits': row.hits, 'table-walks': row.walks, 'memory-reads': row.reads });
    });
  });

  it('사다리 밖의 값과 남의 입력은 받지 않는다', async () => {
    const rounds = await playRounds([7]);
    expect(rounds).toHaveLength(2);
  });
});

describe('paging — stage', () => {
  it('mountView 로 마운트해 판 하나를 그리면 실제 주소와 적중률이 화면에 뜬다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const instance = mountView(pagingStageView, container, {
      config: { type: 'paging-stage' },
      initialData: data as unknown as Record<string, unknown>,
      locale: 'en',
    }) as unknown as PagingStage;
    instance.setup({ addresses: data.addresses, pageTable: data.pageTable, pageBytes: data.pageBytes, maxSlots: 4 });
    await instance.startRun(3, 0);
    const run = translateAll(data, 3);
    let hits = 0;
    for (const s of run.steps) {
      if (s.route === 'hit') hits += 1;
      const n = s.index + 1;
      const step: PagingStep = { ...s, hitRate: Math.floor((hits * 100 + Math.floor(n / 2)) / n) };
      await instance.translate(step, 0);
    }
    const txt = container.textContent ?? '';
    expect(txt).toContain('Physical: 0x4504');
    expect(txt).toContain('Hit rate: 63%');
    instance.destroy();
  });
});
