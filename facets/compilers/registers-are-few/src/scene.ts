/**
 * registers-are-few 의 장면.
 *
 * 바탕  — 명령 열 · 레지스터 이름 · 값 수 (init)
 * 자취  — 레지스터마다 지금 앉은 값(seats) · 앞서 앉았다 떠난 값(past) · 마친 줄(done)
 * 이번 걸음 — step
 *
 * 셈은 알고리즘이 한다. 장면은 assign 이 말한 대로 자리를 비우고 채운다. 말과 자리가
 * 어긋나면(빈 자리에 떠날 값이 없다 · 앉을 자리가 차 있다) 던진다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readRegistersData, regNames, type Instr } from './algorithm.js';

export type Move = { v: string; r: string };

export type LineDone = {
  line: number;
  /** 이 줄의 글자를 찍을 임시 → 레지스터 */
  names: Record<string, string>;
  /** 줄을 마친 직후 산 값의 수 */
  live: number;
};

export type RegistersStep =
  | { kind: 'start' }
  | {
      kind: 'line';
      line: number;
      freed: Move[];
      got: Move | null;
      live: number;
      peak: number;
      emitted: number;
    };

export type RegistersAreFewScene = {
  program: Instr[];
  regs: string[];
  /** 값(임시 이름)의 수 — init 이 채운다 */
  values: number | null;
  /** regs 와 같은 차례. 지금 앉은 값, 비었으면 null */
  seats: (string | null)[];
  /** regs 와 같은 차례. 앞서 앉았다 떠난 값 (떠난 차례) */
  past: string[][];
  done: LineDone[];
  step: RegistersStep;
};

function asObject(x: unknown, what: string): Record<string, unknown> {
  if (typeof x !== 'object' || x === null) throw new Error(`${what} 가 객체가 아니다`);
  return x as Record<string, unknown>;
}

function asNumber(x: unknown, what: string): number {
  if (typeof x !== 'number') throw new Error(`${what} 가 수가 아니다`);
  return x;
}

function asMove(x: unknown, what: string): Move {
  const o = asObject(x, what);
  if (typeof o.v !== 'string' || typeof o.r !== 'string') throw new Error(`${what} 의 v · r 이 글자가 아니다`);
  return { v: o.v, r: o.r };
}

function asNames(x: unknown): Record<string, string> {
  const o = asObject(x, 'names');
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (typeof v !== 'string') throw new Error(`names.${k} 가 글자가 아니다`);
    out[k] = v;
  }
  return out;
}

function seatIndex(regs: string[], r: string): number {
  const i = regs.indexOf(r);
  if (i < 0) throw new Error(`모르는 레지스터 ${r}`);
  return i;
}

export const registersAreFewScene: ScenePlan<RegistersAreFewScene> = {
  initial(initialData: unknown): RegistersAreFewScene {
    const { registers, program } = readRegistersData(initialData);
    const regs = regNames(registers);
    return {
      program,
      regs,
      values: null,
      seats: regs.map(() => null),
      past: regs.map(() => []),
      done: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: RegistersAreFewScene, event: FacetRuntimeEvent): RegistersAreFewScene {
    if (event.type === 'init') {
      const p = asObject(event.payload, 'init payload');
      const lines = asNumber(p.lines, 'init.lines');
      if (lines !== scene.program.length) throw new Error(`init.lines ${lines} 가 명령 수와 다르다`);
      return { ...scene, values: asNumber(p.values, 'init.values') };
    }
    if (event.type === 'assign') {
      const p = asObject(event.payload, 'assign payload');
      const line = asNumber(p.line, 'assign.line');
      if (!Array.isArray(p.freed)) throw new Error('assign.freed 가 목록이 아니다');
      const freed = p.freed.map((m, i) => asMove(m, `assign.freed[${i}]`));
      const got = p.got === null ? null : asMove(p.got, 'assign.got');
      const live = asNumber(p.live, 'assign.live');
      const peak = asNumber(p.peak, 'assign.peak');
      const emitted = asNumber(p.emitted, 'assign.emitted');
      const names = asNames(p.names);

      const seats = [...scene.seats];
      const past = scene.past.map((xs) => [...xs]);
      for (const m of freed) {
        const i = seatIndex(scene.regs, m.r);
        if (seats[i] !== m.v) throw new Error(`L${line}: ${m.r} 에 ${m.v} 가 앉아 있지 않다`);
        seats[i] = null;
        const row = past[i];
        if (row === undefined) throw new Error(`L${line}: ${m.r} 의 자취가 없다`);
        row.push(m.v);
      }
      if (got !== null) {
        const i = seatIndex(scene.regs, got.r);
        if (seats[i] !== null) throw new Error(`L${line}: ${got.r} 가 비어 있지 않다`);
        seats[i] = got.v;
      }
      return {
        ...scene,
        seats,
        past,
        done: [...scene.done, { line, names, live }],
        step: { kind: 'line', line, freed, got, live, peak, emitted },
      };
    }
    throw new Error(`모르는 이벤트 ${event.type}`);
  },
};
