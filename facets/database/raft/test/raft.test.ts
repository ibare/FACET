// @vitest-environment happy-dom
/**
 * raft — facet 고유의 주장.
 *   1. IR `reachMajority` 의 답이 모든 손잡이 조합(3 × 4)에서 algorithm 의 선출 · 확정 시각과 같고, 사양 표와 같다
 *   2. 걸음 수 · 계기가 사양 표와 같다. 회차 대조 5·1 → 3·2 → 5·1
 *   3. 사다리가 segments[].value 와 같다. 자료 길이가 사다리 끝값을 받친다
 *   4. 무대를 mountView 로 올려 한 판의 이벤트를 projector 로 흘려도 던지지 않는다
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { raftAlgorithm, raftFacet, raftImperativeIR, raftProjector, raftStageView, type RaftData } from '../src/index.js';

const data = raftFacet.initialData as RaftData;

type Input = { type: string; payload: Record<string, unknown> };
type Round = { events: FacetRuntimeEvent[]; steps: number; metrics: Record<string, number> };

/** 첫 판 + 입력마다 한 판. 판마다 이벤트 · 걸음 수(sleep 수) · 그때까지 쌓인 계기 합을 모은다. */
async function drive(inputs: Input[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals: Record<string, number> = {};
  let current: Round = { events: [], steps: 0, metrics: {} };
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      current.events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      totals[name] = (totals[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      current.steps += 1;
      return !cancelled;
    },
    async waitForInput() {
      current.metrics = { ...totals };
      rounds.push(current);
      current = { events: [], steps: 0, metrics: {} };
      const next = queue.shift();
      if (next) return next;
      cancelled = true;
      throw new Error('취소');
    },
    pollInput() {
      return null;
    },
  };
  await raftAlgorithm(ctx as never);
  return rounds;
}

const knob = (type: 'nodes' | 'stopped', value: number, state: { nodes: number; stopped: number }): Input => ({
  type,
  payload: { value, segmentIndex: 0, nodes: String(state.nodes), stopped: String(state.stopped) },
});

/** 한 판을 (n, f) 에서 — 기본 5 · 1 에서 손잡이 둘을 돌려 닿는다 */
async function playAt(n: number, f: number): Promise<Round> {
  const rounds = await drive([knob('nodes', n, { nodes: 5, stopped: 1 }), knob('stopped', f, { nodes: n, stopped: 1 })]);
  const last = rounds[rounds.length - 1];
  if (!last) throw new Error('판이 없다');
  return last;
}

/** 판이 내놓은 선출 시각 — done 의 electMs, 못 닿으면 −1 */
function electedAt(r: Round): number {
  const done = r.events.find((e) => e.type === 'done');
  if (!done) return -1;
  const p = done.payload as Record<string, unknown>;
  expect(p.electMs).toBe(p.commitMs);
  return p.electMs as number;
}

// 사양 실측표: [노드, 멈춘 수, majority, live-nodes, 시각(−1 = 없음), committed-writes, 걸음]
const SPEC: [number, number, number, number, number, number, number][] = [
  [3, 0, 2, 3, 20, 1, 8],
  [3, 1, 2, 2, 20, 1, 6],
  [3, 2, 2, 1, -1, 0, 3],
  [3, 3, 2, 0, -1, 0, 2],
  [5, 0, 3, 5, 40, 1, 10],
  [5, 1, 3, 4, 40, 1, 10],
  [5, 2, 3, 3, 40, 1, 8],
  [5, 3, 3, 2, -1, 0, 4],
  [7, 0, 4, 7, 60, 1, 12],
  [7, 1, 4, 6, 60, 1, 12],
  [7, 2, 4, 5, 60, 1, 12],
  [7, 3, 4, 4, 60, 1, 10],
];

describe('raft', () => {
  it('IR 과 algorithm 이 모든 조합에서 같은 시각을 내고 사양 표와 맞는다', async () => {
    for (const [n, f, majority, live, ms, committed, steps] of SPEC) {
      const round = await playAt(n, f);
      const ir = runIR(raftImperativeIR, 'reachMajority', [n, f, data.rtt.slice(0, n - 1)]);
      expect(ir, `${n}·${f} IR`).toBe(ms);
      expect(electedAt(round), `${n}·${f} algorithm`).toBe(ms);
      expect(round.steps, `${n}·${f} 걸음`).toBe(steps);
      expect(round.metrics.majority, `${n}·${f} majority`).toBe(majority);
      expect(round.metrics['live-nodes'], `${n}·${f} live-nodes`).toBe(live);
      expect(round.metrics['committed-writes'], `${n}·${f} committed-writes`).toBe(committed);
    }
  });

  it('회차 대조 5·1 → 3·2 → 5·1 — 계기가 판마다 그 판의 값이다', async () => {
    const rounds = await drive([
      knob('nodes', 3, { nodes: 5, stopped: 1 }),
      knob('stopped', 2, { nodes: 3, stopped: 1 }),
      knob('nodes', 5, { nodes: 3, stopped: 2 }),
      knob('stopped', 1, { nodes: 5, stopped: 2 }),
    ]);
    const pick = (i: number) => {
      const r = rounds[i];
      if (!r) throw new Error(`판 ${i} 이 없다`);
      return [r.metrics.majority, r.metrics['live-nodes'], r.metrics['committed-writes']];
    };
    expect(pick(0)).toEqual([3, 4, 1]); // 5·1
    expect(pick(2)).toEqual([2, 1, 0]); // 3·2
    expect(pick(4)).toEqual([3, 4, 1]); // 5·1
  });

  it('첫 판 걸음 차례가 사양과 같다 (5·1)', async () => {
    const [first] = await drive([]);
    if (!first) throw new Error('첫 판이 없다');
    const seq = first.events.map((e) =>
      e.type === 'phase' ? `#${(e.payload as { phase: string }).phase}` : e.type,
    );
    expect(seq).toEqual([
      '#init',
      'round',
      '#init',
      'candidate',
      '#count',
      'response',
      '#majority',
      'response',
      'overflow',
      '#init',
      'write',
      '#count',
      'response',
      '#majority',
      'response',
      'overflow',
      'done',
    ]);
    const done = first.events.find((e) => e.type === 'done');
    expect(done?.payload).toMatchObject({ leader: 'S1', electMs: 40, commitMs: 40, count: 4, n: 5, missing: ['S5'] });
  });

  it('사다리가 손잡이 구간과 같고 자료가 사다리 끝값을 받친다', () => {
    const controls = (raftFacet.blocks.controls as { controls: { name?: string; segments?: { value: number }[] }[] }).controls;
    const values = (name: string) => controls.find((c) => c.name === name)?.segments?.map((s) => s.value);
    expect(values('nodes')).toEqual(data.nodesLadder);
    expect(values('stopped')).toEqual(data.stoppedLadder);
    expect(data.nodesLadder[data.nodesLadder.length - 1]).toBe(7);
    expect(data.nodes).toHaveLength(7);
    expect(data.rtt).toHaveLength(6);
    expect(Math.max(...data.stoppedLadder)).toBe(3);
  });

  it('무대를 mountView 로 올려 판 셋을 흘려도 던지지 않고 캡션이 판의 수를 말한다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const t = makeTranslator('en');
    const stage = mountView(raftStageView, container, { config: {}, initialData: data, locale: 'en', t });
    const proj = raftProjector({ stage }, { getSpeed: () => 1, t });
    const rounds = await drive([knob('nodes', 3, { nodes: 5, stopped: 1 }), knob('stopped', 3, { nodes: 3, stopped: 1 })]);
    const captions: string[] = [];
    for (const r of rounds) {
      for (const e of r.events) await proj.onEvent(e);
      captions.push(container.querySelector('svg')?.textContent ?? '');
    }
    expect(captions[0]).toContain('Copies 4 / 5');
    expect(captions[2]).toContain('No node to wake');
    stage.destroy();
  });
});
