// @vitest-environment happy-dom
/**
 * 입출력 방식 — facet 고유의 주장.
 *
 * IR 을 두지 않으므로(irs.ts 의 까닭) IR ↔ algorithm 대조는 없다. 대신 사양의 실측표 16 칸 · 걸음 차례 ·
 * 회차별 계기(A → B → A) · 사다리와 segments 의 일치 · 동률 칸 수 · stage 마운트를 잠근다.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  ioTransferModesAlgorithm,
  ioTransferModesFacet,
  ioTransferModesIRs,
  ioTransferModesStageView,
  planeOf,
  type IoTransferModesData,
  type IoTransferModesStage,
  type Lost,
} from '../src/index.js';

const data = (): IoTransferModesData => structuredClone(ioTransferModesFacet.initialData) as IoTransferModesData;

type Round = { events: FacetRuntimeEvent[]; metrics: Map<string, number> };
type Input = { type: string; payload: Record<string, unknown> };

/** 알고리즘을 판마다 돌려 모은다. 입력을 다 쓰면 멈춘다. */
async function drive(inputs: Input[]): Promise<Round[]> {
  const rounds: Round[] = [];
  const totals = new Map<string, number>();
  let current: FacetRuntimeEvent[] = [];
  const queue = [...inputs];
  let cancelled = false;
  let idle!: () => void;
  const stop = new Promise<void>((r) => (idle = r));
  const ctx = {
    data: data(),
    get cancelled() {
      return cancelled;
    },
    metric(name: string, delta: number | 'inc') {
      totals.set(name, (totals.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async emit(e: FacetRuntimeEvent) {
      current.push(e);
    },
    async sleep() {
      return !cancelled;
    },
    async waitForInput() {
      rounds.push({ events: current, metrics: new Map(totals) });
      current = [];
      const next = queue.shift();
      if (!next) {
        idle();
        return new Promise<never>(() => {});
      }
      return next;
    },
    pollInput() {
      return null;
    },
  };
  await Promise.race([ioTransferModesAlgorithm(ctx as never), stop]);
  cancelled = true;
  return rounds;
}

const knob = (type: 'words' | 'deviceTicks', value: number, words: number, deviceTicks: number): Input => ({
  type,
  payload: { value, segmentIndex: [1, 2, 4, 8].indexOf(value), words: String(words), deviceTicks: String(deviceTicks) },
});

// 사양 실측표 (sim.py io-transfer-modes) — [낱말][틱] → 폴링 / 인터럽트 / DMA · 이기는 방식
const SPEC: Record<number, Record<number, [number, number, number, string]>> = {
  1: { 1: [1, 3, 5, 'polling'], 2: [2, 3, 5, 'polling'], 4: [4, 3, 5, 'interrupt'], 8: [8, 3, 5, 'interrupt'] },
  2: { 1: [2, 6, 5, 'polling'], 2: [4, 6, 5, 'polling'], 4: [8, 6, 5, 'dma'], 8: [16, 6, 5, 'dma'] },
  4: { 1: [4, 12, 5, 'polling'], 2: [8, 12, 5, 'dma'], 4: [16, 12, 5, 'dma'], 8: [32, 12, 5, 'dma'] },
  8: { 1: [8, 24, 5, 'dma'], 2: [16, 24, 5, 'dma'], 4: [32, 24, 5, 'dma'], 8: [64, 24, 5, 'dma'] },
};

const lostOfEvent = (e: FacetRuntimeEvent): Lost => (e.payload as { lost: Lost }).lost;

describe('io-transfer-modes', () => {
  it('사다리가 segments 와 같고, 첫 판 값이 default 와 같다', () => {
    const d = data();
    expect(d.wordLadder).toEqual([1, 2, 4, 8]);
    expect(d.tickLadder).toEqual([1, 2, 4, 8]);
    const controls = (ioTransferModesFacet.blocks.controls as { controls: { action?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const seg = (a: string) => controls.find((c) => c.action === a)?.segments ?? [];
    expect(seg('words').map((s) => s.value)).toEqual(d.wordLadder);
    expect(seg('deviceTicks').map((s) => s.value)).toEqual(d.tickLadder);
    expect(seg('words').find((s) => s.default)?.value).toBe(d.words);
    expect(seg('deviceTicks').find((s) => s.default)?.value).toBe(d.deviceTicks);
    expect(ioTransferModesIRs).toEqual([]);
  });

  it('평면 16 칸이 사양 실측표와 같고, 동률 칸은 0 · 구역 칸 수 5 / 2 / 9', () => {
    const plane = planeOf(data());
    expect(plane).toHaveLength(16);
    const zones = { polling: 0, interrupt: 0, dma: 0 };
    let ties = 0;
    for (const c of plane) {
      const s = SPEC[c.words]![c.deviceTicks]!;
      expect([c.lost.polling, c.lost.interrupt, c.lost.dma]).toEqual(s.slice(0, 3));
      expect(c.winners).toEqual([s[3]]);
      if (c.winners.length > 1) ties += 1;
      for (const w of c.winners) zones[w] += 1;
    }
    expect(ties).toBe(0);
    expect(zones).toEqual({ polling: 5, interrupt: 2, dma: 9 });
    expect(Math.max(...plane.flatMap((c) => [c.lost.polling, c.lost.interrupt, c.lost.dma]))).toBe(64);
  });

  it('모든 손잡이 조합에서 한 판 끝 값 · 걸음 수 · 이기는 방식이 실측표와 같다', async () => {
    const inputs: Input[] = [];
    const order: [number, number][] = [[2, 2]];
    for (const w of [1, 2, 4, 8]) {
      for (const d of [1, 2, 4, 8]) {
        inputs.push(knob('deviceTicks', d, w, d));
        order.push([w, d]);
      }
    }
    // 첫 손잡이 입력이 words 를 함께 옮긴다 (payload 의 지금 값)
    const rounds = await drive(inputs);
    expect(rounds).toHaveLength(order.length);
    rounds.forEach((r, i) => {
      const [w, d] = order[i]!;
      const s = SPEC[w]![d]!;
      expect(r.events).toHaveLength(w + 3);
      const last = r.events[r.events.length - 1]!;
      expect(last.type).toBe('finish');
      expect(lostOfEvent(last)).toEqual({ polling: s[0], interrupt: s[1], dma: s[2] });
      expect((last.payload as { winners: string[] }).winners).toEqual([s[3]]);
    });
  });

  it('걸음 차례가 사양 예(낱말 2 · 틱 2)와 같다', async () => {
    const [first] = await drive([]);
    const seq = first!.events.map((e) => [e.type, lostOfEvent(e)]);
    expect(seq).toEqual([
      ['round', { polling: 0, interrupt: 0, dma: 0 }],
      ['setup', { polling: 0, interrupt: 0, dma: 2 }],
      ['word', { polling: 2, interrupt: 3, dma: 2 }],
      ['word', { polling: 4, interrupt: 6, dma: 2 }],
      ['finish', { polling: 4, interrupt: 6, dma: 5 }],
    ]);
  });

  it('회차별 계기 A → B → A: (2, 2) → (8, 1) → (2, 2)', async () => {
    const rounds = await drive([knob('words', 8, 8, 2), knob('deviceTicks', 1, 8, 1), knob('words', 2, 2, 1), knob('deviceTicks', 2, 2, 2)]);
    const at = (i: number) => {
      const m = rounds[i]!.metrics;
      return [m.get('polling-lost'), m.get('interrupt-lost'), m.get('dma-lost')];
    };
    expect(at(0)).toEqual([4, 6, 5]);
    expect(at(2)).toEqual([8, 24, 5]);
    expect(at(4)).toEqual([4, 6, 5]);
  });

  it('사다리 밖 값은 던진다', async () => {
    await expect(drive([knob('words', 3, 3, 2)])).rejects.toThrow(/사다리 밖/);
  });

  it('stage 를 mountView 로 올려 한 판을 그리면 값 글자가 계기와 같다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(ioTransferModesStageView, container, { config: {} }) as unknown as IoTransferModesStage & { destroy(): void };
    const plane = planeOf(data());
    await inst.showRound(
      { words: 8, deviceTicks: 1, handlerTicks: 3, setupTicks: 2, wordLadder: [1, 2, 4, 8], tickLadder: [1, 2, 4, 8], plane, target: { polling: 8, interrupt: 24, dma: 5 } },
      0,
    );
    await inst.addChunks({ polling: 0, interrupt: 0, dma: 2 }, { polling: 0, interrupt: 0, dma: 2 }, 0);
    await inst.addChunks({ polling: 1, interrupt: 3, dma: 0 }, { polling: 1, interrupt: 3, dma: 2 }, 0);
    const texts = [...container.querySelectorAll('text')].map((n) => n.textContent ?? '');
    expect(texts).toContain('Lost ticks: 1');
    expect(texts).toContain('Lost ticks: 3');
    expect(texts).toContain('Lost ticks: 2');
    inst.destroy();
  });
});
