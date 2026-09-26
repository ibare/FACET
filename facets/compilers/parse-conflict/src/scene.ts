/**
 * parse-conflict 장면.
 *
 * 바탕 — 규칙 · 원문 · 토큰 열(EOF 포함). initialData 에서 곧바로 채운다.
 * 자취 — 스택 · 읽은 자리 · 충돌 칸 · 갈래들.
 * 이번 걸음 — step (움직임을 고르는 계기값을 싣는다).
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowParseConflictData,
  withEof,
  type BranchAct,
  type ConflictAction,
  type Item,
  type Rule,
  type StackCell,
  type Token,
  type TreeNode,
} from './algorithm.js';

export type Branch = {
  choice: number;
  actions: BranchAct[];
  tree: TreeNode;
  group: string;
  value: number;
};

export type ParseConflictStep =
  | { kind: 'start' }
  | { kind: 'shift'; token: number }
  | { kind: 'reduce'; rule: string; before: StackCell[] }
  | { kind: 'conflict' }
  | { kind: 'branch'; choice: number };

export type ParseConflictScene = {
  rules: Rule[];
  source: string;
  tokens: Token[];
  stack: StackCell[];
  pos: number;
  conflict: ConflictAction[] | null;
  branches: Branch[];
  step: ParseConflictStep;
};

// ---------------------------------------------------------------- payload 좁히기

function obj(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new Error(`parse-conflict 장면: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}
function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`parse-conflict 장면: ${what} 가 글자가 아니다`);
  return v;
}
function int(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`parse-conflict 장면: ${what} 가 정수가 아니다`);
  return v;
}
function arr(v: unknown, what: string): unknown[] {
  if (!Array.isArray(v)) throw new Error(`parse-conflict 장면: ${what} 가 배열이 아니다`);
  return v;
}
function strOrNull(v: unknown, what: string): string | null {
  return v === null ? null : str(v, what);
}

function readStack(v: unknown): StackCell[] {
  return arr(v, 'stack').map((c, i) => {
    const o = obj(c, `stack[${i}]`);
    return { sym: str(o.sym, 'stack.sym'), text: strOrNull(o.text, 'stack.text') };
  });
}

function readItems(v: unknown): Item[] {
  return arr(v, 'items').map((c) => {
    const o = obj(c, 'item');
    return { rule: str(o.rule, 'item.rule'), dot: int(o.dot, 'item.dot') };
  });
}

function readConflict(v: unknown): ConflictAction[] {
  const list = arr(v, 'actions').map((c): ConflictAction => {
    const o = obj(c, 'action');
    if (o.kind === 'reduce') return { kind: 'reduce', rule: str(o.rule, 'action.rule'), items: readItems(o.items) };
    if (o.kind === 'shift') return { kind: 'shift', items: readItems(o.items) };
    throw new Error(`parse-conflict 장면: 모르는 충돌 동작 ${String(o.kind)}`);
  });
  if (list.length !== 2) throw new Error(`parse-conflict 장면: 충돌 칸의 동작이 둘이 아니다 (${list.length})`);
  return list;
}

function readActs(v: unknown): BranchAct[] {
  return arr(v, 'branch.actions').map((c): BranchAct => {
    const o = obj(c, 'branch action');
    if (o.kind === 'shift') return { kind: 'shift', token: int(o.token, 'branch.token') };
    if (o.kind === 'reduce') return { kind: 'reduce', rule: str(o.rule, 'branch.rule') };
    if (o.kind === 'accept') return { kind: 'accept' };
    throw new Error(`parse-conflict 장면: 모르는 갈래 동작 ${String(o.kind)}`);
  });
}

function readTree(v: unknown): TreeNode {
  const o = obj(v, 'tree');
  const value = o.value === null ? null : int(o.value, 'tree.value');
  return {
    sym: str(o.sym, 'tree.sym'),
    text: strOrNull(o.text, 'tree.text'),
    value,
    kids: arr(o.kids, 'tree.kids').map(readTree),
  };
}

// ---------------------------------------------------------------- 장면

export const parseConflictScene: ScenePlan<ParseConflictScene> = {
  initial(initialData: unknown): ParseConflictScene {
    const data = narrowParseConflictData(initialData);
    return {
      rules: data.rules.map((r) => ({ id: r.id, lhs: r.lhs, rhs: [...r.rhs] })),
      source: data.source,
      tokens: withEof(data.tokens),
      stack: [],
      pos: 0,
      conflict: null,
      branches: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: ParseConflictScene, event: FacetRuntimeEvent): ParseConflictScene {
    const p = obj(event.payload, `${event.type} payload`);
    switch (event.type) {
      case 'shift': {
        const token = int(p.token, 'shift.token');
        if (token !== scene.pos) throw new Error(`parse-conflict 장면: 민 토큰 자리 ${token} 가 읽을 자리 ${scene.pos} 와 다르다`);
        return { ...scene, stack: readStack(p.stack), pos: token + 1, step: { kind: 'shift', token } };
      }
      case 'reduce': {
        const rule = str(p.rule, 'reduce.rule');
        return {
          ...scene,
          stack: readStack(p.stack),
          step: { kind: 'reduce', rule, before: scene.stack.map((c) => ({ ...c })) },
        };
      }
      case 'conflict':
        return { ...scene, conflict: readConflict(p.actions), step: { kind: 'conflict' } };
      case 'branch': {
        if (!scene.conflict) throw new Error('parse-conflict 장면: 충돌 앞의 갈래');
        const choice = int(p.choice, 'branch.choice');
        if (choice !== scene.branches.length) throw new Error(`parse-conflict 장면: 갈래 차례가 틀렸다 (${choice})`);
        const value = int(p.value, 'branch.value');
        const branch: Branch = {
          choice,
          actions: readActs(p.actions),
          tree: readTree(p.tree),
          group: str(p.group, 'branch.group'),
          value,
        };
        return { ...scene, branches: [...scene.branches, branch], step: { kind: 'branch', choice } };
      }
      default:
        throw new Error(`parse-conflict 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
