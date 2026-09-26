import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/**
 * type-mismatch 의 장면.
 *
 * 바탕 — 프로그램 줄(글자 · 들여쓰기). `initial()` 이 initialData 에서 베낀다.
 * 자취 — 검사한 줄의 결과(`checks`). 줄마다 노드의 타입 · 걸린 자리 · 자리 맞춤.
 * 이번 걸음 — `step`. 시작 · 줄 하나 · 판정.
 */

export type TmType = 'int' | 'float' | 'bool' | 'string';

export type TmNode = {
  from: number;
  to: number;
  op: string | null;
  symFrom: number | null;
  l: number | null;
  r: number | null;
  parent: number | null;
  type: TmType | null;
  state: 'typed' | 'snag' | 'untried';
};

export type TmSlot =
  | { kind: 'let'; name: string; declared: TmType; from: number; to: number }
  | { kind: 'show'; from: number; to: number };

export type TmOutcome = 'fit' | 'widen' | 'slot-miss' | 'snag';

export type TmCheck = {
  line: number;
  nodes: TmNode[];
  root: number;
  slot: TmSlot;
  outcome: TmOutcome;
  got: TmType | null;
};

export type TmLine = { indent: number; text: string };

export type TmStep =
  | { kind: 'start' }
  | { kind: 'line'; line: number }
  | { kind: 'verdict'; snags: number; rejected: boolean };

export type TypeMismatchScene = {
  lines: TmLine[];
  checks: TmCheck[];
  ran: number;
  step: TmStep;
};

const TYPES: readonly string[] = ['int', 'float', 'bool', 'string'];

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`type-mismatch 장면: ${what} 이 객체가 아니다`);
  return v as Record<string, unknown>;
}
function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`type-mismatch 장면: ${what} 이 수가 아니다`);
  return v;
}
function numOrNull(v: unknown, what: string): number | null {
  return v === null ? null : num(v, what);
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`type-mismatch 장면: ${what} 이 글자가 아니다`);
  return v;
}
function ty(v: unknown, what: string): TmType {
  const s = str(v, what);
  if (!TYPES.includes(s)) throw new Error(`type-mismatch 장면: ${what} 의 타입 ${s} 을 모른다`);
  return s as TmType;
}
function tyOrNull(v: unknown, what: string): TmType | null {
  return v === null ? null : ty(v, what);
}

function readNode(v: unknown, i: number): TmNode {
  const o = rec(v, `노드 ${i}`);
  const state = str(o.state, `노드 ${i} 의 state`);
  if (state !== 'typed' && state !== 'snag' && state !== 'untried') throw new Error(`type-mismatch 장면: 노드 ${i} 의 state ${state}`);
  return {
    from: num(o.from, 'from'),
    to: num(o.to, 'to'),
    op: o.op === null ? null : str(o.op, 'op'),
    symFrom: numOrNull(o.symFrom, 'symFrom'),
    l: numOrNull(o.l, 'l'),
    r: numOrNull(o.r, 'r'),
    parent: numOrNull(o.parent, 'parent'),
    type: tyOrNull(o.type, `노드 ${i} 의 type`),
    state,
  };
}

function readSlot(v: unknown): TmSlot {
  const o = rec(v, 'slot');
  const kind = str(o.kind, 'slot.kind');
  if (kind === 'let') {
    return { kind, name: str(o.name, 'slot.name'), declared: ty(o.declared, 'slot.declared'), from: num(o.from, 'slot.from'), to: num(o.to, 'slot.to') };
  }
  if (kind === 'show') return { kind, from: num(o.from, 'slot.from'), to: num(o.to, 'slot.to') };
  throw new Error(`type-mismatch 장면: 모르는 자리 ${kind}`);
}

function readCheck(v: unknown): TmCheck {
  const o = rec(v, 'line-checked payload');
  if (!Array.isArray(o.nodes)) throw new Error('type-mismatch 장면: nodes 가 배열이 아니다');
  const outcome = str(o.outcome, 'outcome');
  if (outcome !== 'fit' && outcome !== 'widen' && outcome !== 'slot-miss' && outcome !== 'snag') {
    throw new Error(`type-mismatch 장면: 모르는 결과 ${outcome}`);
  }
  return {
    line: num(o.line, 'line'),
    nodes: o.nodes.map(readNode),
    root: num(o.root, 'root'),
    slot: readSlot(o.slot),
    outcome,
    got: tyOrNull(o.got, 'got'),
  };
}

export const typeMismatchScene: ScenePlan<TypeMismatchScene> = {
  initial(initialData: unknown): TypeMismatchScene {
    const lines: TmLine[] = [];
    if (typeof initialData === 'object' && initialData !== null) {
      const raw = (initialData as { lines?: unknown }).lines;
      if (Array.isArray(raw)) {
        raw.forEach((l, i) => {
          const o = rec(l, `줄 ${i + 1}`);
          lines.push({ indent: num(o.indent, `줄 ${i + 1} 의 indent`), text: str(o.text, `줄 ${i + 1} 의 text`) });
        });
      }
    }
    return { lines, checks: [], ran: 0, step: { kind: 'start' } };
  },

  reduce(scene: TypeMismatchScene, event: FacetRuntimeEvent): TypeMismatchScene {
    if (event.type === 'line-checked') {
      const check = readCheck(event.payload);
      return { ...scene, checks: [...scene.checks, check], step: { kind: 'line', line: check.line } };
    }
    if (event.type === 'verdict') {
      const o = rec(event.payload, 'verdict payload');
      const rejected = o.rejected;
      if (typeof rejected !== 'boolean') throw new Error('type-mismatch 장면: rejected 가 참거짓이 아니다');
      return { ...scene, ran: num(o.ran, 'ran'), step: { kind: 'verdict', snags: num(o.snags, 'snags'), rejected } };
    }
    throw new Error(`type-mismatch 장면: 모르는 이벤트 ${event.type}`);
  },
};
