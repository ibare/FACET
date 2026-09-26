// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetContext, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  birthdayHalfOf,
  buildTables,
  collisionAlgorithm,
  collisionFacet,
  collisionImperativeIR,
  collisionProjector,
  collisionStageView,
  firstCollisionOf,
  hashText,
  pigeonholeOf,
  readCollisionData,
  slotCount,
  targetHitOf,
  type CollisionData,
} from '../src/index.js';

const data = readCollisionData(collisionFacet.initialData);
const tables = buildTables(data);

/** 사양 실측표 (sim.py collision) */
const SPEC: Record<number, { N: number; sure: number; half: number; firsts: number[]; targets: number[]; ratio: number; hashed: number }> = {
  4: { N: 16, sure: 17, half: 5, firsts: [6, 7, 4, 5, 6], targets: [6, 6, 4, 25, 29], ratio: 3, hashed: 98 },
  6: { N: 64, sure: 65, half: 10, firsts: [6, 13, 9, 12, 9], targets: [44, 90, 21, 55, 29], ratio: 7, hashed: 288 },
  8: { N: 256, sure: 257, half: 20, firsts: [13, 39, 24, 16, 9], targets: [165, 117, 662, 192, 29], ratio: 13, hashed: 1266 },
  10: { N: 1024, sure: 1025, half: 38, firsts: [47, 39, 29, 39, 9], targets: [206, 596, 662, 2236, 29], ratio: 31, hashed: 3892 },
  12: { N: 4096, sure: 4097, half: 76, firsts: [47, 39, 79, 102, 61], targets: [3563, 19287, 6463, 10592, 364], ratio: 62, hashed: 40597 },
};

function need<T>(v: T | undefined, what: string): T {
  if (v === undefined) throw new Error(`없다: ${what}`);
  return v;
}

describe('장난감 H — 조각 대조값', () => {
  it('H(MEET AT 9) = 4a00 · H(SUN) = af87', () => {
    expect(hashText('MEET AT 9')).toBe(0x4a00);
    expect(hashText('SUN')).toBe(0xaf87);
  });
});

describe('사양 실측표', () => {
  it('다섯 n 모두 표와 같다', () => {
    for (const n of data.widthLadder) {
      const b = need(tables.boards.get(n), `board ${n}`);
      const s = SPEC[n];
      expect(b.slots).toBe(s.N);
      expect(b.sure).toBe(s.sure);
      expect(b.half).toBe(s.half);
      expect(b.streams.map((r) => r.first)).toEqual(s.firsts);
      expect(b.streams.map((r) => r.tries)).toEqual(s.targets);
      expect(b.ratio).toBe(s.ratio);
      expect(b.firstSum + b.targetSum).toBe(s.hashed);
    }
  });

  it('n 8 의 짝과 자리 (걸음 절)', () => {
    const b = need(tables.boards.get(8), 'board 8');
    expect(b.streams.map((r) => [r.stream, r.first, r.partner, r.slot])).toEqual([
      ['file', 13, 8, 88],
      ['doc', 39, 6, 32],
      ['img', 24, 8, 178],
      ['log', 16, 8, 13],
      ['msg', 9, 4, 37],
    ]);
  });

  it('사다리 = segments value · 축 끝 32768 · 흐름 다섯 · tries 길이 ≥ 19287', () => {
    const controls = (collisionFacet.blocks.controls as { controls: unknown[] }).controls;
    const slider = controls.find(
      (c): c is { action: string; segments: { value: number }[] } =>
        typeof c === 'object' && c !== null && (c as { action?: unknown }).action === 'width',
    );
    expect(slider?.segments.map((s) => s.value)).toEqual(data.widthLadder);
    expect(data.widthLadder).toEqual([4, 6, 8, 10, 12]);
    expect(tables.axisEnd).toBe(32768);
    expect(data.streams).toHaveLength(5);
    for (const s of data.streams) expect(need(tables.tries.get(s), s).length).toBeGreaterThanOrEqual(19287);
  });
});

describe('IR ↔ algorithm', () => {
  const ir = (fn: string, args: unknown[]): number => runIR(collisionImperativeIR, fn, args as never) as number;

  it('pigeonhole · birthdayHalf 가 다섯 n 모두에서 같다', () => {
    for (const n of data.widthLadder) {
      expect(ir('pigeonhole', [n])).toBe(pigeonholeOf(n));
      expect(ir('birthdayHalf', [n])).toBe(birthdayHalfOf(n));
    }
  });

  it('firstCollision · targetHit 가 다섯 n × 다섯 흐름에서 같다', () => {
    for (const n of data.widthLadder) {
      const b = need(tables.boards.get(n), `board ${n}`);
      for (const [row, s] of data.streams.entries()) {
        const hs = need(tables.hashes.get(s), s).slice(0, slotCount(n) + 1);
        const ts = need(tables.tries.get(s), s).slice(0, 16 * slotCount(n));
        const target = need(tables.targets.get(s), s);
        expect(ir('firstCollision', [hs, n, new Array(4096).fill(0)])).toBe(b.streams[row].first);
        expect(ir('targetHit', [target, ts, n])).toBe(b.streams[row].tries);
      }
    }
  });

  it('해시 배열을 뒤집어 넘겨도 IR 과 algorithm 의 답이 같다', () => {
    for (const n of data.widthLadder) {
      for (const s of data.streams) {
        const hs = need(tables.hashes.get(s), s).slice(0, slotCount(n) + 1).reverse();
        const ts = need(tables.tries.get(s), s).slice(0, 16 * slotCount(n)).reverse();
        const target = need(tables.targets.get(s), s);
        expect(ir('firstCollision', [hs, n, new Array(4096).fill(0)])).toBe(firstCollisionOf(hs, n));
        expect(ir('targetHit', [target, ts, n])).toBe(targetHitOf(target, ts, n));
      }
    }
  });

  it('못 찾으면 IR 은 −1, TS 는 던진다', () => {
    expect(ir('targetHit', [0, [1, 2, 3], 4])).toBe(-1);
    expect(targetHitOf(0, [1, 2, 3], 4)).toBe(-1);
    expect(ir('firstCollision', [[1, 2], 4, new Array(4096).fill(0)])).toBe(-1);
    expect(firstCollisionOf([1, 2], 4)).toBe(-1);
    // 사다리에 없는 폭 · 모양이 어긋난 자료는 TS 가 던진다
    expect(() => readCollisionData({ ...data, width: 7 })).toThrow();
    expect(() => readCollisionData({ ...data, widthLadder: [4, 16] })).toThrow();
  });
});

/** 알고리즘을 입력 차례대로 돌린다 — 입력이 다 떨어지면 취소한다. */
async function runAlgorithm(inputs: number[]): Promise<{ events: FacetRuntimeEvent[]; boards: Record<string, number>[] }> {
  const events: FacetRuntimeEvent[] = [];
  const metrics: Record<string, number> = {};
  const boards: Record<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: structuredClone(collisionFacet.initialData) as CollisionData,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
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
      boards.push({ ...metrics });
      const v = queue.shift();
      if (v === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'width', payload: { value: v, segmentIndex: 0, width: String(v) } };
    },
  };
  await collisionAlgorithm(ctx as unknown as FacetContext<CollisionData>);
  return { events, boards };
}

describe('재생', () => {
  it('회차별 계기 8 → 12 → 8', async () => {
    const { boards } = await runAlgorithm([12, 8]);
    const pick = (m: Record<string, number>) => [m['slots'], m['sure-collision'], m['half-chance'], m['inputs-hashed']];
    expect(boards.map(pick)).toEqual([
      [256, 257, 20, 1266],
      [4096, 4097, 76, 40597],
      [256, 257, 20, 1266],
    ]);
  });

  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase · 판 하나 = 걸음 여덟 + 걸음 0', async () => {
    const { events } = await runAlgorithm([4, 10, 6, 12]);
    const PH: Record<string, string> = {
      pigeonhole: 'pigeonhole',
      'birthday-half': 'birthday-half',
      'first-collision': 'first-collision',
      'target-hit': 'target-hit',
    };
    let steps = 0;
    let inits = 0;
    events.forEach((e, i) => {
      if (e.type === 'init') {
        inits++;
        expect(e.silent).toBe(true);
        return;
      }
      if (e.silent === true) return;
      steps++;
      const prev = events[i - 1];
      expect(prev.type).toBe('phase');
      expect((prev.payload as { phase: string }).phase).toBe(PH[e.type]);
    });
    expect(inits).toBe(5);
    expect(steps).toBe(5 * 8);
  });

  it('n 8 의 걸음 차례', async () => {
    const { events } = await runAlgorithm([]);
    const steps = events.filter((e) => e.silent !== true);
    expect(steps.map((e) => e.type)).toEqual([
      'pigeonhole',
      'birthday-half',
      'first-collision',
      'first-collision',
      'first-collision',
      'first-collision',
      'first-collision',
      'target-hit',
    ]);
    const last = steps[6].payload as { input: string; partnerInput: string; summary: { avgTenths: number; ratio: number } };
    expect([last.input, last.partnerInput]).toEqual(['msg9', 'msg4']);
    expect(last.summary).toEqual({ avgTenths: 202, ratio: 13, sure: 257 });
    const hit = steps[7].payload as { avgTenths: number; hits: { input: string }[] };
    expect(hit.avgTenths).toBe(2330);
    expect(hit.hits.map((h) => h.input)).toEqual(['filex165', 'docx117', 'imgx662', 'logx192', 'msgx29']);
  });

  it('사다리에 없는 폭 입력은 던진다', async () => {
    await expect(runAlgorithm([7])).rejects.toThrow();
  });
});

describe('무대', () => {
  function mount() {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const view = mountView(collisionStageView, container, { config: {}, locale: 'en', isInstant: () => true });
    const projector = collisionProjector({ stage: view });
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('svg 없음');
    return { view, projector, svg };
  }

  it('마운트만으로 던지지 않는다', () => {
    expect(() => mount()).not.toThrow();
  });

  it('첫 그림은 멱등 — init 을 두 번 먹여도 요소 수가 같다 · 되짚기도 같다', async () => {
    const { events } = await runAlgorithm([]);
    const { projector, svg } = mount();
    const init = events[0];
    await projector.onEvent(init);
    const once = svg.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(svg.querySelectorAll('*').length).toBe(once);

    for (const e of events.slice(1)) await projector.onEvent(e);
    const full = svg.querySelectorAll('*').length;
    projector.onReset?.();
    for (const e of events) await projector.onEvent(e);
    expect(svg.querySelectorAll('*').length).toBe(full);
  });

  it('운동 도중 되짚기가 오면 앞 판의 간격을 그리지 않고 던지지 않는다', async () => {
    const { events } = await runAlgorithm([]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    let instant = true;
    const view = mountView(collisionStageView, container, { config: {}, locale: 'en', isInstant: () => instant });
    const projector = collisionProjector({ stage: view });
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('svg 없음');
    const summaryAt = events.findIndex(
      (e) => e.type === 'first-collision' && (e.payload as { summary: unknown }).summary !== null,
    );
    for (const e of events.slice(0, summaryAt)) await projector.onEvent(e);
    instant = false;
    const moving = projector.onEvent(events[summaryAt]);
    projector.onReset?.();
    await expect(moving).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 50));
    expect(svg.querySelectorAll('[data-key="gap"]').length).toBe(0);
    expect(svg.querySelectorAll('[data-role="gap-label"]').length).toBe(0);
  });

  it('새 판의 걸음 0 에는 앞 판의 값 글자가 없고 흐린 눈금만 남는다', async () => {
    const { events } = await runAlgorithm([12]);
    const { projector, svg } = mount();
    const secondInit = events.findIndex((e, i) => i > 0 && e.type === 'init');
    for (const e of events.slice(0, secondInit)) await projector.onEvent(e);
    expect(svg.querySelectorAll('[data-role="point-label"]').length).toBe(12);
    await projector.onEvent(events[secondInit]);
    expect(svg.querySelectorAll('[data-role="point-label"]').length).toBe(0);
    expect(svg.querySelectorAll('[data-role="marker-label"]').length).toBe(0);
    expect(svg.querySelectorAll('[data-role="gap-label"]').length).toBe(0);
    expect(svg.querySelectorAll('[data-ghost="true"]').length).toBe(14);
  });
});
