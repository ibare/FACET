// @vitest-environment happy-dom
/**
 * 교착 상태 — 사양 표 대조 · 회차별 계기 · 사다리 · stage 의 운동.
 *
 * IR 을 두지 않으므로 IR ↔ algorithm 대조는 없다. 대신 지도 스무 칸 × 두 순서의 결과와 칸마다
 * 계기를 사양(sim.py deadlock)의 표와 견준다.
 */
import { describe, expect, it } from 'vitest';
import { makeTranslator, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  chunksOf,
  cycleOf,
  arrowsOf,
  deadlockAlgorithm,
  deadlockFacet,
  deadlockProjector,
  deadlockStageView,
  mapOf,
  runCell,
  type DeadlockData,
} from '../src/index.js';

const data = (): DeadlockData => JSON.parse(JSON.stringify(deadlockFacet.initialData)) as DeadlockData;

/** sim.py deadlock "칸마다 계기" — [순서, 몫, 사이 일, 교착, ticks, blocked, 토막, 걸음] */
const TABLE: [number, number, number, boolean, number, number, number, number][] = [
  [0, 1, 0, true, 6, 3, 6, 8], [0, 1, 1, true, 9, 3, 9, 11], [0, 1, 2, true, 12, 3, 12, 14], [0, 1, 3, true, 15, 3, 15, 17],
  [0, 2, 0, false, 15, 3, 8, 10], [0, 2, 1, true, 9, 3, 6, 8], [0, 2, 2, true, 12, 3, 6, 8], [0, 2, 3, true, 15, 3, 9, 11],
  [0, 3, 0, false, 15, 3, 7, 9], [0, 3, 1, false, 18, 3, 7, 9], [0, 3, 2, true, 12, 3, 6, 8], [0, 3, 3, true, 15, 3, 6, 8],
  [0, 4, 0, false, 15, 1, 6, 8], [0, 4, 1, false, 18, 3, 7, 9], [0, 4, 2, false, 21, 3, 7, 9], [0, 4, 3, true, 15, 3, 6, 8],
  [0, 5, 0, false, 15, 0, 3, 5], [0, 5, 1, false, 18, 1, 6, 8], [0, 5, 2, false, 21, 3, 7, 9], [0, 5, 3, false, 24, 3, 7, 9],
  [1, 1, 0, false, 15, 2, 7, 9], [1, 1, 1, false, 18, 2, 9, 11], [1, 1, 2, false, 21, 2, 11, 13], [1, 1, 3, false, 24, 2, 13, 15],
  [1, 2, 0, false, 15, 2, 8, 10], [1, 2, 1, false, 18, 2, 7, 9], [1, 2, 2, false, 21, 2, 7, 9], [1, 2, 3, false, 24, 2, 9, 11],
  [1, 3, 0, false, 15, 2, 8, 10], [1, 3, 1, false, 18, 3, 8, 10], [1, 3, 2, false, 21, 2, 7, 9], [1, 3, 3, false, 24, 2, 7, 9],
  [1, 4, 0, false, 15, 1, 6, 8], [1, 4, 1, false, 18, 2, 8, 10], [1, 4, 2, false, 21, 3, 8, 10], [1, 4, 3, false, 24, 2, 7, 9],
  [1, 5, 0, false, 15, 0, 3, 5], [1, 5, 1, false, 18, 1, 6, 8], [1, 5, 2, false, 21, 2, 8, 10], [1, 5, 3, false, 24, 3, 8, 10],
];

type Input = { type: string; payload: Record<string, unknown> };

/** 가짜 reactive 문맥으로 판을 돌린다. 판마다 (입력 대기 시점의) 계기와 이벤트를 모은다. */
async function playRounds(inputs: Input[]) {
  const metrics = new Map<string, number>();
  const rounds: { metrics: Record<string, number>; events: FacetRuntimeEvent[] }[] = [];
  let events: FacetRuntimeEvent[] = [];
  let cancelled = false;
  const queue = inputs.slice();
  const ctx = {
    data: data(),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      return !cancelled;
    },
    pollInput() {
      return null;
    },
    async waitForInput() {
      rounds.push({ metrics: Object.fromEntries(metrics), events });
      events = [];
      const next = queue.shift();
      if (next === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
  };
  await deadlockAlgorithm(ctx as unknown as Parameters<typeof deadlockAlgorithm>[0]);
  return rounds;
}

const knob = (type: string, value: number): Input => ({ type, payload: { value, segmentIndex: 0 } });

describe('deadlock — 사양 표', () => {
  it('지도: 쓴 대로는 몫 ≤ 사이 일 + 1 인 열 칸이 교착, 번호 차례는 0 칸', () => {
    const d = data();
    const written = mapOf(d, 0);
    expect(written.filter((c) => c.deadlock)).toHaveLength(10);
    for (const c of written) expect(c.deadlock).toBe(c.slice <= c.gap + 1);
    for (const c of written) expect(c.ticks).toBe(c.deadlock ? 3 * (c.gap + 2) : 15 + 3 * c.gap);
    const ordered = mapOf(d, 1);
    expect(ordered.filter((c) => c.deadlock)).toHaveLength(0);
    for (const c of ordered) expect(c.ticks).toBe(15 + 3 * c.gap);
  });

  it('칸마다 계기 · 토막 · 걸음이 sim 표와 같다 (마흔 칸)', () => {
    const d = data();
    let maxSteps = 0;
    for (const [order, k, g, dl, ticks, blocked, chunks, steps] of TABLE) {
      const r = runCell(d, k, g, order);
      expect([order, k, g, r.deadlock, r.ticks, r.blocked]).toEqual([order, k, g, dl, ticks, blocked]);
      const ch = chunksOf(r.log);
      expect(ch.length).toBe(chunks);
      expect(1 + ch.length + 1).toBe(steps);
      maxSteps = Math.max(maxSteps, steps);
      if (r.deadlock) {
        const last = r.log[r.log.length - 1]!;
        expect(cycleOf(arrowsOf(last.owner, last.waitq), 3)).toHaveLength(3);
      }
    }
    expect(maxSteps).toBe(17);
    expect(TABLE).toHaveLength(40);
  });

  it('기본 판의 토막은 사양의 걸음과 같다', () => {
    const r = runCell(data(), 2, 1, 0);
    const got = chunksOf(r.log).map((c) => [c[0]!.thread, c.map((x) => `${x.tick}:${x.outcome}`).join(' ')]);
    expect(got).toEqual([
      [0, '0:ran 1:ran'],
      [1, '2:ran 3:ran'],
      [2, '4:ran 5:ran'],
      [0, '6:blocked'],
      [1, '7:blocked'],
      [2, '8:blocked'],
    ]);
    const last = r.log[r.log.length - 1]!;
    expect(cycleOf(arrowsOf(last.owner, last.waitq), 3)).toEqual([0, 1, 2]);
  });

  it('번호 차례에서 C 의 프로그램만 잡는 차례가 바뀐다', () => {
    const a = runCell(data(), 2, 1, 0).progs.map((p) => p.map((o) => `${o.kind}${o.lock}`).join(' '));
    const b = runCell(data(), 2, 1, 1).progs.map((p) => p.map((o) => `${o.kind}${o.lock}`).join(' '));
    expect(a[0]).toBe(b[0]);
    expect(a[1]).toBe(b[1]);
    expect(a[2]).toBe('lock2 work-1 lock0 work-1 unlock0 unlock2');
    expect(b[2]).toBe('lock0 work-1 lock2 work-1 unlock2 unlock0');
  });

  it('잘못된 자료는 던진다', () => {
    const bad = data();
    bad.pairs = [[0, 0], [1, 2], [2, 0]];
    expect(() => runCell(bad, 2, 1, 0)).toThrow();
    const unknown = data();
    unknown.pairs = [[0, 7], [1, 2], [2, 0]];
    expect(() => runCell(unknown, 2, 1, 0)).toThrow();
  });
});

describe('deadlock — 회차', () => {
  it('A → B → A 로 돌려도 계기는 판마다 그 판의 값이다', async () => {
    const rounds = await playRounds([knob('order', 1), knob('order', 0)]);
    expect(rounds).toHaveLength(3);
    const want = [
      { ticks: 9, 'blocked-tries': 3, 'stuck-threads': 3, 'deadlock-cells': 10 },
      { ticks: 18, 'blocked-tries': 2, 'stuck-threads': 0, 'deadlock-cells': 0 },
      { ticks: 9, 'blocked-tries': 3, 'stuck-threads': 3, 'deadlock-cells': 10 },
    ];
    rounds.forEach((r, i) => expect(r.metrics).toEqual(want[i]));
    expect(rounds[0]!.events).toHaveLength(8);
    expect(rounds[1]!.events).toHaveLength(9);
  });

  it('모든 손잡이 값에서 판의 걸음 수와 계기가 표와 같다', async () => {
    const inputs: Input[] = [];
    const expected: typeof TABLE = [];
    for (const row of TABLE) {
      const [order, k, g] = row;
      inputs.push(knob('order', order), knob('slice', k), knob('gap', g));
      expected.push(row);
    }
    const rounds = await playRounds(inputs);
    // 첫 판은 기본값, 그 뒤 입력 하나마다 한 판 — 칸 설정이 끝난 판(셋째 입력 뒤)만 본다
    for (let i = 0; i < expected.length; i += 1) {
      const [, , , dl, ticks, blocked, , steps] = expected[i]!;
      const r = rounds[1 + i * 3 + 2]!;
      expect(r.metrics.ticks).toBe(ticks);
      expect(r.metrics['blocked-tries']).toBe(blocked);
      expect(r.metrics['stuck-threads']).toBe(dl ? 3 : 0);
      expect(r.events).toHaveLength(steps);
    }
  });

  it('사다리 밖 값은 던진다', async () => {
    await expect(playRounds([knob('slice', 6)])).rejects.toThrow();
  });
});

describe('deadlock — 선언', () => {
  it('사다리가 segments[].value 와 같다', () => {
    const d = data();
    const controls = (deadlockFacet.blocks.controls as { controls: { action: string; segments?: { value: number }[] }[] }).controls;
    const seg = (a: string) => controls.find((c) => c.action === a)?.segments?.map((s) => s.value);
    expect(seg('slice')).toEqual(d.sliceLadder);
    expect(seg('gap')).toEqual(d.gapLadder);
    expect(seg('order')).toEqual(d.orderLadder);
    expect(d.sliceLadder).toHaveLength(5);
    expect(d.sliceLadder[d.sliceLadder.length - 1]).toBe(5);
    expect(d.gapLadder[d.gapLadder.length - 1]).toBe(3);
  });
});

describe('deadlock — stage 의 운동', () => {
  it('잠금 순서를 바꾸면 C 의 잡기 줄이 자리를 바꾸고, 교착 끝에 고리 캡션이 뜬다', async () => {
    const container = document.createElement('div');
    const t = makeTranslator('en', deadlockFacet.messages);
    const stage = mountView(deadlockStageView, container, { config: {}, initialData: data(), t, isInstant: () => true });
    const projector = deadlockProjector({ stage }, { getSpeed: () => 1, t });
    const rounds = await playRounds([knob('order', 1)]);

    const lineY = (label: string): number => {
      const texts = [...container.querySelectorAll('text')].filter((n) => n.textContent === label);
      // C 카드는 셋째 — 같은 글자가 A 에도 있으니 가장 오른쪽 카드의 것을 본다
      const cards = texts.map((n) => {
        const g = n.parentElement!;
        const card = g.parentElement!.parentElement!;
        const x = Number(/translate\(([\d.]+)/.exec(card.getAttribute('transform') ?? '')?.[1] ?? -1);
        const y = Number(/translate\([-\d.]+, ([-\d.]+)\)/.exec(g.getAttribute('transform') ?? '')?.[1] ?? -1);
        return { x, y };
      });
      cards.sort((a, b) => b.x - a.x);
      return cards[0]!.y;
    };

    for (const e of rounds[0]!.events) await projector.onEvent(e);
    const text = () => [...container.querySelectorAll('text')].map((n) => n.textContent).join('|');
    expect(text()).toContain('Cycle: A → B → C → A');
    expect(text()).toContain('Ticks: 9');
    const before = { m3: lineY('lock(m3)'), m1: lineY('lock(m1)') };
    expect(before.m3).toBeLessThan(before.m1);

    for (const e of rounds[1]!.events) await projector.onEvent(e);
    const after = { m3: lineY('lock(m3)'), m1: lineY('lock(m1)') };
    expect(after.m1).toBeLessThan(after.m3);
    expect(after.m1).toBe(before.m3);
    expect(text()).toContain('Ticks: 18');
    expect(text()).not.toContain('Cycle:');
    stage.destroy();
  });
});
