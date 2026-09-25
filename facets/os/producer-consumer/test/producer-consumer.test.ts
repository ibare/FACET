// @vitest-environment happy-dom
/**
 * producer-consumer — 사양 표 대조 · 회차별 계기 · 사다리 · stage 마운트.
 * IR 을 두지 않으므로(irs.ts) IR ↔ algorithm 대조는 없다.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  producerConsumerAlgorithm,
  producerConsumerFacet,
  producerConsumerProjector,
  producerConsumerStageView,
  simulateRound,
  type ProducerConsumerData,
} from '../src/index.js';

const data = producerConsumerFacet.initialData as unknown as ProducerConsumerData;
const clone = (): ProducerConsumerData => JSON.parse(JSON.stringify(data)) as ProducerConsumerData;

// 사양 표 (sim.py producer-consumer): 칸 → producer-sleep · producer-done · consumer-done · peak-fill · 안 찬 칸 · 꺼내는 쪽 잠든 틱
const TABLE: Record<number, [number, number, number, number, number, number]> = {
  1: [8, 13, 16, 1, 0, 1],
  2: [5, 10, 16, 2, 0, 1],
  3: [2, 7, 16, 3, 0, 1],
  4: [0, 5, 16, 4, 0, 1],
  6: [0, 5, 16, 4, 2, 1],
};

describe('producer-consumer 셈', () => {
  it('사다리가 segments[].value 와 같고 데이터 길이가 사양대로다', () => {
    const controls = (producerConsumerFacet.blocks['controls'] as { controls: { widget: string; segments?: { value: number }[] }[] }).controls;
    const knob = controls.find((c) => c.widget === 'segmented-slider');
    expect(knob?.segments?.map((s) => s.value)).toEqual(data.slotsLadder);
    expect(data.slotsLadder).toEqual([1, 2, 3, 4, 6]);
    expect(data.slotsLadder[data.slotsLadder.length - 1]).toBe(6);
    expect(data.makeAt).toHaveLength(6);
    expect(data.useTicks).toBe(2);
  });

  it('칸마다 사양 표와 같다', () => {
    for (const slots of data.slotsLadder) {
      const r = simulateRound(data, slots);
      const want = TABLE[slots]!;
      expect([r.producerSleep, r.producerDone, r.consumerDone, r.peakFill, r.neverFilled, r.consumerSleep], `칸 ${slots}`).toEqual(want);
      expect(r.rows.length + 1, '걸음 수 (걸음 0 + 틱)').toBe(18);
    }
  });

  it('칸 2 의 틱마다가 sim 과 같다 (손 · 버퍼 · empty · full)', () => {
    const r = simulateRound(data, 2);
    const want: [string, string, number, number][] = [
      ['', '1', 1, 0],
      ['', '2', 1, 1],
      ['', '23', 0, 2],
      ['4', '23', 0, 2],
      ['5', '34', 0, 2],
      ['56', '34', 0, 2],
      ['56', '34', 0, 2],
      ['6', '45', 0, 2],
      ['6', '45', 0, 2],
      ['6', '45', 0, 2],
      ['', '56', 0, 2],
      ['', '56', 0, 2],
      ['', '56', 0, 2],
      ['', '6', 1, 1],
      ['', '6', 1, 1],
      ['', '6', 1, 1],
      ['', '', 2, 0],
    ];
    expect(r.rows.map((x) => [x.hand.join(''), x.buffer.join(''), x.empty, x.full])).toEqual(want);
    // 넣는 쪽이 잠든 틱 3 · 5 · 6 · 8 · 9
    expect(r.rows.filter((x) => x.pAct === 'blocked' || x.pAct === 'asleep').map((x) => x.tick)).toEqual([3, 5, 6, 8, 9]);
    // 넘겨주기: 틱 0 에 넣는 쪽 → 꺼내는 쪽, 틱 4 · 7 · 10 에 꺼내는 쪽 → 넣는 쪽
    expect(r.rows.filter((x) => x.pHandoff).map((x) => x.tick)).toEqual([0]);
    expect(r.rows.filter((x) => x.cHandoff).map((x) => x.tick)).toEqual([4, 7, 10]);
  });

  it('칸 1 · 4 의 버퍼와 표 수가 sim 과 같다', () => {
    const one = simulateRound(data, 1).rows.map((x) => [x.hand.join(''), x.buffer.join(''), x.empty, x.full]);
    expect(one[3]).toEqual(['34', '2', 0, 1]);
    expect(one[5]).toEqual(['456', '3', 0, 1]);
    expect(one[16]).toEqual(['', '', 1, 0]);
    const four = simulateRound(data, 4).rows.map((x) => [x.buffer.join(''), x.empty, x.full]);
    expect(four.map((x) => x[0])).toEqual(['1', '2', '23', '234', '345', '3456', '3456', '456', '456', '456', '56', '56', '56', '6', '6', '6', '']);
    expect(four[5]).toEqual(['3456', 0, 4]);
  });

  it('꺼낸 틱은 모든 칸에서 같은 자리다', () => {
    for (const slots of data.slotsLadder) {
      const takes = simulateRound(data, slots).rows.filter((x) => x.cAct === 'take').map((x) => x.tick);
      expect(takes, `칸 ${slots}`).toEqual([1, 4, 7, 10, 13, 16]);
    }
  });

  it('사다리 밖 · 오름차순이 아닌 makeAt 은 던진다', () => {
    expect(() => simulateRound(data, 5)).toThrow();
    expect(() => simulateRound({ ...clone(), makeAt: [0, 2, 1] }, 2)).toThrow();
  });
});

describe('producer-consumer 회차별 계기', () => {
  it('칸 2 → 6 → 2 에서 판마다 그 판의 값', async () => {
    const totals = new Map<string, number>();
    const snaps: Record<string, number>[] = [];
    const inputs = [6, 2].map((value) => ({ type: 'slots', payload: { value, segmentIndex: 0, slots: String(value) } }));
    let cancelled = false;
    let stop!: () => void;
    const idle = new Promise<void>((r) => (stop = r));
    const snap = (): void => {
      snaps.push(Object.fromEntries(totals));
    };
    const ctx = {
      data: clone(),
      get cancelled() {
        return cancelled;
      },
      metric(name: string, delta: number | 'inc') {
        totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async emit(_e: FacetRuntimeEvent) {},
      async sleep() {
        return !cancelled;
      },
      async waitForInput() {
        snap();
        const next = inputs.shift();
        if (!next) {
          stop();
          return new Promise<never>(() => {});
        }
        return next;
      },
      pollInput() {
        return null;
      },
    };
    await Promise.race([producerConsumerAlgorithm(ctx as never), idle]);
    cancelled = true;
    const pick = (s: Record<string, number>): number[] => [s['producer-sleep']!, s['producer-done']!, s['consumer-done']!, s['peak-fill']!];
    expect(snaps.map(pick)).toEqual([
      [5, 10, 16, 2],
      [0, 5, 16, 4],
      [5, 10, 16, 2],
    ]);
  });
});

describe('producer-consumer stage', () => {
  it('mountView 로 마운트하고 모든 칸의 한 판을 projector 로 그린다', async () => {
    const container = document.createElement('div');
    document.body.append(container);
    const t = (_k: string, en: string, vars?: Record<string, string | number>): string =>
      en.replace(/\{(\w+)\}/g, (_m, name: string) => String(vars?.[name] ?? `{${name}}`));
    const stage = mountView(producerConsumerStageView, container, {
      config: { type: 'producer-consumer-stage' },
      initialData: producerConsumerFacet.initialData,
      t,
      isInstant: () => true,
    });
    const proj = producerConsumerProjector({ stage }, { getSpeed: () => 1, t });
    for (const slots of data.slotsLadder) {
      const r = simulateRound(data, slots);
      await proj.onEvent({
        type: 'round',
        payload: { slots, ticks: r.rows.length, empty: slots, full: 0, producer: 'P', consumer: 'C', emptyName: 'empty', fullName: 'full' },
      });
      for (let i = 0; i < r.rows.length; i += 1) {
        const last = i === r.rows.length - 1;
        await proj.onEvent({ type: 'tick', payload: { ...r.rows[i]!, last, doneTick: last ? r.consumerDone : -1, neverFilled: last ? r.neverFilled : -1 } });
      }
      expect(container.textContent).toContain(`Done at tick ${r.consumerDone}`);
      expect(container.textContent).toContain(`Never-filled slots: ${r.neverFilled}`);
    }
    stage.destroy();
  });
});
