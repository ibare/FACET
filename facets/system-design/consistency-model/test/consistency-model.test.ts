// @vitest-environment happy-dom
/**
 * consistency-model 고유 검수.
 *
 * - 뽑기 차례(짝 표 앞 칸 · 손님 읽기)와 표 길이, 사다리를 잠근다.
 * - 8 조합에서 셈 · IR · 사양 표가 같다.
 * - 섞기 검수: 사본 번호를 바꿔 붙여도(0 번 = 쓰는 사본은 그대로, 짝 표 · 읽기를 같은 순열로 옮김) 규칙 0 의 다섯 수가 같다.
 *   규칙 1 의 돌려보냄은 **고리 차례가 데이터**라 번호 붙임에 기댄다 — 섞기 검수에서 뺀다.
 * - 벗어난 손잡이 값: TS 는 던지고 IR 은 −1.
 * - 걸음 차례 · 대표 phase · 회차별 계기(1 → 2 → 1, 규칙 0 → 1).
 * - 무대 첫 그림이 멱등이다.
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetContext } from '@ffacet/core/runtime';
import {
  consistencyModelAlgorithm,
  consistencyModelFacet,
  consistencyModelImperativeIR,
  consistencyModelProjector,
  consistencyModelStageView,
  drawGossipTable,
  readConsistencyModelData,
  runGossip,
  type ConsistencyModelData,
  type GossipTable,
} from '../src/index.js';

const data = readConsistencyModelData(consistencyModelFacet.initialData);
const N = data.replicas.length;
const table = drawGossipTable(data.seed, data.rounds, N, data.kmax);

// 사양 실측표 (판 끝 값, 씨앗 42)
const SPEC: Record<number, { conv: number; area: number; msgs: number; wasted: number; stale0: number; bounce1: number; perRound: number[] }> = {
  1: { conv: 6, area: 30, msgs: 55, wasted: 44, stale0: 4, bounce1: 11, perRound: [10, 8, 6, 4, 2, 0, 0, 0] },
  2: { conv: 3, area: 14, msgs: 142, wasted: 131, stale0: 1, bounce1: 4, perRound: [9, 5, 0, 0, 0, 0, 0, 0] },
  3: { conv: 3, area: 11, msgs: 222, wasted: 211, stale0: 1, bounce1: 4, perRound: [8, 3, 0, 0, 0, 0, 0, 0] },
  4: { conv: 2, area: 7, msgs: 312, wasted: 301, stale0: 1, bounce1: 4, perRound: [7, 0, 0, 0, 0, 0, 0, 0] },
};

function irRun(fanout: number, rule: number, t: GossipTable = table): { ret: number; result: number[] } {
  const gotAt = new Array<number>(N).fill(0);
  const result = new Array<number>(6).fill(0);
  const ret = runIR(consistencyModelImperativeIR, 'gossipRun', [
    N,
    fanout,
    data.rounds,
    rule,
    data.kmax,
    [...t.partners],
    [...t.reads],
    gotAt,
    result,
  ]);
  if (typeof ret !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return { ret, result };
}

describe('consistency-model — 뽑기와 사다리', () => {
  it('짝 표 384 칸 · 앞 칸 · 손님 읽기', () => {
    expect(table.partners.length).toBe(8 * 12 * 4);
    expect(table.partners.slice(0, 4)).toEqual([1, 8, 9, 11]); // 라운드 1 s1 → s2 s9 s10 s12
    expect(table.partners.slice(4, 8)).toEqual([7, 2, 8, 2]); // 라운드 1 s2 → s8 s3 s9 s3
    expect(table.reads.map((i) => data.replicas[i])).toEqual(['s5', 's4', 's4', 's8', 's5', 's6', 's8', 's4']);
    for (let idx = 0; idx < table.partners.length; idx += 1) {
      const i = Math.floor(idx / data.kmax) % N;
      expect(table.partners[idx]).not.toBe(i);
    }
  });

  it('사다리 = segments[].value', () => {
    const controls = consistencyModelFacet.blocks.controls as { controls: { name?: string; segments?: { value: number }[] }[] };
    const seg = (name: string) => controls.controls.find((c) => c.name === name)?.segments?.map((s) => s.value);
    expect(seg('fanout')).toEqual(data.fanouts);
    expect(seg('readRule')).toEqual(data.rules);
    expect(data.fanouts[data.fanouts.length - 1]).toBe(4);
    expect(data.kmax).toBe(4);
    expect(N).toBe(12);
  });
});

describe('consistency-model — 셈 · IR · 사양 표', () => {
  for (const f of [1, 2, 3, 4]) {
    for (const rule of [0, 1]) {
      it(`퍼뜨림 ${f} · 규칙 ${rule}`, () => {
        const spec = SPEC[f]!;
        const run = runGossip(N, f, data.rounds, rule, data.kmax, table);
        expect(run.rounds.map((r) => r.oldCount)).toEqual(spec.perRound);
        const want = [spec.conv, spec.area, spec.msgs, spec.wasted, rule === 0 ? spec.stale0 : 0, rule === 1 ? spec.bounce1 : 0];
        expect(run.result).toEqual(want);
        const ir = irRun(f, rule);
        expect(ir.result).toEqual(want);
        expect(ir.ret).toBe(spec.area);
      });
    }
  }

  it('벗어난 손잡이 값 — TS 는 던지고 IR 은 −1', () => {
    expect(() => runGossip(N, 5, data.rounds, 0, data.kmax, table)).toThrow();
    expect(() => runGossip(N, 0, data.rounds, 0, data.kmax, table)).toThrow();
    expect(() => runGossip(N, 1, data.rounds, 2, data.kmax, table)).toThrow();
    expect(irRun(5, 0).ret).toBe(-1);
    expect(irRun(0, 0).ret).toBe(-1);
    expect(irRun(1, 2).ret).toBe(-1);
  });

  it('섞기 검수 — 규칙 0 의 다섯 수는 번호 붙임과 무관하다', () => {
    // 0 번은 그대로, 나머지를 고정된 순열로 (섞기도 씨앗 없이 정해 둔다)
    const perm = [0, 7, 3, 11, 1, 9, 5, 2, 10, 4, 8, 6]; // old i → new perm[i]
    const inv = new Array<number>(N);
    perm.forEach((to, from) => (inv[to] = from));
    const partners: number[] = new Array<number>(table.partners.length);
    for (let r = 0; r < data.rounds; r += 1) {
      for (let newI = 0; newI < N; newI += 1) {
        const oldI = inv[newI]!;
        for (let k = 0; k < data.kmax; k += 1) {
          partners[(r * N + newI) * data.kmax + k] = perm[table.partners[(r * N + oldI) * data.kmax + k]!]!;
        }
      }
    }
    const shuffled = { partners, reads: table.reads.map((q) => perm[q]!) };
    for (const f of [1, 2, 3, 4]) {
      const a = runGossip(N, f, data.rounds, 0, data.kmax, table).result.slice(0, 5);
      const b = runGossip(N, f, data.rounds, 0, data.kmax, shuffled).result.slice(0, 5);
      expect(b).toEqual(a);
      expect(irRun(f, 0, shuffled).result.slice(0, 5)).toEqual(a);
    }
  });

  it('중간값 — 짝 표 색인 최대 383', () => {
    expect(((data.rounds - 1) * N + N - 1) * data.kmax + data.kmax - 1).toBe(383);
  });
});

type Emitted = { type: string; payload?: unknown; silent?: boolean };

async function drive(inputs: { type: string; value: number }[]) {
  const events: Emitted[] = [];
  const metrics: Record<string, number> = {};
  const runs: { events: Emitted[]; metrics: Record<string, number> }[] = [];
  let current: Emitted[] = [];
  let cancelled = false;
  let pending = [...inputs];
  const ctx = {
    data: structuredClone(consistencyModelFacet.initialData) as ConsistencyModelData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: Emitted) {
      events.push(e);
      current.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      runs.push({ events: current, metrics: { ...metrics } });
      current = [];
      const next = pending[0];
      pending = pending.slice(1);
      if (!next) {
        cancelled = true;
        return { type: 'noop' };
      }
      return { type: next.type, payload: { value: next.value, segmentIndex: 0 } };
    },
  };
  await consistencyModelAlgorithm(ctx as unknown as FacetContext<ConsistencyModelData>);
  return { events, runs };
}

describe('consistency-model — 걸음 · phase · 계기', () => {
  it('회차마다 17 걸음 · 대표 phase 가 걸음 앞 · 계기가 판마다 0 에서', async () => {
    const { runs } = await drive([
      { type: 'fanout', value: 2 },
      { type: 'fanout', value: 1 },
      { type: 'readRule', value: 1 },
      { type: 'fanout', value: 2 },
    ]);
    const combos = [
      [1, 0],
      [2, 0],
      [1, 0],
      [1, 1],
      [2, 1],
    ] as const;
    expect(runs.length).toBe(combos.length);
    runs.forEach((run, idx) => {
      const [f, rule] = combos[idx]!;
      const spec = SPEC[f]!;
      const steps = run.events.filter((e) => !e.silent);
      expect(steps.length).toBe(17);
      // 걸음 이벤트 바로 앞이 그 걸음의 phase
      run.events.forEach((e, i) => {
        if (e.silent) return;
        const prev = run.events[i - 1];
        expect(prev?.type).toBe('phase');
        const ph = (prev?.payload as { phase: string }).phase;
        if (e.type === 'write') expect(ph).toBe('write');
        if (e.type === 'push') expect(ph).toBe('push');
        if (e.type === 'read') {
          const p = e.payload as { bounced: string[]; stale: boolean };
          expect(ph).toBe(p.bounced.length > 0 ? 'bounce' : p.stale ? 'read-old' : 'read');
        }
      });
      expect(run.metrics).toEqual({
        'old-copies': 0,
        'old-copy-rounds': spec.area,
        messages: spec.msgs,
        'stale-reads': rule === 0 ? spec.stale0 : 0,
        bounces: rule === 1 ? spec.bounce1 : 0,
      });
    });
    // 기본 판에서 켜지는 phase
    const phases = new Set(
      runs[0]!.events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    expect([...phases].sort()).toEqual(['push', 'read', 'read-old', 'write']);
    // 퍼뜨림 1 · 번호 확인 라운드 1: s5 → … → s12 → s1, 돌려보냄 8
    const firstRead = runs[3]!.events.find((e) => e.type === 'read')!.payload as { asked: string[]; bounced: string[] };
    expect(firstRead.bounced).toEqual(['s5', 's6', 's7', 's8', 's9', 's10', 's11', 's12']);
    expect(firstRead.asked[firstRead.asked.length - 1]).toBe('s1');
    // 퍼뜨림 2 · 번호 확인 라운드 1: s5 → s9, 돌려보냄 4
    const f2Read = runs[4]!.events.find((e) => e.type === 'read')!.payload as { asked: string[]; bounced: string[] };
    expect(f2Read.asked).toEqual(['s5', 's6', 's7', 's8', 's9']);
  });

  it('기본 판의 읽기 — 라운드 1..4 옛값, 5 부터 42', async () => {
    const { runs } = await drive([]);
    const reads = runs[0]!.events.filter((e) => e.type === 'read').map((e) => e.payload as { served: string; value: number });
    expect(reads.map((r) => r.value)).toEqual([41, 41, 41, 41, 42, 42, 42, 42]);
    expect(reads.slice(0, 4).map((r) => r.served)).toEqual(['s5', 's4', 's4', 's8']);
  });
});

describe('consistency-model — 무대', () => {
  it('첫 그림이 멱등이고 한 판을 끝까지 그린다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(consistencyModelStageView, container, { config: {} });
    const projector = consistencyModelProjector({ stage }, { getSpeed: () => 1, t: (_k, en, vars) => en.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? `{${k}}`)) });
    const { events } = await drive([]);
    const init = events.find((e) => e.type === 'init')!;
    const count = () => container.querySelectorAll('*').length;
    projector.onEvent(init as never);
    const once = count();
    projector.onEvent(init as never);
    expect(count()).toBe(once);
    for (const e of events) projector.onEvent(e as never);
    projector.onReset?.();
    projector.onEvent(init as never);
    expect(count()).toBe(once);
    stage.destroy();
  });
});
