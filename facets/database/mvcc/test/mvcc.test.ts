// @vitest-environment happy-dom
/**
 * mvcc 고유 검수 — IR ↔ 알고리즘 전 조합, 회차별 계기, 사다리, 무대 마운트.
 * 공통분(손잡이가 닿는가 · 덮이는 phase · 계기 누적 · 옮김)은 whole-check 가 한다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  mvccAlgorithm,
  mvccBuffers,
  mvccEvents,
  mvccOutcome,
  mvccFacet,
  mvccImperativeIR,
  mvccStageView,
  type MvccData,
} from '../src/index.js';

const data = mvccFacet.initialData as MvccData;

/** 사양 실측표 (sim.py mvcc) — 대조용. [first-read, second-read, 청소 뒤 판 수, 걷힌 판, 청소 뒤 판 사슬] */
const SPEC: Record<string, [number, number, number, number, string]> = {
  '0:2': [30, 30, 5, 0, '30[1,3) 31[3,5) 32[5,7) 33[7,9) 34[9,∞)'],
  '0:4': [31, 31, 4, 1, '31[3,5) 32[5,7) 33[7,9) 34[9,∞)'],
  '0:6': [32, 32, 3, 2, '32[5,7) 33[7,9) 34[9,∞)'],
  '0:8': [33, 33, 2, 3, '33[7,9) 34[9,∞)'],
  '0:10': [34, 34, 1, 4, '34[9,∞)'],
  '1:2': [30, 34, 1, 4, '34[9,∞)'],
  '1:4': [31, 34, 1, 4, '34[9,∞)'],
  '1:6': [32, 34, 1, 4, '34[9,∞)'],
  '1:8': [33, 34, 1, 4, '34[9,∞)'],
  '1:10': [34, 34, 1, 4, '34[9,∞)'],
};

const combos = data.modeLadder.flatMap((mode) => data.beginLadder.map((begin) => [mode, begin] as const));

function num(v: unknown): number {
  if (typeof v !== 'number') throw new Error(`수가 아니다: ${String(v)}`);
  return v;
}

/** IR 로 한 판을 끝까지 돈다 — 부르는 쪽이 버퍼를 만든다. */
function irRound(mode: number, begin: number) {
  const buf = mvccBuffers(data);
  const values = [...buf.values];
  const starts = [...buf.starts];
  const ends = [...buf.ends];
  let count = 1;
  const readIndex: number[] = [];
  const counts: number[] = [];
  let maxMid = 0;
  for (const e of mvccEvents(data, begin)) {
    if (e.kind === 'commit') {
      count = num(runIR(mvccImperativeIR, 'commitVersion', [values, starts, ends, count, e.value, e.tick]));
    } else if (e.kind === 'read') {
      const snap = mode === 0 || e.which === 1 ? begin : e.tick;
      readIndex.push(num(runIR(mvccImperativeIR, 'readVersion', [starts, ends, count, snap])));
    } else {
      count = num(runIR(mvccImperativeIR, 'vacuum', [values, starts, ends, count, mode === 0 ? begin : 0]));
    }
    counts.push(count);
    maxMid = Math.max(maxMid, ...values, ...starts, ...ends, count);
  }
  return { values, starts, ends, count, readIndex, counts, maxMid };
}

function chainText(values: number[], starts: number[], ends: number[], count: number): string {
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(`${values[i]}[${starts[i]},${ends[i] === 0 ? '∞' : ends[i]})`);
  return out.join(' ');
}

describe('mvcc — IR 과 알고리즘이 모든 손잡이 조합에서 같은 답을 낸다', () => {
  it.each(combos)('스냅샷 %i · 시작 틱 %i', (mode, begin) => {
    const alg = mvccOutcome(data, mode, begin);
    const ir = irRound(mode, begin);
    expect(ir.readIndex).toEqual(alg.readIndex);
    expect(ir.counts).toEqual(alg.countsAfterEvent);
    expect(ir.values).toEqual(alg.buffers.values);
    expect(ir.starts).toEqual(alg.buffers.starts);
    expect(ir.ends).toEqual(alg.buffers.ends);
    expect(ir.count).toBe(alg.kept);
    expect(ir.maxMid).toBeLessThanOrEqual(34);

    const [first, second, kept, freed, chain] = SPEC[`${mode}:${begin}`];
    expect(alg.reads).toEqual([first, second]);
    expect(alg.kept).toBe(kept);
    expect(alg.freed).toBe(freed);
    expect(chainText(ir.values, ir.starts, ir.ends, ir.count)).toBe(chain);
    expect(alg.steps).toBe(8);
  });

  it('보이는 판이 하나가 아니면 readVersion 은 -1 이다', () => {
    expect(runIR(mvccImperativeIR, 'readVersion', [[1, 1, 0, 0, 0], [0, 0, 0, 0, 0], 2, 1])).toBe(-1);
    expect(runIR(mvccImperativeIR, 'readVersion', [[5, 0, 0, 0, 0], [0, 0, 0, 0, 0], 1, 2])).toBe(-1);
  });
});

type Input = { type: string; payload: Record<string, unknown> };

/** 알고리즘을 입력 목록과 함께 돌리고 회차마다 계기 누적값을 모은다. */
async function runRounds(inputs: Input[]) {
  const totals = new Map<string, number>();
  const rounds: Record<string, number>[] = [];
  const events: FacetRuntimeEvent[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      rounds.push(Object.fromEntries(totals));
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
  };
  await mvccAlgorithm(ctx as never);
  return { rounds, events };
}

describe('mvcc — 회차별 계기', () => {
  it('시작 틱 4 → 8 → 4, 스냅샷을 문장마다로 돌렸다 되돌린다', async () => {
    const { rounds, events } = await runRounds([
      { type: 'readerBegin', payload: { value: 8, segmentIndex: 3 } },
      { type: 'snapshot', payload: { value: 1, segmentIndex: 1 } },
      { type: 'readerBegin', payload: { value: 4, segmentIndex: 1 } },
      { type: 'snapshot', payload: { value: 0, segmentIndex: 0 } },
    ]);
    const expected = ['0:4', '0:8', '1:8', '1:4', '0:4'].map((k) => {
      const [first, second, kept, freed] = SPEC[k];
      return { 'first-read': first, 'second-read': second, 'version-count': kept, 'freed-versions': freed };
    });
    expect(rounds).toEqual(expected);
    // 한 판 = 걸음 8 (silent 가 아닌 이벤트)
    expect(events.filter((e) => !e.silent).length).toBe(8 * 5);
  });

  it('사다리 밖 값과 남의 입력은 흘린다', async () => {
    const { rounds } = await runRounds([
      { type: 'readerBegin', payload: { value: 5, segmentIndex: 0 } },
      { type: 'other', payload: { value: 2 } },
      { type: 'readerBegin', payload: { value: 10, segmentIndex: 4 } },
    ]);
    // 입력 대기마다 한 번 적는다 — 흘린 둘은 판을 새로 돌리지 않는다
    expect(rounds.length).toBe(4);
    expect(rounds[1]).toEqual(rounds[0]);
    expect(rounds[2]).toEqual(rounds[0]);
    expect(rounds[3]['version-count']).toBe(1);
  });
});

describe('mvcc — 사다리와 버퍼', () => {
  it('사다리가 손잡이 구간 값과 같고, 버퍼 길이는 처음 판 + 쓰기 넷', () => {
    const controls = (mvccFacet.blocks.controls as { controls: { name?: string; segments?: { value: number }[] }[] })
      .controls;
    const seg = (name: string) => controls.find((c) => c.name === name)?.segments?.map((s) => s.value);
    expect(seg('snapshot')).toEqual(data.modeLadder);
    expect(seg('readerBegin')).toEqual(data.beginLadder);
    expect(data.beginLadder[data.beginLadder.length - 1]).toBe(10);
    expect(mvccBuffers(data).values.length).toBe(5);
  });
});

describe('mvcc — 무대', () => {
  it('initialData 없이 마운트해도 던지지 않고, 한 판을 그린다', async () => {
    const container = document.createElement('div');
    const inst = mountView(mvccStageView, container, { config: {}, isInstant: () => true }) as unknown as {
      start(p: unknown, ms: number): Promise<void>;
      commit(p: unknown, ms: number): Promise<void>;
      read(p: unknown, ms: number): Promise<void>;
      vacuum(p: unknown, ms: number): Promise<void>;
      destroy(): void;
    };
    await inst.start({ row: 'price', reader: 'TR', versions: [{ value: 30, start: 1, end: 0 }] }, 0);
    await inst.commit(
      {
        versions: [
          { value: 30, start: 1, end: 3 },
          { value: 31, start: 3, end: 0 },
        ],
      },
      0,
    );
    await inst.read({ tick: 4, which: 1, snap: 4, index: 1, value: 31, held: true }, 0);
    await inst.vacuum({ kept: [false, true], versions: [{ value: 31, start: 3, end: 0 }] }, 0);
    expect(container.textContent).toContain('31');
    expect(container.textContent).not.toContain('30[');
    inst.destroy();
  });
});
