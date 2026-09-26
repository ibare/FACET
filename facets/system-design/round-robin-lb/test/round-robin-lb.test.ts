// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  drawRequests,
  hashesOf,
  PHASES,
  readRoundRobinLbData,
  roundRobinLbAlgorithm,
  roundRobinLbFacet,
  roundRobinLbImperativeIR,
  roundRobinLbProjector,
  roundRobinLbStageView,
  simulateRound,
  type RoundRobinLbData,
  type RouteStep,
} from '../src/index.js';

const data = readRoundRobinLbData(roundRobinLbFacet.initialData);

/** 사양 실측표 — [고르는 법][들쭉날쭉 색인] → [치우침 합, 가장 붐빔, 옮겨 간 요청] */
const TABLE: Record<number, [number, number, number][]> = {
  0: [[18, 2, 17], [29, 3, 17], [37, 3, 17], [45, 4, 17]],
  1: [[18, 2, 18], [23, 3, 15], [29, 3, 19], [26, 3, 17]],
  2: [[92, 5, 5], [90, 4, 5], [86, 5, 5], [84, 6, 5]],
  3: [[70, 5, 1], [69, 5, 1], [73, 4, 1], [69, 5, 1]],
};

function runRouteIR(d: RoundRobinLbData, policy: number, spread: number) {
  const { user, hold } = drawRequests(d, spread);
  const { serverRing, keyRing, keyHash12 } = hashesOf(d);
  const n = hold.length;
  const alive = d.servers.map(() => 1);
  const endAt = hold.map(() => 0);
  const chosen = hold.map(() => 0);
  const lastOf = d.keys.map(() => -1);
  const openNow = d.servers.map(() => 0);
  const gapAt = hold.map(() => 0);
  const moved = runIR(roundRobinLbImperativeIR, 'routeRequests', [
    policy,
    hold,
    user,
    serverRing,
    keyRing,
    keyHash12,
    d.servers.indexOf(d.dropServer),
    d.dropTick,
    alive,
    endAt,
    chosen,
    lastOf,
    openNow,
    gapAt,
  ]);
  return { moved, chosen, gapAt, n };
}

describe('round-robin-lb — 데이터 · 사다리', () => {
  it('사다리가 손잡이 segments 의 value 와 같다', () => {
    const controls = (roundRobinLbFacet.blocks.controls as { controls: { action: string; segments?: { value: number }[] }[] })
      .controls;
    const values = (action: string) => controls.find((c) => c.action === action)?.segments?.map((s) => s.value);
    expect(values('policy')).toEqual(data.policies);
    expect(values('spread')).toEqual(data.spreads);
    expect(data.policies).toEqual([0, 1, 2, 3]);
    expect(data.spreads.at(-1)).toBe(5);
    expect(data.servers).toHaveLength(4);
    expect(data.keys).toHaveLength(10);
    expect(data.requests).toBe(32);
  });

  it('해시 · 뽑기가 사양의 대조값과 같다', () => {
    const h = hashesOf(data);
    expect(h.serverRing).toEqual([66, 52, 2, 31]);
    expect(h.keyRing).toEqual([5, 38, 78, 57, 14, 71, 32, 87, 54, 23]);
    expect(h.keyHash12).toEqual([11, 6, 11, 4, 4, 8, 2, 1, 4, 8]);
    const d3 = drawRequests(data, 3);
    expect(d3.user.join(' ')).toBe('0 7 5 6 8 6 5 9 3 2 9 0 0 5 9 3 3 1 8 4 6 4 7 7 2 0 7 6 3 4 9 2');
    expect(d3.hold.join(' ')).toBe('7 9 3 3 4 6 9 3 7 3 6 5 7 5 5 8 3 8 5 9 3 4 9 8 8 5 7 4 9 8 7 9');
    for (const s of data.spreads) expect(drawRequests(data, s).user).toEqual(d3.user);
  });
});

describe('round-robin-lb — 셈', () => {
  it('16 조합의 계기가 사양 실측표와 같다', () => {
    for (const p of data.policies) {
      data.spreads.forEach((s, si) => {
        const r = simulateRound(data, p, s);
        expect([r.imbalance, r.peak, r.moved], `policy ${p} spread ${s}`).toEqual(TABLE[p]?.[si]);
      });
    }
  });

  it('±3 에서 고른 서버 번호가 사양과 같다', () => {
    const want: Record<number, string> = {
      0: '1 2 3 4 1 2 3 4 1 2 3 4 1 2 3 4 1 3 4 1 3 4 1 3 4 1 3 4 1 3 4 1',
      1: '1 2 3 4 1 3 4 1 1 2 1 3 2 2 3 4 1 1 3 1 3 4 1 3 3 4 4 1 1 3 4 1',
      2: '4 2 1 3 1 3 1 1 1 4 1 4 4 1 1 1 3 1 3 3 4 3 3 3 4 4 3 4 3 3 4 4',
      3: '4 3 3 2 1 2 3 4 1 3 4 4 4 3 4 1 1 1 1 4 1 4 3 3 3 4 3 1 1 4 4 3',
    };
    for (const p of data.policies) expect(simulateRound(data, p, 3).chosen.map((c) => c + 1).join(' ')).toBe(want[p]);
  });

  it('IR 이 16 조합 모두에서 고른 서버 · 틱마다 치우침 · 옮김을 algorithm 과 같게 낸다', () => {
    for (const p of data.policies) {
      for (const s of data.spreads) {
        const r = simulateRound(data, p, s);
        const ir = runRouteIR(data, p, s);
        expect(ir.chosen).toEqual(r.chosen);
        expect(ir.gapAt).toEqual(r.gapAt);
        expect(ir.moved).toBe(r.moved);
        expect(ir.gapAt.reduce((a, b) => a + b, 0)).toBe(r.imbalance);
      }
    }
  });

  it('모르는 방식 — TS 는 던지고 IR 은 −1', () => {
    expect(() => simulateRound(data, 4, 3)).toThrow();
    expect(runRouteIR(data, 4, 3).moved).toBe(-1);
  });

  it('서버 목록을 뒤집어도 링 해시의 고른 서버 이름은 같다', () => {
    // 차례 · 최소 연결의 동률 · 나머지 해싱의 다시 번호 매기기는 목록 차례가 규약이라 뒤집으면 달라진다 — 링만 견준다
    const reversed = { ...data, servers: [...data.servers].reverse() };
    for (const s of data.spreads) {
      const a = simulateRound(data, 3, s).chosen.map((c) => data.servers[c]);
      const b = simulateRound(reversed, 3, s).chosen.map((c) => reversed.servers[c]);
      expect(b).toEqual(a);
    }
  });
});

type Recorded = { events: FacetRuntimeEvent[]; metrics: Record<string, number>[] };

/** 입력 차례를 주고 algorithm 을 돌려 판마다 끝의 계기와 발신을 모은다. */
async function play(inputs: { type: string; value: number }[]): Promise<Recorded & { rounds: FacetRuntimeEvent[][] }> {
  const queue = [...inputs];
  const events: FacetRuntimeEvent[] = [];
  const metric: Record<string, number> = {};
  const metrics: Record<string, number>[] = [];
  const rounds: FacetRuntimeEvent[][] = [];
  let cancelled = false;
  const ctx = {
    data: roundRobinLbFacet.initialData as unknown as RoundRobinLbData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      if (e.type === 'init') rounds.push([]);
      rounds.at(-1)?.push(e);
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metric[name] = (metric[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      metrics.push({ ...metric });
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('끝');
      }
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await roundRobinLbAlgorithm(ctx);
  return { events, metrics, rounds };
}

describe('round-robin-lb — 재생', () => {
  it('회차마다 계기가 사양 표와 같다 (차례 → 최소 연결 → 차례, ±3)', async () => {
    const { metrics } = await play([
      { type: 'policy', value: 1 },
      { type: 'policy', value: 0 },
    ]);
    expect(metrics).toEqual([
      { imbalance: 37, 'peak-open': 3, moved: 17 },
      { imbalance: 29, 'peak-open': 3, moved: 19 },
      { imbalance: 37, 'peak-open': 3, moved: 17 },
    ]);
  });

  it('걸음 34 (걸음 0 포함), 걸음 이벤트 바로 앞이 그 걸음의 phase 다', async () => {
    const { rounds } = await play([
      { type: 'policy', value: 1 },
      { type: 'policy', value: 2 },
      { type: 'policy', value: 3 },
    ]);
    const want = ['pick-turn', 'pick-idlest', 'pick-mod', 'pick-ring'];
    const lit = new Set<string>();
    rounds.forEach((evs, ri) => {
      expect(evs[0]?.type).toBe('init');
      expect(evs[0]?.silent).toBe(true);
      const steps = evs.filter((e) => !e.silent);
      expect(steps).toHaveLength(33);
      evs.forEach((e, i) => {
        if (e.silent) return;
        const prev = evs[i - 1];
        expect(prev?.type).toBe('phase');
        const ph = (prev?.payload as { phase: string }).phase;
        lit.add(ph);
        expect(ph).toBe(e.type === 'drop-server' ? 'drop-server' : want[ri]);
      });
      expect(steps.findIndex((e) => e.type === 'drop-server')).toBe(16);
    });
    expect([...lit].sort()).toEqual([...PHASES].sort());
  });

  it('IR 의 phase 집합이 algorithm 과 같다', () => {
    const found = new Set<string>();
    const walk = (x: unknown): void => {
      if (Array.isArray(x)) x.forEach(walk);
      else if (x && typeof x === 'object') {
        const o = x as Record<string, unknown>;
        if (typeof o.phase === 'string') found.add(o.phase);
        Object.values(o).forEach(walk);
      }
    };
    walk(roundRobinLbImperativeIR);
    expect([...found].sort()).toEqual([...PHASES].sort());
  });
});

describe('round-robin-lb — 무대', () => {
  async function mounted() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(roundRobinLbStageView, container, { config: { type: 'round-robin-lb-stage' } });
    const projector = roundRobinLbProjector({ stage }, { getSpeed: () => 1, t: (_k, fb, vars) => fb.replace(/\{(\w+)\}/g, (_m, n: string) => String(vars?.[n] ?? '')) });
    const { rounds } = await play([{ type: 'policy', value: 3 }]);
    return { container, projector, rounds };
  }

  it('첫 그림을 두 번 먹여도 요소 수가 같다 · 되짚기(onReset) 뒤 다시 먹여도 같다', async () => {
    const { container, projector, rounds } = await mounted();
    const init = rounds[0]?.[0];
    if (!init) throw new Error('init 없음');
    projector.onEvent(init);
    const once = container.querySelectorAll('*').length;
    projector.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(once);
    for (const e of rounds[0] ?? []) projector.onEvent(e);
    projector.onReset?.();
    for (const e of rounds[0] ?? []) projector.onEvent(e);
    expect(container.querySelectorAll('*').length).toBe(once);
  });

  it('새 판 걸음 0 에서 앞 판의 결론(빠짐 글자 · 누계 선 · 캡션)을 걷는다', async () => {
    const { container, projector, rounds } = await mounted();
    for (const e of rounds[0] ?? []) projector.onEvent(e);
    const text = () => container.textContent ?? '';
    expect(text()).toContain('Down');
    const next = rounds[1]?.[0];
    if (!next) throw new Error('둘째 판 init 없음');
    projector.onEvent(next);
    expect(text()).not.toContain('Down');
    expect(container.querySelector('polyline')?.getAttribute('points')).toBe('');
  });

  it('캡션의 치우침 · 서버가 걸음의 payload 와 같다', async () => {
    const { container, projector, rounds } = await mounted();
    const evs = rounds[0] ?? [];
    for (const e of evs) projector.onEvent(e);
    const last = evs.filter((e) => e.type === 'route').at(-1) as FacetRuntimeEvent;
    const p = last.payload as RouteStep;
    expect(container.textContent).toContain(`Tick ${p.tick}`);
    expect(container.textContent).toContain(`imbalance ${p.gap}`);
  });
});
