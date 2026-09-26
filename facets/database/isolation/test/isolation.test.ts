// @vitest-environment happy-dom
/**
 * 격리 수준과 잠금 — 사양 표 대조 · 회차별 계기 · 사다리 · 무대 마운트.
 * IR 을 두지 않으므로 IR ↔ algorithm 대조는 없다 (irs.ts).
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetContext } from '@ffacet/core/runtime';
import {
  isolationAlgorithm,
  isolationFacet,
  isolationIRs,
  isolationStageView,
  readStepPayload,
  simulateIsolation,
  type IsolationData,
  type IsolationStageApi,
} from '../src/index.js';

const data = isolationFacet.initialData as IsolationData;

/** 사양 실측표 (`python3 sim.py isolation`). */
const TABLE = [
  {
    level: 0,
    dirty: 1, nonRep: 1, phantom: 1, anomalies: 3, waited: 0, peak: 0,
    held: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    order: 'W3(pen=0) · R1(pen) · A3 · R1(lamp) · W2(lamp=55) · C2 · R1(lamp) · Q1 · I4(7, 60) · I4(6, 130) · C4 · Q1 · C1',
    reads: 'pen 0 · lamp 40 → 55', queries: '[2,4,5] → [2,4,5,6]',
  },
  {
    level: 1,
    dirty: 0, nonRep: 1, phantom: 1, anomalies: 2, waited: 1, peak: 0,
    held: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    order: 'W3(pen=0) · A3 · R1(pen) · R1(lamp) · W2(lamp=55) · C2 · R1(lamp) · Q1 · I4(7, 60) · I4(6, 130) · C4 · Q1 · C1',
    reads: 'pen 5 · lamp 40 → 55', queries: '[2,4,5] → [2,4,5,6]',
  },
  {
    level: 2,
    dirty: 0, nonRep: 0, phantom: 1, anomalies: 1, waited: 8, peak: 6,
    held: [0, 0, 1, 2, 2, 5, 5, 5, 5, 6, 0, 0, 0],
    order: 'W3(pen=0) · A3 · R1(pen) · R1(lamp) · R1(lamp) · Q1 · I4(7, 60) · I4(6, 130) · C4 · Q1 · C1 · W2(lamp=55) · C2',
    reads: 'pen 5 · lamp 40 → 40', queries: '[2,4,5] → [2,4,5,6]',
  },
  {
    level: 3,
    dirty: 0, nonRep: 0, phantom: 0, anomalies: 0, waited: 8, peak: 6,
    held: [0, 0, 1, 2, 2, 6, 6, 6, 0, 0, 0, 0, 0],
    order: 'W3(pen=0) · A3 · R1(pen) · R1(lamp) · R1(lamp) · Q1 · I4(7, 60) · Q1 · C1 · W2(lamp=55) · C2 · I4(6, 130) · C4',
    reads: 'pen 5 · lamp 40 → 40', queries: '[2,4,5] → [2,4,5]',
  },
];

describe('isolation — 사양 표 대조', () => {
  it('사다리가 segments[].value 와 같고 연산 열셋 · 끝값 3', () => {
    const controls = (isolationFacet.blocks.controls as { controls: { widget: string; segments?: { value: number }[] }[] }).controls;
    const slider = controls.find((c) => c.widget === 'segmented-slider');
    expect(slider?.segments?.map((s) => s.value)).toEqual(data.levelLadder);
    expect(data.levelLadder).toEqual([0, 1, 2, 3]);
    expect(data.levelLadder[data.levelLadder.length - 1]).toBe(3);
    expect(data.ops.length).toBe(13);
    expect(data.levelNames.length).toBe(4);
    expect(isolationIRs).toEqual([]);
  });

  for (const row of TABLE) {
    it(`수준 ${data.levelNames[row.level]} — 이상 · 기다림 · 잠금 흐름 · 실행 차례 · 읽은 값`, () => {
      const run = simulateIsolation(data, row.level);
      expect(run.steps.length).toBe(14);
      expect(run.dirty).toBe(row.dirty);
      expect(run.nonRepeatable).toBe(row.nonRep);
      expect(run.phantom).toBe(row.phantom);
      const end = run.metrics[run.metrics.length - 1]!;
      expect(end).toEqual({ anomalies: row.anomalies, waitedSteps: row.waited, t1PeakLocks: row.peak });
      expect(run.steps.slice(1).map((s) => s.held)).toEqual(row.held);
      expect(run.execOrder.join(' · ')).toBe(row.order);
      const last = run.steps[run.steps.length - 1]!;
      expect(last.reads.map((r) => `${r.target} ${r.values.join(' → ')}`).join(' · ')).toBe(row.reads);
      expect(last.queries.map((q) => `[${q.join(',')}]`).join(' → ')).toBe(row.queries);
      // 끝 상태는 넷 다 pen 5 · lamp 55 · orders 줄 7
      expect(last.rows.map((r) => [r.name, r.value, r.pendingTx])).toEqual([
        ['pen', 5, null],
        ['lamp', 55, null],
      ]);
      expect(last.table.rows.length).toBe(7);
      expect(last.table.rows.every((r) => r.pendingTx === null)).toBe(true);
    });
  }

  it('SER 의 I4(7, 60) 은 범위 밖이라 막히지 않고, I4(6, 130) 만 범위 잠금에 막힌다', () => {
    const run = simulateIsolation(data, 3);
    const s8 = run.steps[8]!;
    expect(s8.waiting.map((w) => [s8.ops[w.op]!.label, w.blocker, w.mode])).toEqual([
      ['W2(lamp=55)', 'T1', 'S'],
      ['I4(6, 130)', 'T1', 'range'],
    ]);
  });
});

/** 알고리즘을 입력 차례대로 돌려 판마다 계기 끝값을 모은다. */
async function rounds(levels: number[]): Promise<{ anomalies: number; waited: number; peak: number }[]> {
  const totals = new Map<string, number>();
  const out: { anomalies: number; waited: number; peak: number }[] = [];
  const queue = [...levels];
  let cancelled = false;
  let done!: () => void;
  const finished = new Promise<void>((r) => (done = r));
  const snap = (): void => {
    out.push({
      anomalies: totals.get('anomalies') ?? Number.NaN,
      waited: totals.get('waited-steps') ?? Number.NaN,
      peak: totals.get('t1-peak-locks') ?? Number.NaN,
    });
  };
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit() {},
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      snap();
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        done();
        return new Promise<never>(() => {});
      }
      return { type: 'level', payload: { value: next, segmentIndex: next, level: String(next) } };
    },
    pollInput() {
      return null;
    },
  };
  void isolationAlgorithm(ctx as unknown as FacetContext<IsolationData>);
  await finished;
  return out;
}

describe('isolation — 회차별 계기', () => {
  it('RU → RR → SER → RC → RU 회차마다 표와 같다 (판마다 쌓이지 않는다)', async () => {
    const got = await rounds([2, 3, 1, 0]);
    const want = [0, 2, 3, 1, 0].map((lv) => {
      const r = TABLE[lv]!;
      return { anomalies: r.anomalies, waited: r.waited, peak: r.peak };
    });
    expect(got).toEqual(want);
  });
});

describe('isolation — 무대', () => {
  it('걸음 모습을 받아 그리고, 막힌 연산을 실행 차례 뒤로 민다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(isolationStageView, container, {
      config: { type: 'isolation-stage' },
      locale: 'ko',
    }) as unknown as IsolationStageApi & { destroy(): void };
    const run = simulateIsolation(data, 2);
    for (const s of run.steps) inst.showStep(readStepPayload(JSON.parse(JSON.stringify(s))), 0);
    const txt = container.textContent ?? '';
    expect(txt).toContain('REPEATABLE READ');
    expect(txt).toContain('Step 13: C2');
    expect(txt).toContain('lamp 40 → 40');
    inst.destroy();
  });
});
