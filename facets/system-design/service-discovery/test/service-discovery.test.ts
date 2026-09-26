// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import {
  getAlgorithmMechanismKind,
  mountView,
  type FacetContext,
  type FacetRuntimeEvent,
} from '@ffacet/core/runtime';
import {
  readServiceDiscoveryData,
  registerServiceDiscovery,
  serviceDiscoveryAlgorithm,
  serviceDiscoveryBeatCount,
  serviceDiscoveryFacet,
  serviceDiscoveryImperativeIR,
  serviceDiscoveryLossTable,
  serviceDiscoveryProjector,
  serviceDiscoveryRun,
  serviceDiscoveryStageView,
  type ServiceDiscoveryData,
} from '../src/index.js';

const data = readServiceDiscoveryData(serviceDiscoveryFacet.initialData);
const lost = serviceDiscoveryLossTable(data);
const deadIdx = data.instances.findIndex((x) => x.id === data.stop.instance);

/** 사양 실측표 (씨앗 42) — 만료 → [죽은 곳에 간 요청, 산 것을 지움, 죽은 d 가 남은 틱] */
const TABLE: Record<number, [number, number, number]> = {
  3: [1, 9, 1],
  4: [1, 1, 2],
  5: [2, 1, 3],
  7: [3, 0, 5],
  9: [4, 0, 7],
};

function ir(expiry: number, table: readonly number[]): { answer: unknown; tally: number[] } {
  const n = data.instances.length;
  const tally = [0, 0, 0];
  const answer = runIR(serviceDiscoveryImperativeIR, 'discover', [
    expiry,
    n,
    deadIdx,
    data.stop.tick,
    data.ticks,
    data.beat,
    data.callsPerTick,
    [...table],
    new Array<number>(n).fill(0),
    new Array<number>(n).fill(0),
    tally,
  ]);
  return { answer, tally };
}

type Drive = { events: FacetRuntimeEvent[]; runs: Record<string, number>[] };

async function drive(inputs: number[]): Promise<Drive> {
  const events: FacetRuntimeEvent[] = [];
  const metrics = new Map<string, number>();
  const runs: Record<string, number>[] = [];
  const queue = [...inputs];
  let cancelled = false;
  const ctx = {
    data: structuredClone(serviceDiscoveryFacet.initialData),
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
      runs.push(Object.fromEntries(metrics));
      const value = queue.shift();
      if (value === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'expiry', payload: { value } };
    },
  };
  await serviceDiscoveryAlgorithm(ctx as unknown as FacetContext<ServiceDiscoveryData>);
  return { events, runs };
}

describe('service-discovery — 사양 대조', () => {
  it('잃음 표는 4 × 11 이고 씨앗 42 의 잃음이 사양과 같다', () => {
    expect(serviceDiscoveryBeatCount(data)).toBe(11);
    expect(lost).toHaveLength(44);
    const lostTicks = data.instances.map((_, i) =>
      lost
        .slice(i * 11, i * 11 + 11)
        .map((v, h) => (v === 1 ? (h + 1) * data.beat : -1))
        .filter((tick) => tick > 0),
    );
    expect(lostTicks).toEqual([[2, 12, 16, 20], [10, 18], [2, 6], [2, 4, 18, 22]]);
  });

  it('사다리가 손잡이 구간과 같다 · 끝값 9', () => {
    const controls = (serviceDiscoveryFacet.blocks.controls as { controls: unknown[] }).controls;
    const knob = controls.find(
      (c): c is { action: string; segments: { value: number; default?: boolean }[] } =>
        typeof c === 'object' && c !== null && (c as { action?: unknown }).action === 'expiry',
    );
    expect(knob).toBeDefined();
    expect(knob!.segments.map((s) => s.value)).toEqual(data.ladder);
    expect(knob!.segments.find((s) => s.default)?.value).toBe(data.defaultExpiry);
    expect(data.ladder[data.ladder.length - 1]).toBe(9);
    expect(Object.keys(TABLE).map(Number)).toEqual(data.ladder);
  });

  it('만료 다섯의 셈이 실측표와 같고 세 phase 가 모두 켜진다 · 24 걸음', () => {
    for (const expiry of data.ladder) {
      const run = serviceDiscoveryRun(data, expiry, lost);
      expect([run.deadCalls, run.falseDrops, run.staleTicks]).toEqual(TABLE[expiry]);
      expect(run.ticks).toHaveLength(23);
      expect(new Set(run.ticks.map((x) => x.phase))).toEqual(new Set(['renew', 'drop', 'pick']));
    }
  });

  it('기본값 만료 5 의 걸음 — 틱 5 에 산 d 를 지우고 틱 13 에 멈춘 d 를 지운다', () => {
    const run = serviceDiscoveryRun(data, 5, lost);
    const picks = run.ticks.map((x) => x.picks.map((p) => p.instance + (p.dead ? '✗' : '')).join(' '));
    expect(picks.slice(0, 13)).toEqual(['a b', 'c d', 'a b', 'c d', 'c a', 'c d', 'a b', 'c d', 'a b', 'c d✗', 'a b', 'c d✗', 'a b']);
    expect(run.ticks[4]!.drops).toEqual([{ instance: 'd', alive: true }]);
    expect(run.ticks[5]!.beats.find((b) => b.instance === 'd')?.rejoined).toBe(true);
    expect(run.ticks[12]!.drops).toEqual([{ instance: 'd', alive: false }]);
  });
});

describe('service-discovery — IR ↔ algorithm', () => {
  it('만료 다섯 모두에서 tally 가 판 끝 계기와 같다', () => {
    for (const expiry of data.ladder) {
      const run = serviceDiscoveryRun(data, expiry, lost);
      const { answer, tally } = ir(expiry, lost);
      expect(answer).toBe(run.deadCalls);
      expect(tally).toEqual([run.deadCalls, run.falseDrops, run.staleTicks]);
    }
  });

  it('잃음 표 44 칸을 하나씩 뒤집어도 같다 (44 × 5) — 명단이 비는 표는 TS 던짐 · IR −1', () => {
    let emptied = 0;
    for (let k = 0; k < lost.length; k += 1) {
      const table = [...lost];
      table[k] = 1 - table[k]!;
      for (const expiry of data.ladder) {
        const { answer, tally } = ir(expiry, table);
        let run: ReturnType<typeof serviceDiscoveryRun>;
        try {
          run = serviceDiscoveryRun(data, expiry, table);
        } catch (err) {
          expect(String(err)).toMatch(/명단이 빈/);
          expect(answer).toBe(-1);
          emptied += 1;
          continue;
        }
        expect(answer).toBe(run.deadCalls);
        expect(tally).toEqual([run.deadCalls, run.falseDrops, run.staleTicks]);
      }
    }
    // b 의 틱 2 소식까지 잃으면 만료 3 의 틱 3 에 넷이 모두 지워진다 — 그 한 벌뿐
    expect(emptied).toBe(1);
  });

  it('소식을 모두 잃으면 TS 는 던지고 IR 은 −1', () => {
    const all = new Array<number>(lost.length).fill(1);
    for (const expiry of data.ladder) {
      expect(() => serviceDiscoveryRun(data, expiry, all)).toThrow(/명단이 빈/);
      expect(ir(expiry, all).answer).toBe(-1);
    }
  });
});

describe('service-discovery — 재생', () => {
  it('손잡이 5 → 3 → 5 에서 회차마다 계기가 표와 같다 (판마다 0 에서)', async () => {
    const { runs } = await drive([3, 5]);
    const row = (e: number) => ({ 'dead-calls': TABLE[e]![0], 'false-drops': TABLE[e]![1], 'stale-ticks': TABLE[e]![2] });
    expect(runs).toEqual([row(5), row(3), row(5)]);
  });

  it('사다리 밖 값과 남의 입력은 받지 않는다', async () => {
    const { events } = await drive([6]);
    expect(events.filter((e) => e.type === 'init')).toHaveLength(1);
  });

  it('걸음 이벤트마다 바로 앞이 그 걸음의 phase 다 · 걸음은 silent 가 아니다', async () => {
    const { events } = await drive([3, 9]);
    let ticks = 0;
    events.forEach((e, i) => {
      if (e.type !== 'tick') return;
      ticks += 1;
      expect(e.silent).not.toBe(true);
      const prev = events[i - 1]!;
      expect(prev.type).toBe('phase');
      expect(prev.silent).toBe(true);
      const p = e.payload as { drops: unknown[]; beats: { lost: boolean }[] };
      const want = p.drops.length > 0 ? 'drop' : p.beats.some((b) => !b.lost) ? 'renew' : 'pick';
      expect((prev.payload as { phase: string }).phase).toBe(want);
    });
    expect(ticks).toBe(23 * 3);
    for (const e of events.filter((x) => x.type === 'init')) expect(e.silent).toBe(true);
  });

  it('reactive 로 등록된다', () => {
    registerServiceDiscovery();
    expect(getAlgorithmMechanismKind('serviceDiscovery')).toBe('reactive');
  });
});

describe('service-discovery — 무대', () => {
  const mount = () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(serviceDiscoveryStageView, container, {
      config: { type: 'service-discovery-stage' },
      locale: 'ko',
      isInstant: () => true,
    });
    const svg = container.querySelector('svg');
    if (!svg) throw new Error('svg 가 없다');
    return { inst, svg, container };
  };

  it('첫 그림은 멱등이다 — init 을 두 번 먹여도 요소 수가 같다', async () => {
    const { events } = await drive([]);
    const { inst, svg } = mount();
    const projector = serviceDiscoveryProjector({ stage: inst });
    const init = events.find((e) => e.type === 'init')!;
    await projector.onEvent(init);
    const once = svg.querySelectorAll('*').length;
    await projector.onEvent(init);
    expect(svg.querySelectorAll('*').length).toBe(once);
    projector.onReset?.();
    expect(svg.querySelectorAll('*').length).toBe(0);
    await projector.onEvent(init);
    expect(svg.querySelectorAll('*').length).toBe(once);
    inst.destroy();
  });

  it('한 판을 먹이면 끝 화면에 틱 23 이 뜨고, 새 판의 init 이 ✗ 와 요청 자국을 걷는다', async () => {
    const { events } = await drive([9]);
    const { inst, svg } = mount();
    const projector = serviceDiscoveryProjector({ stage: inst });
    const second = events.findIndex((e, i) => i > 0 && e.type === 'init');
    for (const e of events.slice(0, second)) await projector.onEvent(e);
    expect(svg.textContent).toContain('tick 23');
    // 만료 5 의 틱 12 에 ✗ 가 떴다 — 걸음 하나씩 되밟아 확인
    projector.onReset?.();
    for (const e of events.slice(0, events.findIndex((x) => x.type === 'tick' && (x.payload as { tick: number }).tick === 12) + 1)) {
      await projector.onEvent(e);
    }
    expect(svg.textContent).toContain('✗');
    await projector.onEvent(events[second]!);
    expect(svg.textContent).not.toContain('✗');
    expect(svg.querySelectorAll('polyline')).toHaveLength(0);
    expect(svg.textContent).toContain('expiry line: 9');
    inst.destroy();
  });

  it('무대에 없는 인스턴스를 가리키면 던진다', async () => {
    const { events } = await drive([]);
    const { inst } = mount();
    const projector = serviceDiscoveryProjector({ stage: inst });
    await projector.onEvent(events.find((e) => e.type === 'init')!);
    const tick = structuredClone(events.find((e) => e.type === 'tick')!);
    (tick.payload as { picks: { instance: string }[] }).picks[0]!.instance = 'z';
    expect(() => projector.onEvent(tick)).toThrow(/z/);
    inst.destroy();
  });
});
