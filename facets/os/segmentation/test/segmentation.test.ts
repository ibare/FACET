// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { getAlgorithmMechanismKind, type FacetRuntimeEvent, type ReactiveInputEvent } from '@ffacet/core/runtime';
import {
  encodeRequests,
  registerSegmentation,
  resolveRequests,
  segmentationAlgorithm,
  segmentationFacet,
  segmentationImperativeIR,
  segmentationRound,
  type SegmentationData,
} from '../src/index.js';

const data = segmentationFacet.initialData as SegmentationData;
const shape = (memory: number[]): string => memory.map((v) => (v === -1 ? '.' : data.blocks[v])).join('');

/** 사양 실측표 — [leaver, fit] → 판 끝 값 */
const TABLE: Record<string, { rejected: number; free: number; holes: number; big: number; waste: number; shape: string }> = {
  '0,0': { rejected: 1, free: 10, holes: 3, big: 4, waste: 0, shape: 'FFFF...BBBBBBB....DDDDGGGGGGG...' },
  '0,1': { rejected: 0, free: 2, holes: 1, big: 2, waste: 0, shape: 'GGGGGGGBBBBBBBFFFFDDDDHHHHHHHH..' },
  '0,2': { rejected: 1, free: 10, holes: 2, big: 6, waste: 0, shape: 'GGGGGGGBBBBBBB....DDDDFFFF......' },
  '0,3': { rejected: 0, free: 0, holes: 0, big: 0, waste: 2, shape: 'FFFFGGGGBBBBBBBBGGGGDDDDHHHHHHHH' },
  '1,0': { rejected: 0, free: 2, holes: 1, big: 2, waste: 0, shape: 'AAAAAAAFFFFGGGGGGGDDDDHHHHHHHH..' },
  '1,1': { rejected: 1, free: 10, holes: 2, big: 6, waste: 0, shape: 'AAAAAAAGGGGGGG....DDDDFFFF......' },
  '1,2': { rejected: 1, free: 10, holes: 2, big: 7, waste: 0, shape: 'AAAAAAAFFFF.......DDDDGGGGGGG...' },
  '1,3': { rejected: 0, free: 0, holes: 0, big: 0, waste: 2, shape: 'AAAAAAAAFFFFGGGGGGGGDDDDHHHHHHHH' },
};

const controlsBlock = segmentationFacet.blocks.controls as { controls: { name?: string; segments?: { value: number }[] }[] };
const knob = (name: string): number[] => {
  const c = controlsBlock.controls.find((x) => x.name === name);
  if (!c?.segments) throw new Error(`손잡이 ${name} 없음`);
  return c.segments.map((s) => s.value);
};

describe('segmentation', () => {
  it('사다리가 손잡이 구간 값과 같고, 데이터 크기가 사양대로다', () => {
    expect(knob('fit')).toEqual(data.fitLadder);
    expect(knob('leaver')).toEqual(data.leaverLadder);
    expect(data.fitLadder).toEqual([0, 1, 2, 3]);
    expect(data.leaverLadder).toEqual([0, 1]);
    expect(data.requests).toHaveLength(11);
    expect(data.memoryKiB).toBe(32);
    expect(data.frameKiB).toBe(4);
  });

  it('여덟 조합 모두 IR 답과 끝 칸이 algorithm 과 같고, 사양 실측표와 같다', () => {
    for (const leaver of data.leaverLadder) {
      for (const fit of data.fitLadder) {
        const round = segmentationRound(data, fit, leaver);
        const last = round.steps[round.steps.length - 1]!.state;
        const { kind, who, size } = encodeRequests(data.blocks, resolveRequests(data, leaver));
        expect(kind).toHaveLength(11);
        const memory = new Array<number>(data.memoryKiB).fill(0);
        const rejected = runIR(segmentationImperativeIR, 'runRequests', [kind, who, size, memory, data.memoryKiB, fit, data.frameKiB]);
        expect(rejected).toBe(last.rejected);
        expect(memory).toEqual(last.memory);
        const want = TABLE[`${leaver},${fit}`]!;
        expect(shape(last.memory)).toBe(want.shape);
        expect({ rejected: last.rejected, free: last.freeTotal, holes: last.holes.length, big: last.largestHole, waste: last.insideWaste }).toEqual({
          rejected: want.rejected,
          free: want.free,
          holes: want.holes,
          big: want.big,
          waste: want.waste,
        });
        expect(round.steps).toHaveLength(11);
        expect(round.ties).toBe(0);
      }
    }
  });

  it('걸음 중간 안쪽 낭비는 E 5 가 들어오는 #5 에서 5 KiB 까지 오른다', () => {
    const round = segmentationRound(data, 3, 0);
    expect(round.steps.map((s) => s.state.insideWaste)).toEqual([1, 2, 2, 2, 5, 2, 2, 1, 1, 2, 2]);
    expect(round.steps[9]!.frames).toEqual([1, 4]);
  });

  it('손잡이 A → B → A 로 돌려도 회차마다 계기가 사양 값이다', async () => {
    registerSegmentation();
    expect(getAlgorithmMechanismKind('segmentation')).toBe('reactive');
    const metrics = new Map<string, number>();
    const perRound: Record<string, number>[] = [];
    const inputs: ReactiveInputEvent[] = [
      { type: 'fit', payload: { value: 3, segmentIndex: 3, fit: '3', leaver: '0' } },
      { type: 'fit', payload: { value: 0, segmentIndex: 0, fit: '0', leaver: '0' } },
    ];
    let cancelled = false;
    const snap = (): void => {
      perRound.push(Object.fromEntries(metrics));
    };
    const ctx = {
      data,
      get cancelled() {
        return cancelled;
      },
      async emit(_e: FacetRuntimeEvent) {},
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
        snap();
        const next = inputs.shift();
        if (!next) {
          cancelled = true;
          throw new Error('cancelled');
        }
        return next;
      },
    };
    await segmentationAlgorithm(ctx as never);
    expect(perRound).toEqual([
      { 'free-total': 10, 'largest-hole': 4, rejected: 1, 'inside-waste': 0 },
      { 'free-total': 0, 'largest-hole': 0, rejected: 0, 'inside-waste': 2 },
      { 'free-total': 10, 'largest-hole': 4, rejected: 1, 'inside-waste': 0 },
    ]);
  });
});
