// @vitest-environment happy-dom
/**
 * Q-러닝 — facet 고유의 주장.
 *   1. IR ↔ algorithm: 모든 ε · 다섯 · 모든 이동에서 chooseAction · greedyAction · qUpdate 가 같다 (거울 복도에서도)
 *   2. 사양 표: 판 60 뒤의 끝 탐욕 · 밟아 본 수 · 행위자마다 처음 밟은 판 · 끝 Q · 상 합, 기본 ε 0.2 의 판 차례
 *   3. 회차별 계기: ε 0.2 → 0.5 → 0.2 로 돌려 판마다 사양 값
 *   4. 사다리 = segments[].value · 씨앗 다섯 · 보이는 다섯의 가장 긴 판 10 이동
 *   5. 무대는 mountView 를 거쳐 마운트되고, 판 머리에서 앞 판의 결론을 걷는다
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  chooseAction,
  greedyAction,
  narrowQLearningData,
  qLearningAlgorithm,
  qLearningFacet,
  qLearningImperativeIR,
  qLearningStageView,
  qUpdate,
  runAgent,
  runAll,
  type QLearningData,
  type QLearningStage,
} from '../src/index.js';

const data = narrowQLearningData(qLearningFacet.initialData);
const LADDER = [0, 0.1, 0.2, 0.3, 0.5];
const fx = (v: number): string => v.toFixed(2);

describe('q-learning — 데이터와 사다리', () => {
  it('사다리가 segments[].value 와 같고 씨앗은 다섯이다', () => {
    const controls = (qLearningFacet.blocks.controls as { controls: unknown[] }).controls;
    const knob = controls.find((c) => (c as { widget?: string }).widget === 'segmented-slider') as {
      segments: { value: number; default?: boolean }[];
    };
    expect(knob.segments.map((s) => s.value)).toEqual(data.epsilonLadder);
    expect(data.epsilonLadder).toEqual(LADDER);
    expect(data.epsilonLadder[data.epsilonLadder.length - 1]).toBe(0.5);
    expect(knob.segments.find((s) => s.default)?.value).toBe(data.epsilon);
    expect(data.seeds).toHaveLength(5);
    expect(data.rewards).toHaveLength(4);
  });

  it('보이는 다섯의 가장 긴 판은 10 이동 (이백까지 넣으면 14 — sim) — 한도 40 에 닿지 않는다', () => {
    let longest = 0;
    for (const eps of LADDER) for (const run of runAll(data, eps)) for (const ep of run.episodes) longest = Math.max(longest, ep.moves);
    expect(longest).toBe(10);
  });
});

describe('q-learning — IR ↔ algorithm', () => {
  const check = (d: QLearningData): number => {
    let n = 0;
    for (const eps of LADDER) {
      for (const seed of d.seeds) {
        const run = runAgent(d, eps, seed);
        for (const m of run.moves) {
          const ch = runIR(qLearningImperativeIR, 'chooseAction', [[...m.q], m.s, m.uExplore, m.uDir, eps]);
          expect(ch).toBe(m.action);
          expect(chooseAction(m.q, m.s, m.uExplore, m.uDir, eps)).toBe(m.action);
          const gr = runIR(qLearningImperativeIR, 'greedyAction', [[...m.q], m.s]);
          expect(gr).toBe(greedyAction(m.q, m.s));
          const up = runIR(qLearningImperativeIR, 'qUpdate', [[...m.q], m.s, m.action, m.reward, m.s2, m.terminal, d.alpha, d.gamma]);
          expect(up).toBe(m.newQ);
          const q2 = [...m.q];
          expect(qUpdate(q2, m.s, m.action, m.reward, m.s2, m.terminal, d.alpha, d.gamma)).toBe(m.newQ);
          n += 1;
        }
      }
    }
    return n;
  };

  it('모든 ε · 다섯 · 모든 이동에서 같다', () => {
    expect(check(data)).toBeGreaterThan(1000);
  });

  it('거울 복도(rewards [10, 0, 0, 3])에서도 같다 — 동률은 늘 행동 0', () => {
    const mirror: QLearningData = { ...data, rewards: [10, 0, 0, 3] };
    expect(check(mirror)).toBeGreaterThan(1000);
    expect(greedyAction([0, 0, 0, 0, 0, 0, 0, 0], 1)).toBe(0);
    expect(runIR(qLearningImperativeIR, 'greedyAction', [[0, 0, 0, 0, 0, 0, 0, 0], 1])).toBe(0);
  });
});

describe('q-learning — 사양 표', () => {
  const summary = (eps: number) => {
    const runs = runAll(data, eps);
    return {
      prefer: runs.filter((r) => r.episodes[59]!.greedy === 1).length,
      reached: runs.filter((r) => r.firstBig !== null).length,
      mean: runs.reduce((s, r) => s + r.episodes.reduce((a, e) => a + e.rewardGot, 0), 0) / (5 * 60),
      agents: runs.map((r) => {
        const q = r.episodes[59]!.q;
        return [
          r.firstBig === null ? '—' : String(r.firstBig),
          `${fx(q[2]!)}/${fx(q[3]!)}`,
          `${fx(q[4]!)}/${fx(q[5]!)}`,
          String(r.episodes.reduce((s, e) => s + e.rewardGot, 0)),
        ].join(' · ');
      }),
    };
  };

  it('판 60 뒤 끝 탐욕 오른쪽 · 밟아 본 수 · 판 60 에 걸친 판당 평균 상', () => {
    const expected: Record<number, [number, number, string]> = {
      0: [0, 0, '3.00'],
      0.1: [0, 0, '3.00'],
      0.2: [2, 2, '3.54'],
      0.3: [3, 3, '4.73'],
      0.5: [5, 5, '6.97'],
    };
    for (const eps of LADDER) {
      const s = summary(eps);
      const [prefer, reached, mean] = expected[eps]!;
      expect([s.prefer, s.reached, s.mean.toFixed(2)], `ε ${eps}`).toEqual([prefer, reached, mean]);
    }
  });

  it('행위자마다 처음 밟은 판 · 끝 Q(출발) · Q(칸 2) · 상 합', () => {
    expect(summary(0).agents).toEqual(new Array(5).fill('— · 3.00/0.00 · 0.00/0.00 · 180'));
    expect(summary(0.1).agents).toEqual([
      '— · 3.00/1.57 · 2.53/0.00 · 180',
      '— · 3.00/0.87 · 2.27/0.00 · 180',
      '— · 3.00/0.00 · 0.00/0.00 · 180',
      '— · 3.00/2.22 · 2.67/0.00 · 180',
      '— · 3.00/1.99 · 2.63/0.00 · 180',
    ]);
    expect(summary(0.2).agents).toEqual([
      '— · 3.00/2.41 · 2.70/0.00 · 180',
      '— · 3.00/1.57 · 2.53/0.00 · 180',
      '— · 3.00/1.99 · 2.63/0.00 · 180',
      '26 · 3.00/9.00 · 2.53/10.00 · 285',
      '47 · 3.00/8.94 · 5.15/9.99 · 236',
    ]);
    expect(summary(0.3).agents).toEqual([
      '— · 3.00/2.43 · 2.70/0.00 · 180',
      '— · 3.00/2.33 · 2.69/0.00 · 180',
      '12 · 3.00/9.00 · 7.95/10.00 · 432',
      '22 · 3.00/9.00 · 7.21/10.00 · 362',
      '44 · 3.00/9.00 · 7.16/10.00 · 264',
    ]);
    expect(summary(0.5).agents).toEqual([
      '4 · 3.00/9.00 · 8.10/10.00 · 474',
      '19 · 3.00/9.00 · 8.10/10.00 · 362',
      '4 · 3.00/9.00 · 8.10/10.00 · 418',
      '16 · 3.00/9.00 · 8.08/10.00 · 383',
      '2 · 3.00/9.00 · 8.10/10.00 · 453',
    ]);
  });

  it('기본 ε 0.2 의 판 차례 — 끝 칸 · 밟아 본 수 · 탐욕 오른 수', () => {
    const runs = runAll(data, 0.2);
    const reached = [false, false, false, false, false];
    const at: Record<number, string> = {};
    for (let ep = 0; ep < 60; ep += 1) {
      const ends = runs.map((r) => (r.episodes[ep]!.end === 3 ? 'G' : 'g')).join('');
      runs.forEach((r, i) => {
        if (r.episodes[ep]!.end === 3) reached[i] = true;
      });
      const prefer = runs.filter((r) => r.episodes[ep]!.greedy === 1).length;
      at[ep + 1] = `${ends} · ${reached.filter(Boolean).length} · ${prefer}`;
    }
    expect(at[1]).toBe('ggggg · 0 · 0');
    expect(at[25]).toBe('ggggg · 0 · 0');
    expect(at[26]).toBe('gggGg · 1 · 0');
    expect(at[45]).toBe('gggGg · 1 · 1');
    expect(at[47]).toBe('gggGG · 2 · 1');
    expect(at[51]).toBe('gggGG · 2 · 2');
    expect(at[60]).toBe('ggggg · 2 · 2');
    expect(runs.map((r) => fx(r.episodes[0]!.q[2]!))).toEqual(new Array(5).fill('1.80'));
  });
});

type Round = { metrics: Map<string, number>; steps: number; events: FacetRuntimeEvent[] };

async function drive(inputs: number[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals = new Map<string, number>();
  let current: Round = { metrics: totals, steps: 0, events: [] };
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const done = new Promise<void>((r) => (idle = r));
  const ctx = {
    data: structuredClone(qLearningFacet.initialData),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(e: FacetRuntimeEvent) {
      current.events.push(e);
    },
    async sleep() {
      current.steps += 1;
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ ...current, metrics: new Map(totals) });
      const v = queue.shift();
      if (v === undefined) {
        idle();
        return new Promise<never>(() => {});
      }
      current = { metrics: totals, steps: 0, events: [] };
      return { type: 'epsilon', payload: { value: v } };
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([qLearningAlgorithm(ctx as never), done]);
  cancelled = true;
  return rounds;
}

describe('q-learning — 회차별 계기', () => {
  it('ε 0.2 → 0.5 → 0.2 → 0 → 0.3 → 0.1: 판마다 사양 값, 쌓이지 않는다', async () => {
    const rounds = await drive([0.5, 0.2, 0, 0.3, 0.1]);
    const got = rounds.map((r) => [r.metrics.get('episode'), r.metrics.get('reached-big'), r.metrics.get('prefer-big')]);
    expect(got).toEqual([
      [60, 2, 2],
      [60, 5, 5],
      [60, 2, 2],
      [60, 0, 0],
      [60, 3, 3],
      [60, 0, 0],
    ]);
    // 걸음 0 · 판 60 · 끝 걸음 = 걸음 62
    for (const r of rounds) expect(r.steps).toBe(62);
  });

  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 다 (episode ← update · final ← choose)', async () => {
    const rounds = await drive([0.5]);
    for (const r of rounds) {
      let checked = 0;
      r.events.forEach((e, i) => {
        if (e.type !== 'episode' && e.type !== 'final') return;
        const prev = r.events[i - 1];
        expect(prev?.type, `${e.type} 앞`).toBe('phase');
        expect((prev?.payload as { phase?: unknown }).phase).toBe(e.type === 'episode' ? 'update' : 'choose');
        checked += 1;
      });
      expect(checked).toBe(61);
    }
  });

  it('끝 걸음의 탐욕 읽기가 판 60 의 탐욕과 같다', async () => {
    const [first] = await drive([]);
    const fin = first!.events.find((e) => e.type === 'final');
    expect(fin?.payload).toMatchObject({ preferCount: 2, leftCount: 3, agents: 5, greedy: [0, 0, 0, 1, 1] });
  });
});

describe('q-learning — 무대', () => {
  it('mountView 로 마운트되고 판 머리에서 앞 판의 결론을 걷는다', () => {
    const container = document.createElement('div');
    const inst = mountView(qLearningStageView, container, { config: {} }) as unknown as QLearningStage;
    inst.setCorridor({
      cells: 4,
      start: 1,
      terminal: [true, false, false, true],
      rewards: [3, 0, 0, 10],
      roles: ['small', 'start', 'path', 'big'],
      agents: 5,
      qMax: 10,
    });
    const zero = new Array(5).fill(null).map(() => new Array(8).fill(0));
    inst.beginRound({ epsilon: 0.2, q: zero, positions: [1, 1, 1, 1, 1] }, 0);
    inst.showFinal({ greedy: [0, 0, 0, 1, 1], preferCount: 2, leftCount: 3, agents: 5, episodes: 60 }, 0);
    expect(container.textContent).toContain('2/5');
    inst.beginRound({ epsilon: 0.5, q: zero, positions: [1, 1, 1, 1, 1] }, 0);
    const arrows = [...container.querySelectorAll('path')];
    expect(arrows).toHaveLength(5);
    for (const a of arrows) expect(a.getAttribute('visibility')).toBe('hidden');
    expect(container.textContent).not.toContain('2/5');
    inst.destroy();
  });
});
