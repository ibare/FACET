// @vitest-environment happy-dom
/**
 * 파일 블록 배치 — facet 고유의 주장을 잠근다.
 *   1. IR 두 함수 = 알고리즘이 화면에 낸 닿는 블록 (파일 전체 k, 사다리 밖 포함)
 *   2. 계기 — 9 → 4 → 9 로 돌려 회차마다 사양 표와 견준다
 *   3. 사다리 = segments[].value, 첫 판 값 = default
 *   4. stage 는 mountView 로 마운트해 판 하나를 그린다
 */
import { describe, expect, it } from 'vitest';
import { runIR } from '@ffacet/ir-interpreter';
import { getAlgorithmMechanismKind, mountView, type FacetRuntimeEvent } from '@ffacet/core/runtime';
import {
  buildPointerArray,
  checkSameOrder,
  fatWalk,
  fileBlockPlacementAlgorithm,
  fileBlockPlacementFacet,
  fileBlockPlacementImperativeIR,
  fileBlockPlacementStageView,
  inodeWalk,
  registerFileBlockPlacement,
  type FileBlockPlacementData,
  type FileBlockPlacementStageApi,
  type RoundView,
} from '../src/index.js';

const baseData = fileBlockPlacementFacet.initialData as FileBlockPlacementData;
const clone = (): FileBlockPlacementData => JSON.parse(JSON.stringify(baseData)) as FileBlockPlacementData;

/** 사양 실측표 — 대조용 */
const SPEC: Record<number, { target: number; inode: number; inodePath: number[]; fat: number; steps: number }> = {
  1: { target: 9, inode: 1, inodePath: [9], fat: 1, steps: 3 },
  4: { target: 5, inode: 1, inodePath: [5], fat: 4, steps: 6 },
  5: { target: 11, inode: 2, inodePath: [4, 11], fat: 5, steps: 8 },
  8: { target: 13, inode: 2, inodePath: [4, 13], fat: 8, steps: 11 },
  9: { target: 3, inode: 3, inodePath: [12, 8, 3], fat: 9, steps: 13 },
  12: { target: 15, inode: 3, inodePath: [12, 8, 15], fat: 12, steps: 16 },
};

interface Round {
  k: number;
  events: FacetRuntimeEvent[];
  metrics: Record<string, number>;
  sleeps: number;
  phases: string[];
}

/** 가짜 reactive ctx 로 알고리즘을 돌린다 — 입력 열을 다 쓰면 끊는다. */
async function play(inputs: number[]): Promise<Round[]> {
  const data = clone();
  const rounds: Round[] = [];
  const metrics: Record<string, number> = {};
  let cur: Round | null = null;
  let cancelled = false;
  const queue = [...inputs];
  const ctx = {
    data,
    get cancelled() {
      return cancelled;
    },
    async emit(e: FacetRuntimeEvent) {
      if (e.type === 'round-start') {
        const p = e.payload as { k: number };
        cur = { k: p.k, events: [], metrics: {}, sleeps: 0, phases: [] };
        rounds.push(cur);
      }
      if (!cur) throw new Error('판 밖 이벤트');
      cur.events.push(e);
      if (e.type === 'phase') cur.phases.push((e.payload as { phase: string }).phase);
    },
    metric(name: string, delta: number | 'inc') {
      metrics[name] = (metrics[name] ?? 0) + (delta === 'inc' ? 1 : delta);
    },
    async sleep() {
      if (cur) cur.sleeps += 1;
      return !cancelled;
    },
    async waitForInput() {
      if (cur) cur.metrics = { ...metrics };
      const v = queue.shift();
      if (v === undefined) {
        cancelled = true;
        throw new Error('cancelled');
      }
      return { type: 'blockIndex', payload: { value: v, segmentIndex: 0, blockIndex: String(v) } };
    },
    pollInput() {
      return null;
    },
  };
  await fileBlockPlacementAlgorithm(ctx as never);
  return rounds;
}

function blockOf(e: FacetRuntimeEvent): number {
  return (e.payload as { block: number }).block;
}

describe('fileBlockPlacement', () => {
  const ptr = buildPointerArray(baseData);
  const ir = fileBlockPlacementImperativeIR;

  it('데이터 크기 · 사다리 끝값을 잠근다', () => {
    expect(baseData.fat).toHaveLength(16);
    expect(ptr).toHaveLength(64);
    expect(baseData.blockLadder).toEqual([1, 4, 5, 8, 9, 12]);
    expect(baseData.blockLadder.at(-1)).toBe(12);
  });

  it('두 구조가 파일 전체에서 같은 차례를 말한다', () => {
    expect(checkSameOrder(baseData, ptr)).toEqual([9, 2, 14, 5, 11, 0, 7, 13, 3, 10, 6, 15]);
  });

  it('IR 두 함수 = 알고리즘의 닿는 블록 (k = 1..12, 사다리 밖 포함)', () => {
    for (let k = 1; k <= 12; k++) {
      const viaInode = runIR(ir, 'inodeBlock', [baseData.direct, baseData.oneLevel, baseData.twoLevel, ptr, baseData.perBlock, k]);
      const viaFat = runIR(ir, 'fatBlock', [baseData.fat, baseData.fatFirst, k]);
      const alg = fatWalk(baseData, k).at(-1)!.block;
      expect(inodeWalk(baseData, ptr, k).at(-1)!.block).toBe(alg);
      expect(viaInode).toBe(alg);
      expect(viaFat).toBe(alg);
    }
  });

  it('사다리 모든 k 에서 한 판이 사양 표와 같다 (닿는 블록 · 읽은 칸 · 걸음 · IR)', async () => {
    const ladder = baseData.blockLadder;
    const rounds = await play(ladder.filter((k) => k !== baseData.blockIndex));
    const byK = new Map(rounds.map((r) => [r.k, r]));
    for (const k of ladder) {
      const r = byK.get(k)!;
      const spec = SPEC[k]!;
      const inodeReads = r.events.filter((e) => e.type === 'inode-read');
      const fatReads = r.events.filter((e) => e.type === 'fat-read');
      expect(inodeReads.map(blockOf)).toEqual(spec.inodePath);
      expect(fatReads).toHaveLength(spec.fat);
      expect(blockOf(fatReads.at(-1)!)).toBe(spec.target);
      expect(blockOf(inodeReads.at(-1)!)).toBe(spec.target);
      expect(r.metrics['inode-reads']).toBe(spec.inode);
      expect(r.metrics['fat-reads']).toBe(spec.fat);
      expect(r.sleeps).toBe(spec.steps); // 걸음 0 포함 — sleep 하나가 걸음 하나
      const irInode = runIR(ir, 'inodeBlock', [baseData.direct, baseData.oneLevel, baseData.twoLevel, ptr, baseData.perBlock, k]);
      const irFat = runIR(ir, 'fatBlock', [baseData.fat, baseData.fatFirst, k]);
      expect(irInode).toBe(spec.target);
      expect(irFat).toBe(spec.target);
    }
    // 사다리 전체에서 phase 일곱이 다 켜진다
    const all = new Set(rounds.flatMap((r) => r.phases));
    expect([...all].sort()).toEqual(
      ['fat-data', 'fat-hop', 'inode-data', 'inode-direct', 'inode-mid', 'inode-one-level', 'inode-two-level'].sort(),
    );
  });

  it('계기 — 9 → 4 → 9 로 회차마다 {3, 9} · {1, 4} · {3, 9}', async () => {
    const rounds = await play([4, 9]);
    expect(rounds.map((r) => r.k)).toEqual([9, 4, 9]);
    expect(rounds.map((r) => [r.metrics['inode-reads'], r.metrics['fat-reads']])).toEqual([
      [3, 9],
      [1, 4],
      [3, 9],
    ]);
  });

  it('사다리 밖 손잡이 값은 던진다', async () => {
    await expect(play([7])).rejects.toThrow();
  });

  it('사다리 = segments[].value, 첫 판 값 = default', () => {
    const controls = (fileBlockPlacementFacet.blocks.controls as { controls: { widget?: string; segments?: { value: number; default?: boolean }[] }[] }).controls;
    const slider = controls.find((c) => c.widget === 'segmented-slider')!;
    expect(slider.segments!.map((s) => s.value)).toEqual(baseData.blockLadder);
    expect(slider.segments!.find((s) => s.default)!.value).toBe(baseData.blockIndex);
  });

  it('손잡이가 있으니 reactive 로 등록된다', () => {
    registerFileBlockPlacement();
    expect(getAlgorithmMechanismKind('fileBlockPlacement')).toBe('reactive');
  });

  it('stage 는 mountView 로 마운트해 판 하나를 끝까지 그리고, 깊이가 바뀌어도 던지지 않는다', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const inst = mountView(fileBlockPlacementStageView, container, { config: {}, initialData: clone(), locale: 'ko' });
    const stage = inst as unknown as FileBlockPlacementStageApi;
    const rounds = await play([12, 5, 1, 8]);
    for (const r of rounds) {
      const start = r.events.find((e) => e.type === 'round-start')!;
      stage.startRound(start.payload as RoundView, 0);
      for (const e of r.events) {
        if (e.type === 'inode-read') stage.readInode(e.payload as never, 0);
        if (e.type === 'fat-read') stage.readFat(e.payload as never, 0);
      }
    }
    expect(container.textContent).toContain('diary.txt');
    inst.destroy();
  });
});
