/**
 * pattern-to-instruction 의 장면.
 *
 * 바탕 — 펼친 나무 · 무늬 목록 · 대 보는 차례 · 원시 줄 (initial 이 initialData 에서 채운다)
 * 자취 — 고른 무늬들(picks) · 낸 명령들(emits)
 * 이번 걸음 — step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { flattenTree, readData, tryOrder } from './algorithm.js';
import type { FlatNode, Instr, TileDef } from './algorithm.js';

export type PickRec = { tile: number; at: number; covered: number[]; holes: number[]; missed: number[] };
export type EmitRec = { pick: number; instr: Instr };

export type PatternToInstructionStep =
  | { kind: 'start' }
  | { kind: 'pick'; pick: number }
  | { kind: 'emit'; emit: number };

export type PatternToInstructionScene = {
  source: string;
  nodes: FlatNode[];
  tiles: TileDef[];
  order: number[];
  picks: PickRec[];
  emits: EmitRec[];
  step: PatternToInstructionStep;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`장면: ${what} 가 정수가 아니다`);
  return v;
}

function nums(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`장면: ${what} 가 배열이 아니다`);
  return v.map((x, i) => num(x, `${what}[${i}]`));
}

function strOrNull(v: unknown, what: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`장면: ${what} 가 글자가 아니다`);
  return v;
}

function numOrNull(v: unknown, what: string): number | null {
  if (v === null) return null;
  if (typeof v !== 'number') throw new Error(`장면: ${what} 가 수가 아니다`);
  return v;
}

function readInstr(v: unknown): Instr {
  if (!isRecord(v) || typeof v.op !== 'string' || !Array.isArray(v.srcs)) throw new Error('장면: 명령 구조가 아니다');
  return {
    op: v.op,
    dst: strOrNull(v.dst, 'instr.dst'),
    srcs: v.srcs.map((s, i) => {
      if (typeof s !== 'string') throw new Error(`장면: instr.srcs[${i}] 가 글자가 아니다`);
      return s;
    }),
    mem: strOrNull(v.mem, 'instr.mem'),
    off: numOrNull(v.off, 'instr.off'),
    imm: numOrNull(v.imm, 'instr.imm'),
  };
}

export const patternToInstructionScene: ScenePlan<PatternToInstructionScene> = {
  initial(initialData: unknown): PatternToInstructionScene {
    const data = readData(initialData);
    return {
      source: data.source,
      nodes: flattenTree(data.tree),
      tiles: data.tiles,
      order: tryOrder(data.tiles),
      picks: [],
      emits: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: PatternToInstructionScene, event: FacetRuntimeEvent): PatternToInstructionScene {
    const p = event.payload;
    if (event.type === 'pick') {
      if (!isRecord(p)) throw new Error('장면: pick 에 payload 가 없다');
      const pick = num(p.pick, 'pick.pick');
      if (pick !== scene.picks.length) throw new Error(`장면: pick 차례 ${pick} 가 자취와 어긋난다`);
      const rec: PickRec = {
        tile: num(p.tile, 'pick.tile'),
        at: num(p.at, 'pick.at'),
        covered: nums(p.covered, 'pick.covered'),
        holes: nums(p.holes, 'pick.holes'),
        missed: nums(p.missed, 'pick.missed'),
      };
      if (scene.tiles[rec.tile] === undefined) throw new Error(`장면: 없는 무늬 ${rec.tile}`);
      if (scene.nodes[rec.at] === undefined) throw new Error(`장면: 없는 마디 ${rec.at}`);
      return { ...scene, picks: [...scene.picks, rec], step: { kind: 'pick', pick } };
    }
    if (event.type === 'emit') {
      if (!isRecord(p)) throw new Error('장면: emit 에 payload 가 없다');
      const emit = num(p.emit, 'emit.emit');
      if (emit !== scene.emits.length) throw new Error(`장면: emit 차례 ${emit} 가 자취와 어긋난다`);
      const pick = num(p.pick, 'emit.pick');
      if (scene.picks[pick] === undefined) throw new Error(`장면: 고르지 않은 조각 ${pick}`);
      const rec: EmitRec = { pick, instr: readInstr(p.instr) };
      return { ...scene, emits: [...scene.emits, rec], step: { kind: 'emit', emit } };
    }
    throw new Error(`장면: 모르는 이벤트 ${event.type}`);
  },
};
