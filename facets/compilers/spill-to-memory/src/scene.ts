/**
 * spill-to-memory 장면.
 *
 * - 바탕: 할당 전 명령 열 `program` 과 레지스터 수 `k` (initial 이 한 번 베낀다)
 * - 자취: 지금까지 낸 명령 줄 `out` (끼어든 줄 포함) · 레지스터를 쥔 값 `regs` · 스택 칸 `stack` · 산 값 수
 * - 이번 걸음: `step`
 *
 * 셈(누구를 밀어낼지 · 어느 레지스터인지)은 알고리즘이 하고, 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readSpillData, type Instr } from './algorithm.js';

export type SpillRow =
  | { kind: 'orig'; line: number; names: Record<string, string> }
  | { kind: 'spill'; v: string; reg: string; slot: number }
  | { kind: 'reload'; v: string; reg: string; slot: number };

/** 화면에 한 줄 — 낸 줄이거나 아직 할당 전인 원래 줄 */
export type ShownRow = SpillRow | { kind: 'pending'; line: number };

export type Held = { v: string; last: number };

export type StackCell = { slot: number; v: string; back: boolean };

export type SpillStep =
  | { kind: 'start' }
  | {
      kind: 'line';
      line: number;
      /** 화면 줄 목록에서 이 줄의 자리 */
      at: number;
      /** 밀어냄 줄이 끼어든 자리 (없으면 null) */
      inserted: number | null;
      freed: { v: string; reg: string }[];
      got: { v: string; reg: string; last: number } | null;
      spill: { v: string; reg: string; slot: number; last: number; cands: { v: string; last: number }[] } | null;
    }
  | { kind: 'reload'; v: string; reg: string; slot: number; before: number; last: number; inserted: number };

export type SpillScene = {
  program: Instr[];
  k: number;
  out: SpillRow[];
  /** 마지막으로 할당한 원래 줄 (0 = 아직 없음) */
  done: number;
  regs: (Held | null)[];
  stack: StackCell[];
  live: number;
  peak: number;
  step: SpillStep;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function str(o: Record<string, unknown>, key: string): string {
  const x = o[key];
  if (typeof x !== 'string') throw new Error(`spill-to-memory 장면: ${key} 가 글자가 아니다`);
  return x;
}

function num(o: Record<string, unknown>, key: string): number {
  const x = o[key];
  if (typeof x !== 'number') throw new Error(`spill-to-memory 장면: ${key} 가 수가 아니다`);
  return x;
}

function rec(x: unknown, what: string): Record<string, unknown> {
  if (!isRecord(x)) throw new Error(`spill-to-memory 장면: ${what} 이 객체가 아니다`);
  return x;
}

function list(x: unknown, what: string): unknown[] {
  if (!Array.isArray(x)) throw new Error(`spill-to-memory 장면: ${what} 이 목록이 아니다`);
  return x;
}

function regIndex(scene: SpillScene, reg: string): number {
  const m = /^r(\d+)$/.exec(reg);
  const i = m === null ? -1 : Number(m[1]) - 1;
  if (i < 0 || i >= scene.k) throw new Error(`spill-to-memory 장면: 모르는 레지스터 ${reg}`);
  return i;
}

/** 화면 줄 목록 — 낸 줄 뒤에 아직 할당 전인 원래 줄. 장면 · 그림이 같이 쓴다. */
export function shownRows(scene: SpillScene): ShownRow[] {
  const rows: ShownRow[] = [...scene.out];
  for (let line = scene.done + 1; line <= scene.program.length; line += 1) rows.push({ kind: 'pending', line });
  return rows;
}

function reduceLine(scene: SpillScene, p: Record<string, unknown>): SpillScene {
  const line = num(p, 'line');
  if (line !== scene.done + 1) throw new Error(`spill-to-memory 장면: L${line} 가 차례가 아니다`);
  const namesRaw = rec(p.names, 'names');
  const names: Record<string, string> = {};
  for (const key of Object.keys(namesRaw)) names[key] = str(namesRaw, key);
  const freed = list(p.freed, 'freed').map((f) => {
    const o = rec(f, 'freed 항목');
    return { v: str(o, 'v'), reg: str(o, 'reg') };
  });
  const got =
    p.got === null
      ? null
      : (() => {
          const o = rec(p.got, 'got');
          return { v: str(o, 'v'), reg: str(o, 'reg'), last: num(o, 'last') };
        })();
  const spill =
    p.spill === null
      ? null
      : (() => {
          const o = rec(p.spill, 'spill');
          const cands = list(o.cands, 'cands').map((c) => {
            const co = rec(c, 'cands 항목');
            return { v: str(co, 'v'), last: num(co, 'last') };
          });
          return { v: str(o, 'v'), reg: str(o, 'reg'), slot: num(o, 'slot'), last: num(o, 'last'), cands };
        })();
  const live = num(p, 'live');

  const regs = [...scene.regs];
  for (const f of freed) {
    const i = regIndex(scene, f.reg);
    if (regs[i]?.v !== f.v) throw new Error(`spill-to-memory 장면: L${line} ${f.reg} 에 ${f.v} 가 없다`);
    regs[i] = null;
  }
  const out = [...scene.out];
  let stack = scene.stack;
  let inserted: number | null = null;
  if (spill !== null) {
    const i = regIndex(scene, spill.reg);
    if (regs[i]?.v !== spill.v) throw new Error(`spill-to-memory 장면: L${line} ${spill.reg} 에 ${spill.v} 가 없다`);
    regs[i] = null;
    inserted = out.length;
    out.push({ kind: 'spill', v: spill.v, reg: spill.reg, slot: spill.slot });
    stack = [...scene.stack, { slot: spill.slot, v: spill.v, back: false }];
  }
  if (got !== null) {
    const i = regIndex(scene, got.reg);
    if (regs[i] !== null) throw new Error(`spill-to-memory 장면: L${line} ${got.reg} 가 비지 않았다`);
    regs[i] = { v: got.v, last: got.last };
  }
  const at = out.length;
  out.push({ kind: 'orig', line, names });
  return {
    ...scene,
    out,
    done: line,
    regs,
    stack,
    live,
    peak: Math.max(scene.peak, live),
    step: { kind: 'line', line, at, inserted, freed, got, spill },
  };
}

function reduceReload(scene: SpillScene, p: Record<string, unknown>): SpillScene {
  const v = str(p, 'v');
  const reg = str(p, 'reg');
  const slot = num(p, 'slot');
  const before = num(p, 'before');
  const last = num(p, 'last');
  if (before !== scene.done + 1) throw new Error(`spill-to-memory 장면: L${before} 앞 되불러옴이 차례가 아니다`);
  const cell = scene.stack.find((c) => c.slot === slot);
  if (cell === undefined || cell.v !== v) throw new Error(`spill-to-memory 장면: [sp+${slot}] 에 ${v} 가 없다`);
  const i = regIndex(scene, reg);
  if (scene.regs[i] !== null) throw new Error(`spill-to-memory 장면: ${reg} 가 비지 않았다`);
  const regs = [...scene.regs];
  regs[i] = { v, last };
  const inserted = scene.out.length;
  return {
    ...scene,
    out: [...scene.out, { kind: 'reload', v, reg, slot }],
    regs,
    stack: scene.stack.map((c) => (c.slot === slot ? { ...c, back: true } : c)),
    step: { kind: 'reload', v, reg, slot, before, last, inserted },
  };
}

export const spillToMemoryScene: ScenePlan<SpillScene> = {
  initial(initialData: unknown): SpillScene {
    const data = readSpillData(initialData);
    return {
      program: data.program.map((ins) => ({ ...ins, srcs: [...ins.srcs] })),
      k: data.k,
      out: [],
      done: 0,
      regs: Array.from({ length: data.k }, () => null),
      stack: [],
      live: 0,
      peak: 0,
      step: { kind: 'start' },
    };
  },
  reduce(scene: SpillScene, event: FacetRuntimeEvent): SpillScene {
    const p = rec(event.payload, `${event.type} payload`);
    switch (event.type) {
      case 'line':
        return reduceLine(scene, p);
      case 'reload':
        return reduceReload(scene, p);
      default:
        throw new Error(`spill-to-memory 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
