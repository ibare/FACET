/**
 * 포워딩 조각의 장면.
 *
 * 바탕 — 명령어 둘, 레지스터 파일의 처음 값, 끝나는 사이클(포워딩 있음 / 없음).
 *        `init` 이 한 번 정한다.
 * 자취 — 사이클 번호, 명령어마다 지금 선 단계와 손에 든 값(피연산자 · 결과 · 건네받은 값),
 *        레지스터 파일의 지금 값. `cycle` 이 걸음마다 얹는다.
 * 이번 걸음 — `step`. 그 사이클에 무엇이 옮겨 갔는지(단계 이동 · 쓰기 · 읽기 · 건넴 · 셈)와
 *        그 계기값(`from` · `was` · `replaced`). 그림이 운동을 고르는 데만 쓴다.
 *
 * 좌표 · 문안 · DOM 은 담지 않는다. 캡션은 종류와 인자뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import {
  producerOf,
  type CyclePayload,
  type DonePayload,
  type InitPayload,
  type Instr,
  type Op,
  type Reg,
  type Slot,
  type StageName,
  type Where,
} from './algorithm.js';

export type {
  Alu,
  CyclePayload,
  DonePayload,
  Forward,
  InitPayload,
  Instr,
  Move,
  Op,
  Read,
  Reg,
  Slot,
  StageName,
  Where,
  Write,
} from './algorithm.js';

export type Lane = {
  where: Where;
  /** EX 입구의 두 피연산자. a 는 rs, b 는 rt. */
  a: number | null;
  b: number | null;
  result: number | null;
  /** 결과를 레지스터 파일에 쓴 사이클. 아직이면 null. */
  writtenAt: number | null;
  /** EX/MEM 에서 건네받은 피연산자. `replaced` 는 레지스터 파일에서 읽어 두었던 옛 값. */
  fwd: { slot: Slot; from: number; replaced: number | null; cycle: number } | null;
};

export type Step =
  | { kind: 'blank' }
  | { kind: 'init' }
  | ({ kind: 'cycle' } & CyclePayload)
  | ({ kind: 'done' } & DonePayload);

export type Caption =
  | { kind: 'none' }
  | { kind: 'init'; from: number; to: number; reg: string }
  | { kind: 'fetch'; c: number; i: number }
  | { kind: 'read'; c: number; i: number; ra: string; va: number | null; rb: string; vb: number | null }
  | { kind: 'alu'; c: number; i: number; a: number; b: number; op: Op; value: number }
  | { kind: 'stale'; c: number; from: number; value: number; to: number; reg: string; old: number | null }
  | { kind: 'forward'; c: number; from: number; to: number; value: number; reg: string; old: number | null }
  | { kind: 'write'; c: number; i: number; reg: string; value: number }
  | { kind: 'done'; end: number; slow: number; stall: number; to: number; count: number; stalls: number };

export type OperandForwardingScene = {
  /** 단계 이름 차례 — 칸의 수와 순서. */
  stages: StageName[];
  program: Instr[];
  regs: Reg[];
  end: number;
  slowEnd: number;
  cycle: number;
  lanes: Lane[];
  finished: boolean;
  step: Step;
  caption: Caption;
};

/** 결과는 냈으나 아직 레지스터 파일에 쓰지 않은 명령어가 겨누는 레지스터 — 파일 쪽 값이 옛 값이다. */
export function staleRegs(scene: Pick<OperandForwardingScene, 'program' | 'lanes'>): Set<string> {
  const out = new Set<string>();
  scene.lanes.forEach((lane, i) => {
    if (lane.result !== null && lane.writtenAt === null) out.add(scene.program[i]!.rd);
  });
  return out;
}

/**
 * 명령어 `i` 의 피연산자 `reg` 가 레지스터 파일의 옛 값인가 — 앞 명령어가 그것을 셈해 두었으나
 * 아직 쓰지 않았다.
 */
export function readsOld(scene: Pick<OperandForwardingScene, 'program' | 'lanes'>, i: number, reg: string): boolean {
  const j = producerOf(scene.program, i, reg);
  if (j < 0) return false;
  const p = scene.lanes[j];
  return p !== undefined && p.result !== null && p.writtenAt === null;
}

/** 이 사이클에 건넴이 있었는가 — 자취(`fwd.cycle`)에서 읽는다. */
export function crossingNow(scene: Pick<OperandForwardingScene, 'lanes' | 'cycle'>): { from: number; to: number; slot: Slot }[] {
  const out: { from: number; to: number; slot: Slot }[] = [];
  scene.lanes.forEach((lane, to) => {
    if (lane.fwd && lane.fwd.cycle === scene.cycle) out.push({ from: lane.fwd.from, to, slot: lane.fwd.slot });
  });
  return out;
}

function emptyLane(): Lane {
  return { where: 'wait', a: null, b: null, result: null, writtenAt: null, fwd: null };
}

function reduceCycle(scene: OperandForwardingScene, p: CyclePayload): OperandForwardingScene {
  const lanes = scene.lanes.map((l) => ({ ...l, fwd: l.fwd ? { ...l.fwd } : null }));
  for (const m of p.moves) lanes[m.i]!.where = m.to;
  const regs = scene.regs.map((r) => ({ ...r }));
  for (const w of p.writes) {
    const row = regs.find((r) => r.name === w.reg);
    if (row) row.value = w.value;
    lanes[w.i]!.writtenAt = p.cycle;
  }
  for (const r of p.reads) lanes[r.i]![r.slot] = r.value;
  for (const f of p.forwards) {
    const lane = lanes[f.to]!;
    lane[f.slot] = f.value;
    lane.fwd = { slot: f.slot, from: f.from, replaced: f.replaced, cycle: p.cycle };
  }
  for (const x of p.alu) lanes[x.i]!.result = x.value;

  const next: OperandForwardingScene = {
    ...scene,
    regs,
    lanes,
    cycle: p.cycle,
    step: {
      kind: 'cycle',
      cycle: p.cycle,
      moves: p.moves.map((m) => ({ ...m })),
      writes: p.writes.map((w) => ({ ...w })),
      reads: p.reads.map((r) => ({ ...r })),
      forwards: p.forwards.map((f) => ({ ...f })),
      alu: p.alu.map((x) => ({ ...x })),
    },
    caption: { kind: 'none' },
  };
  next.caption = captionOf(next, p);
  return next;
}

function regValue(regs: readonly Reg[], name: string): number | null {
  return regs.find((r) => r.name === name)?.value ?? null;
}

function captionOf(scene: OperandForwardingScene, p: CyclePayload): Caption {
  const c = p.cycle;
  const f = p.forwards[0];
  if (f) {
    return { kind: 'forward', c, from: f.from, to: f.to, value: f.value, reg: f.reg, old: regValue(scene.regs, f.reg) };
  }
  const w = p.writes[0];
  if (w) return { kind: 'write', c, i: w.i, reg: w.reg, value: w.value };
  const stale = staleRegs(scene);
  const x = p.alu[0];
  const staleRead = p.reads.find((r) => stale.has(r.reg));
  if (x && staleRead) {
    const from = producerOf(scene.program, staleRead.i, staleRead.reg);
    return {
      kind: 'stale',
      c,
      from,
      value: scene.lanes[from]?.result ?? x.value,
      to: staleRead.i,
      reg: staleRead.reg,
      old: staleRead.value,
    };
  }
  if (x) return { kind: 'alu', c, i: x.i, a: x.a, b: x.b, op: scene.program[x.i]!.op, value: x.value };
  const ra = p.reads.find((r) => r.slot === 'a');
  const rb = p.reads.find((r) => r.slot === 'b' && r.i === ra?.i);
  if (ra && rb) return { kind: 'read', c, i: ra.i, ra: ra.reg, va: ra.value, rb: rb.reg, vb: rb.value };
  const fetched = p.moves.find((m) => m.to === 'IF');
  if (fetched) return { kind: 'fetch', c, i: fetched.i };
  return { kind: 'none' };
}

function initCaption(program: readonly Instr[]): Caption {
  for (let i = 0; i < program.length; i += 1) {
    for (const reg of [program[i]!.rs, program[i]!.rt]) {
      const from = producerOf(program, i, reg);
      if (from >= 0) return { kind: 'init', from, to: i, reg };
    }
  }
  return { kind: 'none' };
}

// ── payload 좁히개 ───────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
function isNum(v: unknown): v is number {
  return typeof v === 'number';
}
function isNumOrNull(v: unknown): v is number | null {
  return v === null || typeof v === 'number';
}
function isStr(v: unknown): v is string {
  return typeof v === 'string';
}
function isSlot(v: unknown): v is Slot {
  return v === 'a' || v === 'b';
}
function isOp(v: unknown): v is Op {
  return v === 'add' || v === 'sub';
}
const STAGE_WORDS: readonly string[] = ['IF', 'ID', 'EX', 'MEM', 'WB'];
function isStage(v: unknown): v is StageName {
  return isStr(v) && STAGE_WORDS.includes(v);
}
function isWhere(v: unknown): v is Where {
  return v === 'wait' || v === 'out' || isStage(v);
}
function arrayOf<T>(v: unknown, each: (x: Record<string, unknown>) => boolean): v is T[] {
  return Array.isArray(v) && v.every((x) => isRecord(x) && each(x));
}

function isInit(p: unknown): p is InitPayload {
  return (
    isRecord(p) &&
    Array.isArray(p.stages) &&
    p.stages.every(isStage) &&
    arrayOf<Instr>(p.program, (x) => isOp(x.op) && isStr(x.rd) && isStr(x.rs) && isStr(x.rt)) &&
    arrayOf<Reg>(p.registers, (x) => isStr(x.name) && isNumOrNull(x.value)) &&
    isNum(p.end) &&
    isNum(p.slowEnd)
  );
}

function isCycle(p: unknown): p is CyclePayload {
  return (
    isRecord(p) &&
    isNum(p.cycle) &&
    arrayOf(p.moves, (x) => isNum(x.i) && isWhere(x.from) && isWhere(x.to)) &&
    arrayOf(p.writes, (x) => isNum(x.i) && isStr(x.reg) && isNum(x.value) && isNumOrNull(x.was)) &&
    arrayOf(p.reads, (x) => isNum(x.i) && isSlot(x.slot) && isStr(x.reg) && isNumOrNull(x.value)) &&
    arrayOf(p.forwards, (x) => isNum(x.from) && isNum(x.to) && isSlot(x.slot) && isStr(x.reg) && isNum(x.value) && isNumOrNull(x.replaced)) &&
    arrayOf(p.alu, (x) => isNum(x.i) && isNum(x.a) && isNum(x.b) && isNum(x.value))
  );
}

function isDone(p: unknown): p is DonePayload {
  return isRecord(p) && isNum(p.end) && isNum(p.slowEnd) && isNum(p.count) && isNum(p.stalls);
}

export const operandForwardingScene: ScenePlan<OperandForwardingScene> = {
  initial(): OperandForwardingScene {
    return {
      stages: [],
      program: [],
      regs: [],
      end: 0,
      slowEnd: 0,
      cycle: 0,
      lanes: [],
      finished: false,
      step: { kind: 'blank' },
      caption: { kind: 'none' },
    };
  },
  reduce(scene: OperandForwardingScene, event: FacetRuntimeEvent): OperandForwardingScene {
    const p = event.payload;
    if (event.type === 'init' && isInit(p)) {
      const program = p.program.map((x) => ({ ...x }));
      return {
        stages: [...p.stages],
        program,
        regs: p.registers.map((r) => ({ ...r })),
        end: p.end,
        slowEnd: p.slowEnd,
        cycle: 0,
        lanes: program.map(emptyLane),
        finished: false,
        step: { kind: 'init' },
        caption: initCaption(program),
      };
    }
    if (event.type === 'cycle' && isCycle(p)) return reduceCycle(scene, p);
    if (event.type === 'done' && isDone(p)) {
      const init = initCaption(scene.program);
      return {
        ...scene,
        finished: true,
        step: { kind: 'done', end: p.end, slowEnd: p.slowEnd, count: p.count, stalls: p.stalls },
        caption: {
          kind: 'done',
          end: p.end,
          slow: p.slowEnd,
          stall: p.slowEnd - p.end,
          count: p.count,
          stalls: p.stalls,
          to: init.kind === 'init' ? init.to : scene.program.length - 1,
        },
      };
    }
    return scene;
  },
};
