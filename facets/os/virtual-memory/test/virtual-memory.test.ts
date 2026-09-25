// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetRuntimeEvent, type ReactiveContext } from '@ffacet/core/runtime';
import {
  simulateVirtualMemory,
  utilizationCurve,
  virtualMemoryAlgorithm,
  virtualMemoryFacet,
  virtualMemoryIRs,
  virtualMemoryStageView,
  type VirtualMemoryData,
} from '../src/index.js';

const data = (): VirtualMemoryData => structuredClone(virtualMemoryFacet.initialData) as VirtualMemoryData;

/** 사양 실측표 — 작업 집합, 프로세스, useful-ticks, cpu-use, page-faults, 밀어냄, 디스크 일한 틱, 논 틱 */
const TABLE: [number, number, number, number, number, number, number, number][] = [
  [3, 1, 30, 25, 3, 0, 12, 87],
  [3, 2, 59, 49, 6, 0, 24, 55],
  [3, 3, 82, 68, 9, 0, 36, 29],
  [3, 4, 88, 73, 12, 0, 48, 20],
  [3, 5, 65, 54, 31, 17, 118, 24],
  [4, 1, 30, 25, 4, 0, 16, 86],
  [4, 2, 55, 46, 8, 0, 32, 57],
  [4, 3, 74, 62, 12, 0, 48, 34],
  [4, 4, 29, 24, 33, 17, 119, 58],
  [4, 5, 29, 24, 33, 17, 119, 58],
  [5, 1, 28, 23, 5, 0, 20, 87],
  [5, 2, 52, 43, 10, 0, 40, 58],
  [5, 3, 29, 24, 31, 17, 119, 60],
  [5, 4, 29, 24, 33, 17, 119, 58],
  [5, 5, 29, 24, 33, 17, 119, 58],
];

/** 사양 기본 판 걸음표 (작업 집합 4 · 프로세스 3) */
const DEFAULT_STEPS: [string, string, number, number, number][] = [
  ['xxx..1x..2', '.111122223', 2, 4, 20],
  ['x..3x..1..', '3331111222', 4, 6, 20],
  ['.2.x.3.x.1', '2333311112', 7, 8, 23],
  ['xx.2x..1..', '2221111333', 9, 11, 23],
  ['.3x112...3', '322223333.', 14, 12, 28],
  ['1122.33112', '..........', 23, 12, 38],
  ['2.331122.3', '..........', 31, 12, 44],
  ['31122.3311', '..........', 40, 12, 50],
  ['22.331122.', '..........', 48, 12, 53],
  ['331122.331', '..........', 57, 12, 57],
  ['122.331122', '..........', 66, 12, 60],
  ['.331122.33', '..........', 74, 12, 62],
];

describe('virtual-memory — 사양 표 대조', () => {
  it('열다섯 조합의 판 끝 값이 실측표와 같고 LRU 동률은 걸리지 않는다', () => {
    const d = data();
    for (const [ws, n, useful, pct, faults, evicted, diskBusy, idle] of TABLE) {
      const r = simulateVirtualMemory(d, n, ws);
      expect({ ws, n, useful: r.useful, pct: r.usePct, faults: r.faults, evicted: r.evicted, diskBusy: r.diskBusy, idle: r.idle }).toEqual({
        ws,
        n,
        useful,
        pct,
        faults,
        evicted,
        diskBusy,
        idle,
      });
      expect(r.lruTies).toBe(0);
      expect(r.chunks).toHaveLength(12);
    }
  });

  it('기본 판의 걸음표가 사양과 같다', () => {
    const r = simulateVirtualMemory(data(), 3, 4);
    r.chunks.forEach((c, i) => {
      const [cpu, disk, useful, faults, pct] = DEFAULT_STEPS[i]!;
      const cpuStr = c.cpu.map((x) => (x.kind === 'run' ? String(x.proc + 1) : x.kind === 'fault' ? 'x' : '.')).join('');
      const diskStr = c.disk.map((p) => (p < 0 ? '.' : String(p + 1))).join('');
      expect([cpuStr, diskStr, c.useful, c.faults, c.usePct]).toEqual([cpu, disk, useful, faults, pct]);
    });
  });

  it('기본 판의 디스크 줄 길이와 판 끝 프레임이 sim 과 같다', () => {
    const r = simulateVirtualMemory(data(), 3, 4);
    expect(r.chunks.map((c) => c.queue)).toEqual([2, 2, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0]);
    const r44 = simulateVirtualMemory(data(), 4, 4);
    const frames = new Array<string>(12).fill('--');
    for (const c of r44.chunks) for (const l of c.loads) frames[l.frame] = `${l.proc + 1}${String.fromCharCode(97 + l.page)}`;
    expect(frames.join(' ')).toBe('1c 2c 3c 1d 4c 2a 3a 1b 4a 2b 3b 4b');
  });

  it('곡선은 지금 작업 집합의 실측표 한 줄이다', () => {
    const d = data();
    expect(utilizationCurve(d, 3)).toEqual([25, 49, 68, 73, 54]);
    expect(utilizationCurve(d, 4)).toEqual([25, 46, 62, 24, 24]);
    expect(utilizationCurve(d, 5)).toEqual([23, 43, 24, 24, 24]);
  });

  it('사다리가 손잡이 구간과 같다', () => {
    const d = data();
    const controls = (virtualMemoryFacet.blocks.controls as { controls: { action: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const seg = (a: string) => controls.find((c) => c.action === a)?.segments ?? [];
    expect(seg('procCount').map((s) => s.value)).toEqual(d.procLadder);
    expect(seg('workingSet').map((s) => s.value)).toEqual(d.wsLadder);
    expect(seg('procCount').find((s) => s.default)?.value).toBe(d.procCount);
    expect(seg('workingSet').find((s) => s.default)?.value).toBe(d.workingSet);
    expect(d.procLadder.at(-1)).toBe(5);
    expect(d.processes).toHaveLength(5);
    expect(d.wsLadder.at(-1)).toBe(5);
    expect(virtualMemoryIRs).toEqual([]);
  });
});

describe('virtual-memory — 회차별 계기', () => {
  it('(3,4) → (4,4) → (3,4) 로 돌리면 회차마다 판 끝 계기가 사양 값이다', async () => {
    const d = data();
    const metrics = new Map<string, number>();
    const inputs = [
      { type: 'procCount', payload: { value: 4, segmentIndex: 3 } },
      { type: 'procCount', payload: { value: 3, segmentIndex: 2 } },
    ];
    const ends: Record<string, number>[] = [];
    let cancelled = false;
    const ctx = {
      data: d,
      get cancelled() {
        return cancelled;
      },
      async emit(_e: FacetRuntimeEvent) {},
      metric(name: string, delta: number | 'inc') {
        metrics.set(name, (metrics.get(name) ?? 0) + (delta === 'inc' ? 1 : delta));
      },
      async sleep() {
        return true;
      },
      pollInput() {
        return null;
      },
      async waitForInput() {
        ends.push(Object.fromEntries(metrics));
        const next = inputs.shift();
        if (!next) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return next;
      },
    } as unknown as ReactiveContext<VirtualMemoryData>;
    await virtualMemoryAlgorithm(ctx);
    expect(ends).toEqual([
      { 'useful-ticks': 74, 'page-faults': 12, 'cpu-use': 62 },
      { 'useful-ticks': 29, 'page-faults': 33, 'cpu-use': 24 },
      { 'useful-ticks': 74, 'page-faults': 12, 'cpu-use': 62 },
    ]);
  });
});

describe('virtual-memory — stage', () => {
  it('mountView 로 마운트되고 initialData 없이도 던지지 않는다', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(virtualMemoryStageView, container, { config: {} });
    expect(container.querySelector('svg')).not.toBeNull();
    inst.destroy();
  });
});
