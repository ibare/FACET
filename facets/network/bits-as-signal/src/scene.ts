/**
 * bits-as-signal 장면.
 *
 * 바탕 — 문자 · 바이트 · 비트 열 (init 이 한 번 정한다)
 * 자취 — 선에 실린 비트 칸들, 여기까지의 뒤집힘 수, 그대로 싣는 선이 머문 가장 긴 구간
 * 이번 걸음 — 방금 실린 비트의 자리
 *
 * 장면은 이벤트를 잇기만 한다. 반 칸 · 뒤집힘 · 머문 구간은 알고리즘이 셈해 보낸다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SignalLevel = 'H' | 'L';

export type WireCell = {
  bit: 0 | 1;
  halves: [SignalLevel, SignalLevel];
  /** 이 비트 앞 경계에서 맨체스터 선이 뒤집혔는가 */
  edge: boolean;
  /** 이 비트 앞 경계에서 그대로 싣는 선이 뒤집혔는가 */
  levelFlip: boolean;
};

export type BitsAsSignalScene = {
  char: string | null;
  byte: number | null;
  bits: (0 | 1)[];
  cells: WireCell[];
  tally: { mid: number; edges: number; levelFlips: number };
  held: { from: number; len: number } | null;
  step: { kind: 'bit'; index: number } | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function asBit(v: unknown): 0 | 1 | null {
  return v === 0 || v === 1 ? v : null;
}

function asLevel(v: unknown): SignalLevel | null {
  return v === 'H' || v === 'L' ? v : null;
}

function asCount(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    throw new Error(`bits-as-signal 장면: ${name} 이 셈한 수가 아니다`);
  }
  return v;
}

export const bitsAsSignalScene: ScenePlan<BitsAsSignalScene> = {
  initial(initialData: unknown): BitsAsSignalScene {
    const char = isRecord(initialData) && typeof initialData['char'] === 'string' ? initialData['char'] : null;
    return {
      char,
      byte: null,
      bits: [],
      cells: [],
      tally: { mid: 0, edges: 0, levelFlips: 0 },
      held: null,
      step: null,
    };
  },

  reduce(scene: BitsAsSignalScene, event: FacetRuntimeEvent): BitsAsSignalScene {
    const p = event.payload;
    if (!isRecord(p)) return scene;

    if (event.type === 'init') {
      const char = p['char'];
      const byte = p['byte'];
      const bitsRaw = p['bits'];
      if (typeof char !== 'string' || typeof byte !== 'number' || !Array.isArray(bitsRaw)) {
        throw new Error('bits-as-signal 장면: init 의 모양이 다르다');
      }
      const bits: (0 | 1)[] = bitsRaw.map((b, i) => {
        const bit = asBit(b);
        if (bit === null) throw new Error(`bits-as-signal 장면: 비트 ${i} 가 0 · 1 이 아니다`);
        return bit;
      });
      return { ...scene, char, byte, bits, cells: [], tally: { mid: 0, edges: 0, levelFlips: 0 }, held: null, step: null };
    }

    if (event.type === 'bit') {
      const index = p['index'];
      const bit = asBit(p['bit']);
      const halvesRaw = p['halves'];
      const edge = p['edge'];
      const levelFlip = p['levelFlip'];
      if (typeof index !== 'number' || index !== scene.cells.length || bit === null) {
        throw new Error('bits-as-signal 장면: bit 의 차례나 값이 맞지 않는다');
      }
      if (!Array.isArray(halvesRaw) || halvesRaw.length !== 2) {
        throw new Error('bits-as-signal 장면: 반 칸이 둘이 아니다');
      }
      const a = asLevel(halvesRaw[0]);
      const c = asLevel(halvesRaw[1]);
      if (a === null || c === null || typeof edge !== 'boolean' || typeof levelFlip !== 'boolean') {
        throw new Error('bits-as-signal 장면: 반 칸이나 뒤집힘의 모양이 다르다');
      }
      const heldRaw = p['held'];
      let held: BitsAsSignalScene['held'] = null;
      if (heldRaw !== null) {
        if (!isRecord(heldRaw)) throw new Error('bits-as-signal 장면: held 의 모양이 다르다');
        held = { from: asCount(heldRaw['from'], 'held.from'), len: asCount(heldRaw['len'], 'held.len') };
      }
      return {
        ...scene,
        cells: [...scene.cells, { bit, halves: [a, c], edge, levelFlip }],
        tally: {
          mid: asCount(p['mid'], 'mid'),
          edges: asCount(p['edges'], 'edges'),
          levelFlips: asCount(p['levelFlips'], 'levelFlips'),
        },
        held,
        step: { kind: 'bit', index },
      };
    }

    return scene;
  },
};
