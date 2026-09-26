/**
 * value-flows-to-use 의 장면.
 *
 * 바탕 — 코드(명령 목록). initial() 이 initialData 에서 베낀다.
 * 자취 — 지금까지 사슬을 낸 넣기들 (`flows`). 걸음마다 하나씩 붙는다.
 * 이번 걸음 — 방금 붙은 넣기의 자리 (`step`).
 *
 * 셈(누가 누구를 읽는가)은 알고리즘이 한다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { defOf, readCode, type Instr, type Operand, type Slot, type Use } from './algorithm.js';

/** 그림이 읽는 칸 이름 — 알고리즘의 칸 이름과 같다. */
export type ReadSlot = Slot;

export type Flow = { line: number; name: string; uses: Use[]; cut: number | null };

export type ValueFlowsToUseScene = {
  code: Instr[];
  /** 바깥 값을 읽는 칸 — 알고리즘의 init 이 준다. 오기 전에는 null */
  outside: Use[] | null;
  flows: Flow[];
  /** 마지막 넣기가 실어 온 사슬 총수. 끝나기 전에는 null */
  end: { chains: number } | null;
  step: { kind: 'flow'; at: number } | null;
};

/** 명령 글자의 토막 — 그림이 읽는 칸의 자리를 찾으려고 칸마다 가른다. */
export type Segment =
  | { role: 'plain'; text: string }
  | { role: 'dst'; text: string }
  | { role: 'read'; slot: Slot; text: string; name: string }
  | { role: 'num'; text: string };

function operandSegment(slot: Slot, o: Operand): Segment {
  if ('var' in o) return { role: 'read', slot, text: o.var, name: o.var };
  return { role: 'num', text: String(o.num) };
}

/** 명령 하나를 세 주소 코드 글자로 찍는다. 장면과 그림이 같이 부른다. */
export function instrSegments(ins: Instr): Segment[] {
  const head: Segment[] = ins.label === null ? [] : [{ role: 'plain', text: `${ins.label}: ` }];
  switch (ins.k) {
    case 'bin':
      return [
        ...head,
        { role: 'dst', text: ins.dst },
        { role: 'plain', text: ' = ' },
        operandSegment('l', ins.l),
        { role: 'plain', text: ` ${ins.op} ` },
        operandSegment('r', ins.r),
      ];
    case 'copy':
      return [...head, { role: 'dst', text: ins.dst }, { role: 'plain', text: ' = ' }, operandSegment('src', ins.src)];
    case 'ifnot':
      return [
        ...head,
        { role: 'plain', text: 'ifnot ' },
        { role: 'read', slot: 'cond', text: ins.cond, name: ins.cond },
        { role: 'plain', text: ` goto ${ins.target}` },
      ];
    case 'goto':
      return [...head, { role: 'plain', text: `goto ${ins.target}` }];
    case 'return':
      return [...head, { role: 'plain', text: 'return ' }, operandSegment('value', ins.value)];
  }
}

/** 넣는 줄의 수 — 바탕에서 정해진다. */
export function defCount(code: readonly Instr[]): number {
  return code.filter((ins) => defOf(ins) !== null).length;
}

const SLOTS: readonly string[] = ['l', 'r', 'src', 'cond', 'value'];

function readUse(v: unknown): Use {
  if (typeof v !== 'object' || v === null) throw new Error('def: uses 의 칸 모양을 모른다');
  const line: unknown = (v as { line?: unknown }).line;
  const slot: unknown = (v as { slot?: unknown }).slot;
  if (typeof line !== 'number' || typeof slot !== 'string' || !SLOTS.includes(slot)) {
    throw new Error('def: uses 의 칸은 line 과 slot 을 가진다');
  }
  return { line, slot: slot as Slot };
}

function readOutside(payload: unknown): Use[] {
  if (typeof payload !== 'object' || payload === null) throw new Error('init: payload 가 없다');
  const outside: unknown = (payload as { outside?: unknown }).outside;
  if (!Array.isArray(outside)) throw new Error('init: outside 목록이 있어야 한다');
  return outside.map(readUse);
}

function readEnd(payload: unknown): { chains: number } | null {
  if (typeof payload !== 'object' || payload === null) throw new Error('def: payload 가 없다');
  const end: unknown = (payload as { end?: unknown }).end;
  if (end === null) return null;
  if (typeof end !== 'object' || end === undefined) throw new Error('def: end 는 { chains } 나 null 이다');
  const chains: unknown = (end as { chains?: unknown }).chains;
  if (typeof chains !== 'number') throw new Error('def: end.chains 는 수다');
  return { chains };
}

function readFlow(payload: unknown): Flow {
  if (typeof payload !== 'object' || payload === null) throw new Error('def: payload 가 없다');
  const line: unknown = (payload as { line?: unknown }).line;
  const name: unknown = (payload as { name?: unknown }).name;
  const uses: unknown = (payload as { uses?: unknown }).uses;
  const cut: unknown = (payload as { cut?: unknown }).cut;
  if (typeof line !== 'number' || typeof name !== 'string' || !Array.isArray(uses)) {
    throw new Error('def: line · name · uses 가 있어야 한다');
  }
  if (cut !== null && typeof cut !== 'number') throw new Error('def: cut 은 줄 번호나 null 이다');
  return { line, name, uses: uses.map(readUse), cut };
}

export const valueFlowsToUseScene: ScenePlan<ValueFlowsToUseScene> = {
  initial(initialData: unknown): ValueFlowsToUseScene {
    const raw: unknown =
      typeof initialData === 'object' && initialData !== null ? (initialData as { code?: unknown }).code : undefined;
    // readCode 가 새 객체를 만든다 — initialData 를 참조로 쥐지 않는다.
    return { code: readCode(raw), outside: null, flows: [], end: null, step: null };
  },
  reduce(scene: ValueFlowsToUseScene, event: FacetRuntimeEvent): ValueFlowsToUseScene {
    switch (event.type) {
      case 'init':
        return { ...scene, outside: readOutside(event.payload), step: null };
      case 'def': {
        const flow = readFlow(event.payload);
        return {
          ...scene,
          flows: [...scene.flows, flow],
          end: readEnd(event.payload),
          step: { kind: 'flow', at: scene.flows.length },
        };
      }
      default:
        throw new Error(`모르는 이벤트 ${event.type}`);
    }
  },
};
