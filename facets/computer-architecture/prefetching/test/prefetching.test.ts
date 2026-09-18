// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  clearRegistry,
  getAlgorithmMechanismKind,
  mountView,
  type FacetRuntimeEvent,
  type IRStmt,
  type ReactiveInputEvent,
} from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  computePrefetchingResult,
  prefetchingAlgorithm,
  prefetchingFacet,
  prefetchingImperativeIR,
  prefetchingProjector,
  prefetchingStageView,
  registerPrefetching,
  type PrefetchingData,
} from '../src/index.js';

const data = prefetchingFacet.initialData as PrefetchingData;

/** 사양의 표 — 대조용. 거리 → [박자, 멈춤, 미스, 버린 선반입] */
const SPEC: Record<number, [number, number, number, number]> = {
  0: [96, 64, 8, 0],
  1: [68, 36, 1, 0],
  2: [48, 16, 2, 0],
  3: [88, 56, 7, 4],
  4: [96, 64, 8, 4],
};

type Round = { distance: number; metrics: Record<string, number> };

/** reactive ctx 흉내 — 입력을 차례로 건네고, 다 쓰면 취소한다. */
async function drive(
  inputs: ReactiveInputEvent[],
): Promise<{ events: FacetRuntimeEvent[]; rounds: Round[]; lit: string[] }> {
  const events: FacetRuntimeEvent[] = [];
  /** 걸음 경계(sleep)마다 코드 패널에 켜져 있는 phase — highlightPhase 는 앞 것을 덮는다 */
  const lit: string[] = [];
  let lastPhase = '';
  const rounds: Round[] = [];
  const metrics: Record<string, number> = {};
  const queue = [...inputs];
  let cancelled = false;
  let distance = -1;
  const ctx = {
    data: structuredClone(data),
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
      if (e.type === 'phase') lastPhase = (e.payload as { phase: string }).phase;
      const p = e.payload as { distance?: number } | undefined;
      if (e.type === 'round') distance = p?.distance ?? -1;
      if (e.type === 'round-end') rounds.push({ distance, metrics: { ...metrics } });
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async waitForInput() {
      const next = queue.shift();
      if (!next) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return next;
    },
    async sleep() {
      lit.push(lastPhase);
      return !cancelled;
    },
    pollInput() {
      return null;
    },
  };
  await prefetchingAlgorithm(ctx as never);
  return { events, rounds, lit };
}

const knob = (value: number): ReactiveInputEvent => ({
  type: 'distance',
  payload: { value, segmentIndex: data.distances.indexOf(value) },
});

function irCount(entry: 'countCycles' | 'countWasted', dist: number): number {
  const lines = data.n / data.lineElems;
  const buf = () => new Array<number>(lines).fill(0);
  const out = runIR(prefetchingImperativeIR, entry, [
    data.n,
    data.lineElems,
    data.latency,
    dist,
    data.cacheLines,
    buf(),
    buf(),
    buf(),
  ]);
  if (typeof out !== 'number') throw new Error(`${entry} 가 수를 돌려주지 않았다`);
  return out;
}

function irPhases(stmts: IRStmt[], out: Set<string>): Set<string> {
  for (const s of stmts) {
    if (s.kind === 'comment') continue;
    if (s.phase) out.add(s.phase);
    if (s.kind === 'if') {
      irPhases(s.then, out);
      if (s.else) irPhases(s.else, out);
    }
    if (s.kind === 'for-range' || s.kind === 'while') irPhases(s.body, out);
  }
  return out;
}

describe('prefetching — 셈', () => {
  it('셈한 값이 사양 표와 같다 (U 자 — 거리 2 에서 바닥, 3 부터 버린 선반입)', () => {
    for (const d of data.distances) {
      const r = computePrefetchingResult(data, d);
      expect([r.cycles, r.stall, r.miss, r.wasted], `거리 ${d}`).toEqual(SPEC[d]);
      expect(r.cycles - data.n).toBe(r.stall);
    }
  });

  it('대조 — 캐시 2 줄이면 멈춤이 64/36/64/64/64 로 거리 2 부터 무너진다', () => {
    const small = { ...data, cacheLines: 2 };
    expect(data.distances.map((d) => computePrefetchingResult(small, d).stall)).toEqual([64, 36, 64, 64, 64]);
  });

  it('IR 이 모든 거리에서 algorithm 이 화면에 내는 계기와 같은 답을 낸다', async () => {
    const order = [1, 2, 3, 4];
    const { rounds } = await drive(order.map(knob));
    expect(rounds.map((r) => r.distance)).toEqual([0, ...order]);
    for (const r of rounds) {
      const cycles = irCount('countCycles', r.distance);
      const wasted = irCount('countWasted', r.distance);
      expect(r.metrics['cycle-count'], `거리 ${r.distance}`).toBe(cycles);
      expect(r.metrics['stall-cycle-count'], `거리 ${r.distance}`).toBe(cycles - data.n);
      expect(r.metrics['wasted-count'], `거리 ${r.distance}`).toBe(wasted);
    }
  });

  it('회차마다 계기가 판 하나의 값이다 — 손잡이를 A → B → A 로 돌려도 쌓이지 않는다', async () => {
    const order = [2, 0, 3, 2, 4, 4, 1, 3];
    const { rounds } = await drive(order.map(knob));
    expect(rounds.map((r) => r.distance)).toEqual([0, ...order]);
    for (const r of rounds) {
      const [cycles, stall, miss, wasted] = SPEC[r.distance]!;
      expect(r.metrics, `거리 ${r.distance}`).toEqual({
        'cycle-count': cycles,
        'stall-cycle-count': stall,
        'miss-count': miss,
        'wasted-count': wasted,
      });
    }
  });

  it('우리 것이 아닌 입력 · 사다리 밖의 값은 흘린다', async () => {
    const { rounds } = await drive([
      { type: 'other', payload: { value: 2 } },
      { type: 'distance', payload: { value: 7 } },
      { type: 'distance', payload: { value: '2' } },
      knob(2),
    ]);
    expect(rounds.map((r) => r.distance)).toEqual([0, 2]);
  });

  it('phase 집합이 algorithm 과 IR 에서 같다 (C3)', async () => {
    const { events } = await drive([1, 2, 3, 4].map(knob));
    const emitted = new Set(
      events.filter((e) => e.type === 'phase').map((e) => (e.payload as { phase: string }).phase),
    );
    const declared = new Set<string>();
    for (const f of prefetchingImperativeIR.functions) irPhases(f.body, declared);
    expect([...emitted].sort()).toEqual([...declared].sort());
    expect(events.filter((e) => e.type === 'phase').every((e) => e.silent === true)).toBe(true);
  });

  it('걸음 경계에서 켜진 phase 가 IR 의 phase 전부를 덮는다 — 기다림 줄이 덮여 사라지지 않는다', async () => {
    const { lit } = await drive([1, 2, 3, 4].map(knob));
    const declared = new Set<string>();
    for (const f of prefetchingImperativeIR.functions) irPhases(f.body, declared);
    // 'done' 은 앞 판의 끝에서 켜져 새 판의 첫 경계까지 남는다
    expect([...new Set(lit.filter((x) => x !== ''))].sort()).toEqual([...declared].sort());
    // 거리 0 판: 미스 8 번 · 기다림 8 번 — 걸음마다 그 줄이 켜진 채로 멈춘다
    const { lit: lit0 } = await drive([]);
    expect(lit0.filter((x) => x === 'stall').length).toBe(8);
    expect(lit0.filter((x) => x === 'miss' || x === 'evict').length).toBe(8);
  });

  it('32비트 — 버퍼 길이 · 사다리 끝 · 중간값 최대치가 작다', () => {
    const lines = data.n / data.lineElems;
    expect(lines).toBe(8);
    expect(Math.max(...data.distances)).toBe(4);
    expect([data.n, data.lineElems, data.latency, data.cacheLines]).toEqual([32, 4, 8, 4]);
    let worst = 0;
    for (const d of data.distances) {
      const r = computePrefetchingResult(data, d);
      for (const s of r.steps) {
        worst = Math.max(worst, s.end, s.miss?.arrive ?? 0, s.prefetch?.arrive ?? 0, s.useStamp);
      }
    }
    expect(worst).toBeLessThanOrEqual(104);
    expect(worst).toBeLessThan(10_000);
  });
});

describe('prefetching — 선언', () => {
  it('reactive 로 등록된다', () => {
    clearRegistry();
    registerPrefetching();
    expect(getAlgorithmMechanismKind('prefetching')).toBe('reactive');
  });

  it('손잡이의 사다리가 1차 데이터와 같고 기본값이 처음 판의 거리다', () => {
    const controls = (prefetchingFacet.blocks.controls as { controls: Array<Record<string, unknown>> }).controls;
    const knobSpec = controls.find((c) => c.widget === 'segmented-slider');
    expect(knobSpec?.action).toBe('distance');
    const segments = knobSpec?.segments as Array<{ value: unknown; default?: boolean }>;
    expect(segments.map((s) => s.value)).toEqual(data.distances);
    expect(segments.find((s) => s.default)?.value).toBe(data.distance);
  });

  it('선언한 계기와 algorithm 이 부르는 계기가 같다', async () => {
    const metrics = (prefetchingFacet.blocks.controls as { metrics: Array<{ name: string }> }).metrics.map((m) => m.name);
    const { rounds } = await drive([]);
    expect(Object.keys(rounds[0]!.metrics).sort()).toEqual([...metrics].sort());
  });
});

describe('prefetching — 캡션의 수가 그 이름의 수다', () => {
  async function captionsFor(distance: number): Promise<string[]> {
    const { events } = await drive(distance === 0 ? [] : [knob(distance)]);
    const start = events.findLastIndex((e) => e.type === 'round');
    const captions: string[] = [];
    const stage = new Proxy(
      { setCaption: (t: string) => captions.push(t) },
      { get: (target, key) => (key in target ? target[key as 'setCaption'] : () => {}) },
    );
    const proj = prefetchingProjector({ stage: stage as never });
    proj.onInit?.(data);
    for (const e of events.slice(start)) await proj.onEvent(e);
    return captions;
  }

  it('거리 1 — 미리 불렀지만 늦게 도착한 줄은 미스가 아니어도 기다린다', async () => {
    const caps = await captionsFor(1);
    // L1 은 t 8 에 떠나 t 16 에 온다. 원소 4 는 t 12 에 닿으므로 4 박자를 기다린다.
    expect(caps).toContain('Element 0: L0 is not in the cache — a miss. It arrives at t 8; wait 8.');
    expect(caps).toContain('Element 4: L1 was called ahead but is still on its way — not a miss, yet wait 4.');
    expect(caps[caps.length - 1]).toBe('Distance 1: 68 cycles — 36 of them waiting, 0 wasted prefetches.');
  });

  it('거리 3 — 미리 부른 줄이 쓰이기 전에 밀려나고, 커서가 닿으면 다시 부른다', async () => {
    const caps = await captionsFor(3);
    expect(caps).toContain('Element 8: bringing L2 in pushes out L3, called ahead and never used — wasted.');
    expect(caps).toContain('Element 12: L3 was called ahead but pushed out before use — fetch it again and wait 8.');
    expect(caps[caps.length - 1]).toBe('Distance 3: 88 cycles — 56 of them waiting, 4 wasted prefetches.');
  });

  it('거리 2 — 앞의 두 줄만 미스로 기다리고 나머지는 이미 와 있다', async () => {
    const caps = await captionsFor(2);
    expect(caps).toContain('Element 4: L1 is not in the cache — a miss. It arrives at t 20; wait 8.');
    expect(caps).toContain('Element 8 begins L2: call L4 now — it arrives at t 32.');
    expect(caps).toContain('Element 9: L2 is already here — no wait.');
  });
});

describe('prefetching — stage', () => {
  it('한 판을 그려도 세로가 그대로이고 캔버스를 떼지 않는다', async () => {
    const { events } = await drive([knob(3)]);
    const container = document.createElement('div');
    const stage = mountView(prefetchingStageView, container, {
      config: { type: 'prefetching-stage' },
      initialData: data as unknown as Record<string, unknown>,
      isInstant: () => true,
    });
    const canvas = container.querySelector('svg');
    const viewBox = canvas?.getAttribute('viewBox');
    expect(viewBox?.split(/\s+/)[3]).toBe(String(prefetchingStageView.canvas.height));
    const proj = prefetchingProjector({ stage });
    proj.onInit?.(data);
    for (const e of events) await proj.onEvent(e);
    expect(container.firstChild).toBe(canvas);
    expect(canvas?.getAttribute('viewBox')).toBe(viewBox);
    expect(canvas?.textContent).toContain('Distance 3: 88 cycles');
    stage.destroy();
  });
});
