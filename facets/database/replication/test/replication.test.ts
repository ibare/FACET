// @vitest-environment happy-dom
/**
 * 복제와 CAP — facet 고유의 주장.
 *   1. IR(answerAt · freshAt · staleAt) 과 알고리즘이 열 칸 모두에서 같은 답을 낸다
 *   2. 회차별 계기 — 손잡이를 A → B → A 로 돌려 회차마다 사양 표와 견준다
 *   3. 사다리 = segments[].value, 매개변수 배열 길이와 사다리 끝값
 *   4. 무대를 mountView 로 올려 한 판을 그린다
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  computeReplication,
  replicationAlgorithm,
  replicationFacet,
  replicationImperativeIR,
  replicationProjector,
  replicationStageView,
  type ReplicationData,
} from '../src/index.js';

const data = replicationFacet.initialData as ReplicationData;

// 사양 실측표 (python3 sim.py replication) — 대조용. [answer-ms, copies, stale-at-answer, stale-later, refused, 걸음]
const SPEC: Record<string, [number, number, number, number, number, number]> = {
  '0:0': [0, 1, 4, 0, 0, 9],
  '0:1': [30, 2, 3, 0, 0, 9],
  '0:2': [60, 3, 2, 0, 0, 9],
  '0:3': [120, 4, 1, 0, 0, 9],
  '0:4': [300, 5, 0, 0, 0, 9],
  '1:0': [0, 1, 4, 3, 0, 6],
  '1:1': [30, 2, 3, 3, 0, 6],
  '1:2': [0, 0, 0, 0, 1, 5],
  '1:3': [0, 0, 0, 0, 1, 5],
  '1:4': [0, 0, 0, 0, 1, 5],
};

type Knob = { action: string; segments: { value: number }[] };
const knobs = (replicationFacet.blocks.controls as { controls: unknown[] }).controls.filter(
  (c): c is Knob => typeof c === 'object' && c !== null && (c as { widget?: unknown }).widget === 'segmented-slider',
);

describe('replication — 사다리', () => {
  it('사다리가 segments[].value 와 같다', () => {
    const k = knobs.find((x) => x.action === 'waitFor');
    const p = knobs.find((x) => x.action === 'partition');
    expect(k?.segments.map((s) => s.value)).toEqual(data.kLadder);
    expect(p?.segments.map((s) => s.value)).toEqual(data.partitionLadder);
    expect(data.kLadder).toEqual([0, 1, 2, 3, 4]);
    expect(data.partitionLadder).toEqual([0, 1]);
    expect(data.delays).toHaveLength(4);
    expect(data.kLadder[data.kLadder.length - 1]).toBe(data.delays.length);
    expect(data.reachByPartition).toHaveLength(2);
  });
});

describe('replication — IR ↔ 알고리즘 · 사양 표', () => {
  for (const part of data.partitionLadder) {
    for (const k of data.kLadder) {
      it(`갈라짐 ${part} · k ${k}`, () => {
        const r = computeReplication(data, k, part);
        const reach = data.reachByPartition[part]!;
        const n = data.delays.length;
        const ans = runIR(replicationImperativeIR, 'answerAt', [[...data.delays], [...reach], n, k]) as number;
        const acc = ans >= 0 ? 1 : 0;
        const tAns = ans >= 0 ? ans : 0;
        const freshAns = runIR(replicationImperativeIR, 'freshAt', [[...data.delays], [...reach], n, tAns]) as number;
        const s1 = runIR(replicationImperativeIR, 'staleAt', [[...data.delays], [...reach], n, tAns, acc]) as number;
        const s2 = runIR(replicationImperativeIR, 'staleAt', [[...data.delays], [...reach], n, data.lateReadMs, acc]) as number;
        expect(acc === 1).toBe(r.accepted);
        expect(tAns).toBe(r.answerMs);
        expect(acc === 1 ? 1 + freshAns : 0).toBe(r.copies);
        expect(s1).toBe(r.staleAtAnswer);
        expect(s2).toBe(r.staleLater);
        expect(1 - acc).toBe(r.refused);
        expect([r.answerMs, r.copies, r.staleAtAnswer, r.staleLater, r.refused, r.steps]).toEqual(SPEC[`${part}:${k}`]);
      });
    }
  }
});

type Round = { events: FacetRuntimeEvent[]; metrics: Map<string, number>; steps: number };

async function drive(inputs: { type: string; value: number }[]): Promise<Round[]> {
  const totals = new Map<string, number>();
  const rounds: Round[] = [];
  let cur: Round = { events: [], metrics: totals, steps: 0 };
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const done = new Promise<void>((r) => (idle = r));
  const close = (): void => {
    rounds.push({ ...cur, metrics: new Map(totals), steps: cur.steps + 1 }); // 입력 대기가 마지막 걸음의 경계
  };
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(e: FacetRuntimeEvent) {
      cur.events.push(e);
    },
    async sleep() {
      cur.steps += 1;
      return !cancelled;
    },
    async waitForInput() {
      close();
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      cur = { events: [], metrics: totals, steps: 0 };
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  void replicationAlgorithm(ctx as never);
  await done;
  cancelled = true;
  return rounds;
}

describe('replication — 회차별 계기 (A → B → A)', () => {
  it('k 1 → 4 → 1, 갈라짐 켜고 k 2 → 1 → 2 로 돌려 회차마다 표와 같다', async () => {
    const rounds = await drive([
      { type: 'waitFor', value: 4 },
      { type: 'waitFor', value: 1 },
      { type: 'partition', value: 1 },
      { type: 'waitFor', value: 2 },
      { type: 'waitFor', value: 1 },
      { type: 'waitFor', value: 0 },
      { type: 'partition', value: 0 },
    ]);
    const cells = ['0:1', '0:4', '0:1', '1:1', '1:2', '1:1', '1:0', '0:0'];
    expect(rounds).toHaveLength(cells.length);
    rounds.forEach((r, i) => {
      const spec = SPEC[cells[i]!]!;
      const m = r.metrics;
      expect(
        [m.get('answer-ms'), m.get('copies-at-answer'), m.get('stale-at-answer'), m.get('stale-later'), m.get('refused'), r.steps],
        `회차 ${i} (${cells[i]})`,
      ).toEqual(spec);
    });
  });

  it('기본 판의 걸음 차례와 phase — 사양의 9 걸음', async () => {
    const [first] = await drive([]);
    const kinds = first!.events.filter((e) => e.type !== 'phase').map((e) => {
      const p = e.payload as Record<string, unknown>;
      return `${e.type}@${String(p.ms ?? '')}`;
    });
    expect(kinds).toEqual([
      'round-start@',
      'write-arrive@0',
      'follower-write@30',
      'ok@30',
      'read@30',
      'follower-write@60',
      'follower-write@120',
      'follower-write@300',
      'read@400',
    ]);
    const phases = first!.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase);
    expect(phases).toEqual(['count-reachable', 'count-fresh', 'pick-kth', 'count-stale', 'count-fresh', 'count-fresh', 'count-fresh', 'count-stale']);
  });
});

describe('replication — 갈라짐과 거절의 phase', () => {
  // whole-self-check 는 손잡이를 하나씩만 돌려 (갈라짐 있음 · k ≥ 2) 칸에 닿지 않는다 — refuse 는 여기서 잠근다
  it('갈라짐 있음 · k 2 판은 count-reachable · refuse · count-stale · count-stale 차례다', async () => {
    const rounds = await drive([
      { type: 'partition', value: 1 },
      { type: 'waitFor', value: 2 },
    ]);
    const r = rounds[2]!;
    const phases = r.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase);
    expect(phases).toEqual(['count-reachable', 'refuse', 'count-stale', 'count-stale']);
    const kinds = r.events.filter((e) => e.type !== 'phase').map((e) => e.type);
    expect(kinds).toEqual(['round-start', 'write-arrive', 'refuse', 'read', 'read']);
  });
});

describe('replication — 무대', () => {
  it('mountView 로 올려 한 판을 그리고 캡션이 셈한 수를 싣는다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(replicationStageView, container, {
      config: { type: 'replication-stage' },
      initialData: structuredClone(data),
      locale: 'en',
      isInstant: () => true,
    });
    const projector = replicationProjector({ stage }, { getSpeed: () => 1, t: (_k, en, vars) => en.replace(/\{(\w+)\}/g, (_, n: string) => String(vars?.[n] ?? '')) });
    projector.onInit?.(structuredClone(data));
    const [first] = await drive([{ type: 'partition', value: 1 }, { type: 'waitFor', value: 2 }]).then(async (rs) => {
      for (const e of rs[0]!.events) await projector.onEvent(e);
      return rs;
    });
    expect(first).toBeDefined();
    const texts = [...container.querySelectorAll('text')].map((n) => n.textContent ?? '');
    expect(texts).toContain('400 ms · reads from followers: 4 · old values: 0');
    expect(texts.filter((s) => s === 'x=8').length).toBeGreaterThanOrEqual(5);
    stage.destroy();
  });
});
