import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { inputWithEof, readShiftOrReduceData, type Rule, type Tok } from './algorithm.js';

/** 스택 한 칸 — 기호 하나. 밀린 단말은 원문을 함께 쥔다 (접혀 생긴 비단말은 null). */
export type StackCell = { sym: string; text: string | null };

export type SorStep =
  | { kind: 'start' }
  | { kind: 'shift'; sym: string; la: string; matches: string[] }
  | { kind: 'reduce'; rule: string; lhs: string; la: string; popped: StackCell[] }
  | { kind: 'accept'; la: string; start: string };

export type ShiftOrReduceScene = {
  /** 바탕 — 문법 규칙 */
  rules: Rule[];
  /** 자취 — 남은 입력(EOF 포함)과 스택(아래 → 꼭대기) */
  input: Tok[];
  stack: StackCell[];
  accepted: boolean;
  /** 이번 걸음 */
  step: SorStep;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function str(p: Record<string, unknown>, key: string, type: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`shift-or-reduce 장면: ${type}.${key} 가 글자가 아니다`);
  return v;
}

function payloadOf(event: FacetRuntimeEvent): Record<string, unknown> {
  if (!isRecord(event.payload)) throw new Error(`shift-or-reduce 장면: ${event.type} 의 payload 가 없다`);
  return event.payload;
}

export const shiftOrReduceScene: ScenePlan<ShiftOrReduceScene> = {
  initial(initialData: unknown): ShiftOrReduceScene {
    const data = readShiftOrReduceData(initialData);
    return {
      rules: data.rules.map((r) => ({ id: r.id, lhs: r.lhs, rhs: [...r.rhs] })),
      input: inputWithEof(data.tokens),
      stack: [],
      accepted: false,
      step: { kind: 'start' },
    };
  },

  reduce(scene: ShiftOrReduceScene, event: FacetRuntimeEvent): ShiftOrReduceScene {
    if (event.type === 'shift') {
      const p = payloadOf(event);
      const sym = str(p, 'sym', 'shift');
      const text = str(p, 'text', 'shift');
      const la = str(p, 'la', 'shift');
      const raw = p.matches;
      if (!Array.isArray(raw)) throw new Error('shift-or-reduce 장면: shift.matches 가 배열이 아니다');
      const matches = raw.map((m) => {
        if (typeof m !== 'string') throw new Error('shift-or-reduce 장면: shift.matches 에 글자가 아닌 것');
        return m;
      });
      const head = scene.input[0];
      if (!head) throw new Error('shift-or-reduce 장면: 밀 입력이 없다');
      if (head.text !== text) throw new Error(`shift-or-reduce 장면: 밀린 원문(${text})이 입력 머리(${head.text})와 다르다`);
      return {
        rules: scene.rules,
        input: scene.input.slice(1),
        stack: [...scene.stack, { sym, text: text === sym ? null : text }],
        accepted: false,
        step: { kind: 'shift', sym, la, matches },
      };
    }
    if (event.type === 'reduce') {
      const p = payloadOf(event);
      const rule = str(p, 'rule', 'reduce');
      const lhs = str(p, 'lhs', 'reduce');
      const la = str(p, 'la', 'reduce');
      const size = p.size;
      if (typeof size !== 'number' || !Number.isInteger(size) || size < 0) {
        throw new Error('shift-or-reduce 장면: reduce.size 가 옳은 수가 아니다');
      }
      if (size > scene.stack.length) throw new Error(`shift-or-reduce 장면: ${rule} 를 접을 칸이 모자란다`);
      const keep = scene.stack.length - size;
      return {
        rules: scene.rules,
        input: scene.input,
        stack: [...scene.stack.slice(0, keep), { sym: lhs, text: null }],
        accepted: false,
        step: { kind: 'reduce', rule, lhs, la, popped: scene.stack.slice(keep).map((c) => ({ ...c })) },
      };
    }
    if (event.type === 'accept') {
      const p = payloadOf(event);
      return {
        rules: scene.rules,
        input: scene.input,
        stack: scene.stack,
        accepted: true,
        step: { kind: 'accept', la: str(p, 'la', 'accept'), start: str(p, 'start', 'accept') },
      };
    }
    throw new Error(`shift-or-reduce 장면: 모르는 이벤트 ${event.type}`);
  },
};
