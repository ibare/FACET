/**
 * 아직 안 나온 값 — 장면.
 *
 * 바탕: 명령어(해독한 것) · 레지스터 이름.
 * 자취: 레지스터 값 · 명령어마다 읽은 값과 셈한 값 · 붙들렸을 때 가져갔을 틀린 결과.
 * 이번 걸음: 사이클 하나 — 누가 어디서 어디로 옮겼는지, 앞 반의 쓰기, 뒤 반의 읽기,
 * 읽지 못하고 붙들린 명령어, 이번에 풀려난 명령어.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  parseInstr,
  listRegisters,
  type CyclePayload,
  type Instr,
  type ReadBeforeWriteFacetData,
  type Stall,
  type Token,
} from './algorithm.js';

/** 자리 번호: -1 은 아직 안 들어온 것, 0..4 는 IF..WB, 5 는 떠난 것. */
export type Move = { token: Token; from: number; to: number };

export type CycleStep = {
  kind: 'cycle';
  moves: Move[];
  write: { i: number; reg: string; value: number; was: number | null } | null;
  read: { i: number; values: number[] } | null;
  exec: { i: number; value: number } | null;
  /** 이번 사이클에 처음 붙들렸는가 */
  stallNew: boolean;
  /** 붙들려 있다가 이번 뒤 반에 읽고 풀려난 명령어 */
  released: { i: number; reg: string } | null;
};

export type ReadBeforeWriteScene = {
  program: Instr[];
  regNames: string[];
  regs: (number | null)[];
  /** 레지스터마다 마지막으로 쓴 명령어 */
  writtenBy: (number | null)[];
  reads: (number[] | null)[];
  results: (number | null)[];
  /** 붙들렸던 명령어가 일찍 읽었다면 냈을 값 */
  wrongs: (number | null)[];
  cycle: number;
  slots: (Token | null)[];
  stall: Stall | null;
  step: { kind: 'start' } | CycleStep;
};

function isData(v: unknown): v is ReadBeforeWriteFacetData {
  const d = v as ReadBeforeWriteFacetData | null;
  return !!d && Array.isArray(d.program) && typeof d.registers === 'object' && d.registers !== null;
}

function isToken(v: unknown): v is Token {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (o.kind === 'instr' && typeof o.i === 'number') || (o.kind === 'bubble' && typeof o.born === 'number');
}

function isNullOrObject(v: unknown): boolean {
  return v === null || (typeof v === 'object' && v !== undefined);
}

/** cycle 이벤트의 payload 를 좁힌다. 꼴이 어긋나면 그 걸음을 버린다. */
function isCyclePayload(v: unknown): v is CyclePayload {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o.cycle !== 'number' || !Array.isArray(o.slots) || o.slots.length !== 5) return false;
  if (!o.slots.every((t) => t === null || isToken(t))) return false;
  if (!isNullOrObject(o.write) || !isNullOrObject(o.read) || !isNullOrObject(o.exec) || !isNullOrObject(o.stall)) return false;
  const w = o.write as Record<string, unknown> | null;
  if (w && (typeof w.i !== 'number' || typeof w.reg !== 'string' || typeof w.value !== 'number')) return false;
  const r = o.read as Record<string, unknown> | null;
  if (r && (typeof r.i !== 'number' || !Array.isArray(r.values) || !r.values.every((x) => typeof x === 'number'))) return false;
  const e = o.exec as Record<string, unknown> | null;
  if (e && (typeof e.i !== 'number' || typeof e.value !== 'number')) return false;
  const st = o.stall as Record<string, unknown> | null;
  if (st && (typeof st.i !== 'number' || typeof st.reg !== 'string' || typeof st.writer !== 'number')) return false;
  return true;
}

export function tokenKey(t: Token): string {
  return t.kind === 'instr' ? `i${t.i}` : `b${t.born}`;
}

export const readBeforeWriteScene: ScenePlan<ReadBeforeWriteScene> = {
  initial(initialData: unknown): ReadBeforeWriteScene {
    const data = isData(initialData) ? initialData : { type: 'read-before-write' as const, stepMs: 800, registers: {}, program: [] };
    const program = data.program.map(parseInstr);
    const regNames = listRegisters(data.registers, program);
    return {
      program,
      regNames,
      regs: regNames.map((r) => data.registers[r] ?? null),
      writtenBy: regNames.map(() => null),
      reads: program.map(() => null),
      results: program.map(() => null),
      wrongs: program.map(() => null),
      cycle: 0,
      slots: [null, null, null, null, null],
      stall: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene, event: FacetRuntimeEvent): ReadBeforeWriteScene {
    if (event.type !== 'cycle' || !isCyclePayload(event.payload)) return scene;
    const p = event.payload;

    const where = (slots: (Token | null)[], key: string): number =>
      slots.findIndex((t) => t !== null && tokenKey(t) === key);
    const moves: Move[] = [];
    for (const t of p.slots) {
      if (t) moves.push({ token: { ...t }, from: where(scene.slots, tokenKey(t)), to: where(p.slots, tokenKey(t)) });
    }
    for (const t of scene.slots) {
      if (t && where(p.slots, tokenKey(t)) < 0) moves.push({ token: { ...t }, from: where(scene.slots, tokenKey(t)), to: 5 });
    }

    const regs = [...scene.regs];
    const writtenBy = [...scene.writtenBy];
    let write: CycleStep['write'] = null;
    if (p.write) {
      const k = scene.regNames.indexOf(p.write.reg);
      write = { ...p.write, was: regs[k] ?? null };
      regs[k] = p.write.value;
      writtenBy[k] = p.write.i;
    }
    const reads = [...scene.reads];
    if (p.read) reads[p.read.i] = [...p.read.values];
    const results = [...scene.results];
    if (p.exec) results[p.exec.i] = p.exec.value;
    const wrongs = [...scene.wrongs];
    if (p.stall) wrongs[p.stall.i] = p.stall.wrong;

    const released =
      scene.stall && p.read && p.read.i === scene.stall.i ? { i: scene.stall.i, reg: scene.stall.reg } : null;

    return {
      program: scene.program,
      regNames: scene.regNames,
      regs,
      writtenBy,
      reads,
      results,
      wrongs,
      cycle: p.cycle,
      slots: p.slots.map((t) => (t ? { ...t } : null)),
      stall: p.stall ? { ...p.stall } : null,
      step: {
        kind: 'cycle',
        moves,
        write,
        read: p.read ? { i: p.read.i, values: [...p.read.values] } : null,
        exec: p.exec ? { ...p.exec } : null,
        stallNew: !!p.stall && (!scene.stall || scene.stall.i !== p.stall.i),
        released,
      },
    };
  },
};
