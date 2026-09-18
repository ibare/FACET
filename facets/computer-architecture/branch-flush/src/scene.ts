/**
 * branch-flush 장면 — 이벤트를 파이프라인 차림으로 잇는다.
 *
 * 바탕: 해독한 명령어 · 값이 알려진 레지스터 · 단계 수 (init 이 한 번 정한다)
 * 자취: 사이클 · 칸 차림 · 다음 가져올 순번 · 판정 · 버린 것 · 쓴 레지스터
 * 이번 걸음: step — 흐름을 고르는 데 필요한 계기값(before · pcBefore)을 싣는다
 *
 * payload 는 `as` 로 믿지 않고 아래 좁히개로 읽는다 (C9). 모양이 어긋나면 장면을
 * 그대로 돌려준다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { Instr, Slot } from './algorithm.js';

export type { Instr, Slot } from './algorithm.js';

export type Verdict = { at: number; a: number; b: number; taken: boolean; cycle: number };

type Dropped = { i: number; slot: number };
type Bubble = { b: number; slot: number };

export type BranchFlushStep =
  | { kind: 'init' }
  | {
      kind: 'cycle';
      n: number;
      /** 이 사이클 앞의 칸 차림 — 무엇이 어디서 왔는지 */
      before: Slot[];
      pcBefore: number;
      /** 이번에 가져온 명령어 순번 */
      fetched: number | null;
      /** 가져온 것이 틀린 짐작 뒤 목표에서 온 것인가 */
      redirected: boolean;
      /** WB 에서 레지스터에 쓴 것 */
      wrote: { reg: string; by: number } | null;
      /** WB 를 지나 파이프를 떠난 것 */
      left: Slot;
    }
  | ({ kind: 'resolve' } & Verdict)
  | { kind: 'flush'; dropped: Dropped[]; bubbles: Bubble[]; pcBefore: number }
  | { kind: 'done'; lost: number; finish: number; last: number };

export type BranchFlushScene = {
  program: Instr[];
  registers: { name: string; value: number }[];
  depth: number;
  cycle: number;
  slots: Slot[];
  pc: number;
  verdict: Verdict | null;
  dropped: Dropped[];
  written: { reg: string; by: number; cycle: number }[];
  /** 틀린 짐작 뒤 가져올 목표 — 가져오면 풀린다 */
  redirect: number | null;
  /** 목표에서 가져온 명령어들 (옳은 갈래) */
  rightPath: number[];
  result: { lost: number; finish: number; last: number } | null;
  step: BranchFlushStep | null;
};

// ── 좁히개

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

function readSlot(v: unknown): Slot | undefined {
  if (v === null) return null;
  if (!isRec(v)) return undefined;
  if (isNum(v.i)) return { i: v.i };
  if (isNum(v.b)) return { b: v.b };
  return undefined;
}

function readSlots(v: unknown): Slot[] | null {
  if (!Array.isArray(v)) return null;
  const out: Slot[] = [];
  for (const x of v) {
    const s = readSlot(x);
    if (s === undefined) return null;
    out.push(s);
  }
  return out;
}

function readInstr(v: unknown): Instr | null {
  if (!isRec(v)) return null;
  const { id, text, op, dest, srcs, label, target } = v;
  if (!isStr(id) || !isStr(text) || !isStr(op)) return null;
  if (dest !== null && !isStr(dest)) return null;
  if (label !== null && !isStr(label)) return null;
  if (target !== null && !isNum(target)) return null;
  if (!Array.isArray(srcs) || !srcs.every(isStr)) return null;
  return { id, text, op, dest, srcs: [...srcs], label, target };
}

function readDropped(v: unknown): Dropped[] | null {
  if (!Array.isArray(v)) return null;
  const out: Dropped[] = [];
  for (const x of v) {
    if (!isRec(x) || !isNum(x.i) || !isNum(x.slot)) return null;
    out.push({ i: x.i, slot: x.slot });
  }
  return out;
}

function readBubbles(v: unknown): Bubble[] | null {
  if (!Array.isArray(v)) return null;
  const out: Bubble[] = [];
  for (const x of v) {
    if (!isRec(x) || !isNum(x.b) || !isNum(x.slot)) return null;
    out.push({ b: x.b, slot: x.slot });
  }
  return out;
}

function copySlot(s: Slot): Slot {
  if (s === null) return null;
  return 'i' in s ? { i: s.i } : { b: s.b };
}

export const branchFlushScene: ScenePlan<BranchFlushScene> = {
  initial(): BranchFlushScene {
    return {
      program: [],
      registers: [],
      depth: 0,
      cycle: 0,
      slots: [],
      pc: 0,
      verdict: null,
      dropped: [],
      written: [],
      redirect: null,
      rightPath: [],
      result: null,
      step: null,
    };
  },

  reduce(scene: BranchFlushScene, event: FacetRuntimeEvent): BranchFlushScene {
    const p = event.payload;
    if (!isRec(p)) return scene;
    switch (event.type) {
      case 'init': {
        if (!Array.isArray(p.program) || !Array.isArray(p.registers) || !isNum(p.depth)) return scene;
        const program: Instr[] = [];
        for (const x of p.program) {
          const ins = readInstr(x);
          if (!ins) return scene;
          program.push(ins);
        }
        const registers: { name: string; value: number }[] = [];
        for (const r of p.registers) {
          if (!isRec(r) || !isStr(r.name) || !isNum(r.value)) return scene;
          registers.push({ name: r.name, value: r.value });
        }
        const depth = p.depth;
        return {
          ...branchFlushScene.initial(undefined),
          program,
          registers,
          depth,
          slots: Array.from({ length: depth }, () => null),
          step: { kind: 'init' },
        };
      }
      case 'cycle': {
        const slots = readSlots(p.slots);
        if (!slots || !isNum(p.n) || !isNum(p.pc)) return scene;
        const n = p.n;
        const head = slots[0] ?? null;
        const fetched = head !== null && 'i' in head ? head.i : null;
        const redirected = fetched !== null && fetched === scene.redirect;
        const wb = slots[slots.length - 1] ?? null;
        const by = wb !== null && 'i' in wb ? wb.i : null;
        const dest = by === null ? null : (scene.program[by]?.dest ?? null);
        const wrote = by !== null && dest !== null ? { reg: dest, by } : null;
        return {
          ...scene,
          cycle: n,
          slots,
          pc: p.pc,
          written: wrote ? [...scene.written, { ...wrote, cycle: n }] : scene.written,
          redirect: redirected ? null : scene.redirect,
          rightPath: redirected && fetched !== null ? [...scene.rightPath, fetched] : scene.rightPath,
          step: {
            kind: 'cycle',
            n,
            before: scene.slots.map(copySlot),
            pcBefore: scene.pc,
            fetched,
            redirected,
            wrote,
            left: copySlot(scene.slots[scene.slots.length - 1] ?? null),
          },
        };
      }
      case 'resolve': {
        if (!isNum(p.at) || !isNum(p.a) || !isNum(p.b) || typeof p.taken !== 'boolean' || !isNum(p.cycle)) return scene;
        const verdict: Verdict = { at: p.at, a: p.a, b: p.b, taken: p.taken, cycle: p.cycle };
        return { ...scene, verdict, step: { kind: 'resolve', ...verdict } };
      }
      case 'flush': {
        const dropped = readDropped(p.dropped);
        const bubbles = readBubbles(p.bubbles);
        if (!dropped || !bubbles || !isNum(p.target)) return scene;
        const slots = scene.slots.map(copySlot);
        for (const bub of bubbles) slots[bub.slot] = { b: bub.b };
        return {
          ...scene,
          slots,
          pc: p.target,
          dropped: [...scene.dropped, ...dropped],
          redirect: p.target,
          step: {
            kind: 'flush',
            dropped: dropped.map((d) => ({ ...d })),
            bubbles: bubbles.map((b) => ({ ...b })),
            pcBefore: scene.pc,
          },
        };
      }
      case 'done': {
        if (!isNum(p.lost) || !isNum(p.finish) || !isNum(p.last)) return scene;
        const result = { lost: p.lost, finish: p.finish, last: p.last };
        return { ...scene, result, step: { kind: 'done', ...result } };
      }
      default:
        return scene;
    }
  },
};
