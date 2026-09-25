// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { mountView } from '@ffacet/core/runtime';
import {
  processStateFacet,
  processStateImperativeIR,
  processStateStageView,
  simulateProcessState,
  type ProcessStateData,
} from '../src/index.js';

const data = processStateFacet.initialData as ProcessStateData;

/** 사양 표 (sim.py process-state) — 대조용 */
const SPEC: Record<number, { band: string; busy: number; idle: number; pct: number; wait: number; picks: number }> = {
  1: { band: 'AA.....AA.....', busy: 4, idle: 10, pct: 29, wait: 0, picks: 2 },
  2: { band: 'AABB...AABB...', busy: 8, idle: 6, pct: 57, wait: 2, picks: 4 },
  3: { band: 'AABBCC.AABBCC.', busy: 12, idle: 2, pct: 86, wait: 6, picks: 6 },
  4: { band: 'AABBCCDDAABBCC', busy: 14, idle: 0, pct: 100, wait: 16, picks: 7 },
  5: { band: 'AABBCCDDEEAABB', busy: 14, idle: 0, pct: 100, wait: 30, picks: 7 },
};

function runCode(n: number) {
  const state = [0, 0, 0, 0, 0];
  const left = [0, 0, 0, 0, 0];
  const queuedAt = [0, 0, 0, 0, 0];
  const totals = [0, 0, 0];
  const ret = runIR(processStateImperativeIR, 'cpuUtilization', [
    n,
    data.cpuBurst,
    data.ioBurst,
    data.horizon,
    state,
    left,
    queuedAt,
    totals,
  ]);
  return { pct: ret, totals };
}

describe('processState', () => {
  it('사다리가 segments value 와 같고 끝값이 5 다', () => {
    const controls = (processStateFacet.blocks.controls as { controls: { widget?: string; segments?: { value: number }[] }[] })
      .controls;
    const slider = controls.find((c) => c.widget === 'segmented-slider');
    expect(slider?.segments?.map((s) => s.value)).toEqual(data.countLadder);
    expect(data.countLadder).toEqual([1, 2, 3, 4, 5]);
    expect(data.processes.length).toBe(5);
  });

  it('알고리즘이 셈한 판이 사양 표와 같다', () => {
    for (const n of data.countLadder) {
      const r = simulateProcessState(data, n);
      const band = r.ticks.map((tk) => tk.running ?? '.').join('');
      const picks = r.ticks.filter((tk) => tk.picked !== null).length;
      expect({ band, busy: r.busy, idle: r.idle, pct: r.pct, wait: r.readyWait, picks }).toEqual(SPEC[n]);
    }
  });

  it('IR 의 답과 totals 셋이 모든 손잡이 값에서 알고리즘과 같다', () => {
    for (const n of data.countLadder) {
      const r = simulateProcessState(data, n);
      const code = runCode(n);
      expect(code.pct).toBe(r.pct);
      expect(code.totals).toEqual([r.busy, r.readyWait, r.idle]);
    }
  });

  it('회차 대조 A → B → A: 판마다 그 판의 값', () => {
    const seq = [2, 5, 2].map((n) => {
      const r = simulateProcessState(data, n);
      return [r.busy, r.pct, r.readyWait];
    });
    expect(seq).toEqual([
      [8, 57, 2],
      [14, 100, 30],
      [8, 57, 2],
    ]);
  });

  it('사다리 밖 값 · 짧은 자료는 던진다', () => {
    expect(() => simulateProcessState(data, 6)).toThrow();
    expect(() => simulateProcessState({ ...data, processes: ['A', 'B'] }, 2)).toThrow();
    expect(() => simulateProcessState({ ...data, ioBurst: 0 }, 2)).toThrow();
  });

  it('stage 가 한 판을 받아 캡션에 셈한 값을 띄운다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(processStateStageView, container, {
      config: { type: 'process-state-stage' },
      initialData: data as unknown as Record<string, unknown>,
    }) as unknown as {
      startRound(r: { count: number; processes: string[]; horizon: number }, ms: number): void;
      showTick(t: unknown, ms: number): void;
      showResult(r: { busy: number; horizon: number; pct: number }, ms: number): void;
      destroy(): void;
    };
    const r = simulateProcessState(data, 3);
    inst.startRound({ count: 3, processes: r.processes, horizon: data.horizon }, 0);
    for (const tk of r.ticks) inst.showTick(tk, 0);
    inst.showResult({ busy: r.busy, horizon: data.horizon, pct: r.pct }, 0);
    expect(container.textContent).toContain('CPU busy: 12 / 14');
    expect(container.textContent).toContain('Utilization: 86%');
    inst.destroy();
  });
});
