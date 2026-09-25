// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { getAlgorithmMechanismKind, makeTranslator, mountView } from '@ffacet/core/runtime';
import {
  ethernetAlgorithm,
  ethernetFacet,
  ethernetImperativeIR,
  ethernetStageView,
  registerEthernet,
  simulateCsma,
  WINDOW_CAP_IN_IR,
  type EthernetData,
  type EthernetStage,
} from '../src/index.js';

const data = ethernetFacet.initialData as EthernetData;

/** 사양 실측표 — [충돌, 보냄, 버림, 끝 슬롯, 걸음 수] */
const TABLE: Record<string, [number, number, number, number, number]> = {
  '1/0/2': [1, 2, 0, 7, 4],
  '1/0/4': [11, 4, 0, 24, 16],
  '1/0/8': [25, 1, 7, 28, 27],
  '1/1/2': [1, 2, 0, 7, 4],
  '1/1/4': [3, 4, 0, 17, 8],
  '1/1/8': [11, 8, 0, 66, 20],
  '42/0/2': [1, 2, 0, 7, 4],
  '42/0/4': [10, 4, 0, 23, 15],
  '42/0/8': [24, 2, 6, 30, 27],
  '42/1/2': [1, 2, 0, 7, 4],
  '42/1/4': [5, 4, 0, 33, 10],
  '42/1/8': [7, 8, 0, 50, 16],
  '1234/0/2': [1, 2, 0, 7, 4],
  '1234/0/4': [3, 4, 0, 15, 8],
  '1234/0/8': [25, 0, 8, 25, 26],
  '1234/1/2': [1, 2, 0, 7, 4],
  '1234/1/4': [3, 4, 0, 16, 8],
  '1234/1/8': [9, 8, 0, 44, 18],
};

const combos: [number, number, number][] = [];
for (const seed of data.seeds) for (const policy of [0, 1]) for (const n of data.stationCounts) combos.push([seed, policy, n]);

function segmentValues(action: string): number[] {
  const controls = (ethernetFacet.blocks.controls as { controls: unknown[] }).controls;
  const knob = controls.find(
    (c): c is { action: string; segments: { value: number }[] } =>
      typeof c === 'object' && c !== null && (c as { action?: unknown }).action === action,
  );
  if (!knob) throw new Error(`손잡이 없음: ${action}`);
  return knob.segments.map((s) => s.value);
}

describe('ethernet — 사다리와 선언', () => {
  it('사다리가 segments[].value 와 같다', () => {
    expect(segmentValues('stations')).toEqual(data.stationCounts);
    expect(segmentValues('backoff')).toEqual(data.policies.map((_, i) => i));
    expect(segmentValues('seed')).toEqual(data.seeds);
    expect(data.stationCounts).toHaveLength(3);
    expect(data.stationCounts[data.stationCounts.length - 1]).toBe(8);
    expect(data.stations).toHaveLength(8);
    expect(data.seeds).toEqual([1, 42, 1234]);
  });

  it('IR 의 창 상한이 데이터와 같다', () => {
    expect(data.windowCap).toBe(WINDOW_CAP_IN_IR);
  });

  it('reactive 로 등록된다', () => {
    registerEthernet();
    expect(getAlgorithmMechanismKind('ethernet')).toBe('reactive');
  });
});

describe('ethernet — 셈이 사양 표와 같고 IR 과 같다', () => {
  it.each(combos)('씨앗 %i · 방식 %i · N=%i', (seed, policy, n) => {
    const run = simulateCsma(data, n, policy, seed);
    const want = TABLE[`${seed}/${policy}/${n}`]!;
    expect([run.collisions, run.sent, run.dropped, run.finish, run.events.length + 1]).toEqual(want);

    const zeros = () => new Array<number>(n).fill(0);
    const span = new Array<number>(n).fill(1);
    const rng = [0];
    const report = [0, 0, 0];
    const dropped = runIR(ethernetImperativeIR, 'csmaRun', [
      n, policy, seed, data.frameSlots, data.maxAttempts, zeros(), zeros(), span, zeros(), rng, report,
    ]);
    expect(dropped).toBe(run.dropped);
    expect(report).toEqual([run.finish, run.collisions, run.sent]);
  });

  it('조각 collision-and-backoff 의 판 — N=2 · 고정 · 씨앗 42 의 k 는 A 0 · B 1', () => {
    const run = simulateCsma(data, 2, 0, 42);
    const first = run.events[0]!;
    expect(first.kind).toBe('collide');
    if (first.kind === 'collide') expect(first.picks.map((p) => p.k)).toEqual([0, 1]);
  });

  it('N=4 · 두 배 · 씨앗 42 의 걸음 차례가 사양 대조와 같다', () => {
    const run = simulateCsma(data, 4, 1, 42);
    const brief = run.events.map((e) =>
      e.kind === 'send'
        ? `${e.slot} send ${e.station}`
        : `${e.slot} ` + e.picks.map((p) => `${p.station}:${p.k}/${p.span}->${p.listen}`).join(' '),
    );
    expect(brief).toEqual([
      '0 0:0/2->1 1:1/2->2 2:1/2->2 3:0/2->1',
      '1 0:2/4->4 3:3/4->5',
      '2 1:0/4->3 2:1/4->4',
      '3 send 1',
      '6 0:6/8->13 2:4/8->11 3:6/8->13',
      '11 send 2',
      '14 0:15/16->30 3:11/16->26',
      '26 send 3',
      '30 send 0',
    ]);
  });

  it('창의 최댓값은 64', () => {
    let max = 0;
    for (const [seed, policy, n] of combos) {
      for (const e of simulateCsma(data, n, policy, seed).events) {
        if (e.kind === 'collide') for (const p of e.picks) max = Math.max(max, p.span);
      }
    }
    expect(max).toBe(64);
  });

  it('N=8 · 고정 · 씨앗 42 의 drop 걸음은 슬롯 17 D · 21 G · 22 B F · 23 A E', () => {
    const run = simulateCsma(data, 8, 0, 42);
    const drops = run.events
      .filter((e) => e.kind === 'collide' && e.picks.some((p) => p.dropped))
      .map((e) => (e.kind === 'collide' ? `${e.slot}:${e.picks.filter((p) => p.dropped).map((p) => data.stations[p.station]).join('')}` : ''));
    expect(drops).toEqual(['17:D', '21:G', '22:BF', '23:AE']);
  });
});

/** 알고리즘을 직접 돌려 회차마다의 계기 · phase 를 모은다 */
async function playRounds(inputs: { type: string; value: number }[]) {
  const metrics = new Map<string, number>();
  const rounds: { metrics: Record<string, number>; phases: string[] }[] = [];
  let phases: string[] = [];
  const queue = [...inputs];
  let cancelled = false;
  let finishes = 0;
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: { type: string; payload?: unknown }) {
      if (e.type === 'phase') phases.push((e.payload as { phase: string }).phase);
      if (e.type === 'finish') {
        finishes++;
        rounds.push({ metrics: Object.fromEntries(metrics), phases });
        phases = [];
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
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await ethernetAlgorithm(ctx as never);
  expect(finishes).toBe(inputs.length + 1);
  return rounds;
}

describe('ethernet — 회차별 계기 (A → B → A)', () => {
  it('backoff 고정 → 두 배 → 고정 (N=8 · 씨앗 42)', async () => {
    const rounds = await playRounds([
      { type: 'backoff', value: 1 },
      { type: 'backoff', value: 0 },
    ]);
    const want = [TABLE['42/0/8']!, TABLE['42/1/8']!, TABLE['42/0/8']!];
    rounds.forEach((r, i) => {
      expect(r.metrics).toEqual({
        collisions: want[i]![0],
        'sent-frames': want[i]![1],
        'dropped-frames': want[i]![2],
      });
    });
    expect(new Set(rounds[0]!.phases)).toEqual(new Set(['pick-wait', 'drop', 'send']));
    expect(new Set(rounds[1]!.phases)).toEqual(new Set(['widen', 'send']));
  });

  it('stations 8 → 2 → 8 · seed 42 → 1234 → 42', async () => {
    const rounds = await playRounds([
      { type: 'stations', value: 2 },
      { type: 'stations', value: 8 },
      { type: 'seed', value: 1234 },
      { type: 'seed', value: 42 },
    ]);
    const keys = ['42/0/8', '42/0/2', '42/0/8', '1234/0/8', '42/0/8'];
    rounds.forEach((r, i) => {
      const w = TABLE[keys[i]!]!;
      expect(r.metrics).toEqual({ collisions: w[0], 'sent-frames': w[1], 'dropped-frames': w[2] });
    });
  });

  it('사다리 밖 값은 던진다', async () => {
    await expect(playRounds([{ type: 'stations', value: 3 }])).rejects.toThrow();
  });
});

describe('ethernet — stage', () => {
  it('마운트하고 한 판을 그린다', () => {
    const container = document.createElement('div');
    const inst = mountView(ethernetStageView, container, {
      config: {},
      t: makeTranslator('ko', ethernetFacet.messages),
    }) as unknown as EthernetStage & { destroy(): void };
    inst.startRound({ stations: ['A', 'B'], policy: 0, seed: 42, frameSlots: 3 }, 0);
    inst.collide(
      {
        slot: 0,
        picks: [
          { station: 0, attempt: 1, dropped: false, k: 0, span: 2, listen: 1 },
          { station: 1, attempt: 1, dropped: false, k: 1, span: 2, listen: 2 },
        ],
      },
      0,
    );
    expect(container.textContent).toContain('슬롯 0 · 충돌: A B');
    expect(container.textContent).toContain('다시 들을 슬롯: A 1 · B 2');
    inst.send({ slot: 1, station: 0, until: 3, free: 4 }, 0);
    inst.finish({ slot: 7 }, 0);
    expect(container.textContent).toContain('끝 7');
    inst.destroy();
  });
});
