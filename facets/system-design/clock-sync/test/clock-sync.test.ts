// @vitest-environment happy-dom
/**
 * clock-sync 고유 검수 — IR ↔ algorithm 스무 조합 · 사양 실측표 · 섞기 · 표지(−1) · 걸음마다 대표 phase ·
 * 판마다 계기 · 무대 첫 그림 멱등.
 */
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  clockAxes,
  clockRound,
  clockSyncAlgorithm,
  clockSyncFacet,
  clockSyncImperativeIR,
  clockSyncProjector,
  clockSyncStageView,
  narrowClockSyncData,
  residualOffsets,
  type ClockSyncData,
} from '../src/index.js';

const data = narrowClockSyncData(clockSyncFacet.initialData);

/** 사양 실측표 — [배수][주기] = [물리 거꾸로, 가장 큰 벌어짐]. 램포트 거꾸로는 모두 0. */
const TABLE: Record<number, Record<number, [number, number]>> = {
  0: { 0: [0, 3], 8: [0, 3], 4: [0, 3], 2: [0, 3] },
  1: { 0: [5, 88], 8: [1, 38], 4: [0, 18], 2: [0, 8] },
  2: { 0: [5, 173], 8: [2, 73], 4: [0, 33], 2: [0, 13] },
  4: { 0: [6, 343], 8: [3, 143], 4: [1, 63], 2: [1, 23] },
  8: { 0: [6, 683], 8: [5, 283], 4: [5, 123], 2: [4, 43] },
};

function irRun(d: ClockSyncData, scale: number, period: number): { ret: number; result: number[] } {
  const idx = (name: string): number => d.processes.indexOf(name);
  const result = [0, 0, 0];
  const ret = runIR(clockSyncImperativeIR, 'clockRun', [
    d.messages.map((m) => m.sendMinute),
    d.messages.map((m) => idx(m.src)),
    d.messages.map((m) => idx(m.dst)),
    d.messages.map((m) => m.delayMs),
    [...d.ratePerMinute],
    residualOffsets(d),
    scale,
    period,
    d.processes.map(() => 0),
    d.messages.map(() => 0),
    result,
  ]);
  if (typeof ret !== 'number') throw new Error('IR 이 수를 돌려주지 않았다');
  return { ret, result };
}

type Knob = { type: string; value: number };

/** 가짜 reactive 문맥 — 입력을 차례로 주고, 다 떨어지면 취소한다. */
async function play(
  inputs: Knob[],
): Promise<{ events: FacetRuntimeEvent[]; rounds: Map<string, number>[]; raw: FacetRuntimeEvent[] }> {
  const events: FacetRuntimeEvent[] = [];
  const rounds: Map<string, number>[] = [];
  let metrics = new Map<string, number>();
  const queue = [...inputs];
  const ctx = {
    data: JSON.parse(JSON.stringify(clockSyncFacet.initialData)) as ClockSyncData,
    cancelled: false,
    async emit(e: FacetRuntimeEvent) {
      events.push(e);
    },
    metric(name: string, delta: number | 'inc') {
      metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
    },
    async sleep() {
      events.push({ type: 'test:sleep', silent: true });
      return true;
    },
    async waitForInput() {
      rounds.push(new Map(metrics));
      metrics = new Map(metrics);
      const next = queue.shift();
      if (!next) {
        ctx.cancelled = true;
        return { type: 'stop' };
      }
      return { type: next.type, payload: { value: next.value } };
    },
    pollInput() {
      return null;
    },
  };
  await clockSyncAlgorithm(ctx as unknown as ReactiveContext<ClockSyncData>);
  return { events: events.filter((e) => e.type !== 'test:sleep'), rounds, raw: [...events] };
}

describe('clock-sync 데이터 · 사다리', () => {
  it('메시지 열둘 · 사다리 끝값 · segments 와 같다', () => {
    expect(data.messages).toHaveLength(12);
    expect(data.processes).toEqual(['P1', 'P2', 'P3']);
    expect(data.drifts).toEqual([0, 1, 2, 4, 8]);
    expect(data.resyncs).toEqual([0, 8, 4, 2]);
    expect(data.drifts[data.drifts.length - 1]).toBe(8);
    expect(data.resyncs[1]).toBe(8);
    const controls = (clockSyncFacet.blocks.controls as { controls: { name?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const seg = (name: string) => controls.find((c) => c.name === name)?.segments ?? [];
    expect(seg('drift').map((s) => s.value)).toEqual(data.drifts);
    expect(seg('resync').map((s) => s.value)).toEqual(data.resyncs);
    expect(seg('drift').find((s) => s.default)?.value).toBe(data.initialDrift);
    expect(seg('resync').find((s) => s.default)?.value).toBe(data.initialResync);
  });

  it('남는 어긋남 = (가는 − 오는)/2 = +2 · −1 · +1', () => {
    expect(residualOffsets(data)).toEqual([2, -1, 1]);
  });

  it('축은 사다리 전체에서 — 받음 − 보냄의 가장 큰 절댓값 638 이 축 안에 든다', () => {
    const axes = clockAxes(data);
    let widest = 0;
    let smallest = Infinity;
    for (const s of data.drifts)
      for (const p of data.resyncs)
        for (const st of clockRound(data, s, p).steps) {
          if (st.kind !== 'receive') continue;
          widest = Math.max(widest, Math.abs(st.diff));
          smallest = Math.min(smallest, Math.abs(st.diff));
          expect(st.rel).toBeGreaterThanOrEqual(axes.relMin);
          expect(st.rel).toBeLessThanOrEqual(axes.relMax);
        }
    expect(widest).toBe(638);
    expect(smallest).toBe(1);
    expect(axes.lamportMax).toBe(19);
  });
});

describe('clock-sync IR ↔ algorithm', () => {
  it('스무 조합 모두 — IR result = algorithm = 사양 표', () => {
    for (const scale of data.drifts) {
      for (const period of data.resyncs) {
        const round = clockRound(data, scale, period);
        const { ret, result } = irRun(data, scale, period);
        const [phys, skew] = TABLE[scale]![period]!;
        expect([round.physicalInverted, round.lamportInverted, round.maxSkew], `${scale}/${period}`).toEqual([phys, 0, skew]);
        expect(result, `${scale}/${period}`).toEqual([round.physicalInverted, round.lamportInverted, round.maxSkew]);
        expect(ret).toBe(round.physicalInverted);
      }
    }
  });

  it('섞기 — 메시지 목록 차례를 섞어도 셋이 같다', () => {
    const shuffled: ClockSyncData = { ...data, messages: [...data.messages].reverse() };
    const rot: ClockSyncData = { ...data, messages: [...data.messages.slice(5), ...data.messages.slice(0, 5)] };
    for (const scale of data.drifts) {
      for (const period of data.resyncs) {
        const base = irRun(data, scale, period).result;
        expect(irRun(shuffled, scale, period).result).toEqual(base);
        expect(irRun(rot, scale, period).result).toEqual(base);
        const a = clockRound(data, scale, period);
        const b = clockRound(shuffled, scale, period);
        expect([b.physicalInverted, b.lamportInverted, b.maxSkew]).toEqual([a.physicalInverted, a.lamportInverted, a.maxSkew]);
      }
    }
  });

  it('같은 분 둘 → IR −1, TS 는 던진다 · 배수 −1 → IR −1, TS 는 던진다', () => {
    const clash: ClockSyncData = {
      ...data,
      messages: data.messages.map((m, i) => (i === 3 ? { ...m, sendMinute: 3 } : m)),
    };
    expect(irRun(clash, 4, 0).ret).toBe(-1);
    expect(() => clockRound(clash, 4, 0)).toThrow();
    expect(irRun(data, -1, 0).ret).toBe(-1);
    expect(() => clockRound(data, -1, 0)).toThrow();
    expect(irRun(data, 4, -1).ret).toBe(-1);
    expect(() => clockRound(data, 4, -1)).toThrow();
  });

  it('기본 판 — 거꾸로 선 메시지와 램포트 받음 수가 사양과 같다', () => {
    const r = clockRound(data, 4, 0);
    const recv = r.steps.filter((s) => s.kind === 'receive');
    expect(recv.filter((s) => s.inverted).map((s) => `${s.id}(${s.diff})`)).toEqual([
      'm1(-3)', 'm4(-31)', 'm6(-86)', 'm7(-143)', 'm10(-91)', 'm12(-190)',
    ]);
    expect(recv.map((s) => s.lamportRecv)).toEqual([2, 4, 6, 8, 8, 10, 11, 13, 15, 17, 17, 19]);
    const r4 = clockRound(data, 4, 4).steps.filter((s) => s.kind === 'receive' && s.inverted);
    expect(r4.map((s) => s.id)).toEqual(['m1']);
  });
});

describe('clock-sync 재생', () => {
  it('걸음 24 · 걸음 이벤트마다 바로 앞이 그 걸음의 대표 phase · 기본값에서 셋 다 켜진다', async () => {
    const { events } = await play([]);
    const steps = events.filter((e) => !e.silent);
    expect(steps).toHaveLength(24);
    const lit = new Set<string>();
    events.forEach((e, i) => {
      if (e.silent) return;
      const prev = events[i - 1]!;
      expect(prev.type).toBe('phase');
      const ph = (prev.payload as { phase: string }).phase;
      lit.add(ph);
      const p = e.payload as { inverted?: boolean };
      if (e.type === 'clock-send') expect(ph).toBe('send');
      else if (e.type === 'clock-receive') expect(ph).toBe(p.inverted ? 'inverted' : 'receive');
      else throw new Error(`모르는 걸음 ${e.type}`);
    });
    expect([...lit].sort()).toEqual(['inverted', 'receive', 'send']);
    expect(events[0]!.type).toBe('clock-init');
    expect(events[0]!.silent).toBe(true);
  });

  it('판 머리 clock-init 뒤 첫 phase 앞에 걸음 경계(sleep)가 있다 — 판마다', async () => {
    const { raw } = await play([{ type: 'drift', value: 8 }]);
    const inits = raw.map((e, i) => (e.type === 'clock-init' ? i : -1)).filter((i) => i >= 0);
    expect(inits).toHaveLength(2);
    for (const i of inits) {
      expect(raw[i + 1]!.type).toBe('test:sleep');
      expect(raw[i + 2]!.type).toBe('phase');
    }
  });

  it('계기 — A → B → A 로 돌려 판마다 사양 표와 같다', async () => {
    const { rounds } = await play([
      { type: 'drift', value: 8 },
      { type: 'resync', value: 2 },
      { type: 'drift', value: 4 },
      { type: 'resync', value: 0 },
    ]);
    const expected: [number, number][] = [
      [4, 0],
      [8, 0],
      [8, 2],
      [4, 2],
      [4, 0],
    ];
    expect(rounds).toHaveLength(expected.length);
    rounds.forEach((m, i) => {
      const [scale, period] = expected[i]!;
      const [phys, skew] = TABLE[scale]![period]!;
      expect(m.get('physical-inverted'), `${scale}/${period}`).toBe(phys);
      expect(m.get('lamport-inverted')).toBe(0);
      expect(m.get('max-skew-ms')).toBe(skew);
    });
  });

  it('사다리에 없는 값은 던진다', async () => {
    await expect(play([{ type: 'drift', value: 3 }])).rejects.toThrow();
  });
});

describe('clock-sync 무대', () => {
  it('첫 그림을 두 번 먹여도 요소 수가 같다 · onReset 이 비운다', async () => {
    const { events } = await play([]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    const stage = mountView(clockSyncStageView, container, { config: {}, locale: 'ko' });
    const proj = clockSyncProjector({ stage });
    const init = events[0]!;
    proj.onEvent(init);
    const count1 = container.querySelectorAll('*').length;
    proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(count1);
    for (const e of events) proj.onEvent(e);
    const full = container.querySelectorAll('*').length;
    expect(full).toBeGreaterThan(count1);
    // 새 판 머리 — 화살표는 자리로 남되 요소 수는 그대로
    proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(full);
    proj.onReset?.();
    proj.onEvent(init);
    expect(container.querySelectorAll('*').length).toBe(count1);
    expect(container.textContent).toContain('minute 0');
    (stage as { destroy(): void }).destroy();
  });

  it('initialData 없이 마운트해도 던지지 않는다', () => {
    const container = document.createElement('div');
    expect(() => mountView(clockSyncStageView, container, { config: {} })).not.toThrow();
  });
});
