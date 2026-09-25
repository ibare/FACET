// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountView, type FacetContext } from '@ffacet/core/runtime';
import { runIR } from '@ffacet/ir-interpreter';
import {
  countSstfTies,
  diskSchedulingAlgorithm,
  diskSchedulingFacet,
  diskSchedulingImperativeIR,
  diskSchedulingStageView,
  seekRun,
  type DiskSchedulingData,
} from '../src/index.js';

const data = diskSchedulingFacet.initialData as DiskSchedulingData;

/** 사양 실측표 — 시작 × 정책 */
const TABLE: Record<number, number[]> = {
  53: [640, 236, 331, 299, 322],
  100: [597, 307, 284, 252, 336],
  150: [647, 305, 234, 202, 312],
};

/** 사양의 받은 차례 (시작 53) */
const ORDER_53: Record<string, number[]> = {
  fcfs: [98, 183, 37, 122, 14, 124, 65, 67],
  sstf: [65, 67, 37, 14, 98, 122, 124, 183],
  scan: [65, 67, 98, 122, 124, 183, 199, 37, 14],
  look: [65, 67, 98, 122, 124, 183, 37, 14],
  'c-look': [65, 67, 98, 122, 124, 183, 14, 37],
};

function knob(action: string): { value: number; label: unknown; default?: boolean }[] {
  const controls = (diskSchedulingFacet.blocks.controls as { controls: Record<string, unknown>[] }).controls;
  const k = controls.find((c) => c.action === action);
  if (!k) throw new Error(`손잡이 ${action} 없음`);
  return k.segments as { value: number; label: unknown; default?: boolean }[];
}

describe('disk-scheduling', () => {
  it('사다리와 segments 가 같고 첫 판 값이 default 다', () => {
    expect(data.requests).toHaveLength(8);
    expect(data.top).toBe(199);
    expect(data.policies).toEqual(['fcfs', 'sstf', 'scan', 'look', 'c-look']);
    expect(knob('policy').map((s) => s.value)).toEqual(data.policies.map((_, i) => i));
    expect(knob('armStart').map((s) => s.value)).toEqual(data.startLadder);
    expect(data.startLadder[data.startLadder.length - 1]).toBe(150);
    expect(knob('policy').find((s) => s.default)?.value).toBe(data.policy);
    expect(knob('armStart').find((s) => s.default)?.value).toBe(data.armStart);
  });

  it('15 칸 전부에서 IR = algorithm = 실측표', () => {
    for (const start of data.startLadder) {
      data.policies.forEach((id, p) => {
        const algo = seekRun(data.requests, start, id, data.top).total;
        const ir = runIR(diskSchedulingImperativeIR, 'seekTotal', [
          [...data.requests],
          data.requests.map(() => 0),
          start,
          p,
          data.top,
        ]);
        expect(algo, `${id} @ ${start}`).toBe(TABLE[start][p]);
        expect(ir, `IR ${id} @ ${start}`).toBe(algo);
      });
    }
  });

  it('받은 차례 · 걸음 수가 사양과 같다 (시작 53)', () => {
    for (const id of data.policies) {
      const run = seekRun(data.requests, 53, id, data.top);
      expect(run.moves.map((m) => m.to), id).toEqual(ORDER_53[id]);
    }
  });

  it('SSTF 동률은 이 데이터에서 걸리지 않는다', () => {
    const ties = data.startLadder.map((s) => countSstfTies(data.requests, s, data.top));
    expect(ties).toEqual([0, 0, 0]);
  });

  it('회차별 계기 — (SSTF,53) → (LOOK,53) → (SSTF,53), 그리고 (LOOK,150)', async () => {
    const inputs = [
      { type: 'policy', payload: { value: 3 } },
      { type: 'policy', payload: { value: 1 } },
      { type: 'armStart', payload: { value: 150 } },
      { type: 'policy', payload: { value: 3 } },
    ];
    let metric = 0;
    const ends: number[] = [];
    let cancelled = false;
    const ctx = {
      data: JSON.parse(JSON.stringify(data)) as DiskSchedulingData,
      async emit() {},
      metric(name: string, delta: number | 'inc') {
        expect(name).toBe('seek-distance');
        metric += delta === 'inc' ? 1 : delta;
      },
      get cancelled() {
        return cancelled;
      },
      async sleep() {
        return true;
      },
      async waitForInput() {
        ends.push(metric);
        const next = inputs.shift();
        if (!next) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return next;
      },
      pollInput() {
        return null;
      },
    };
    await diskSchedulingAlgorithm(ctx as unknown as FacetContext<DiskSchedulingData>);
    // 셋째 입력(armStart 150)은 SSTF@150 판을 거친다
    expect(ends).toEqual([236, 299, 236, 305, 202]);
  });

  it('stage 가 초기 자료 없이도 마운트된다', () => {
    const host = document.createElement('div');
    const inst = mountView(diskSchedulingStageView, host, { config: {} });
    expect(inst).toBeTruthy();
    inst.destroy();
  });
});
