/**
 * reference-cycle 장면 — 알고리즘이 보낸 바뀜(Change)을 잇기만 한다.
 *
 * 바탕: 줄 글자 · 이름 칸 목록 (init 이 한 번 정한다)
 * 자취: 이름 칸의 값 · 객체들(필드 · 가리킴 목록 · 치움 여부) · 지금 줄
 * 이번 걸음: step — 그림이 무엇을 흘릴지 고르는 데 쓴다. 바뀜 목록을 그대로 싣는다
 *
 * 수는 가리킴 목록의 길이다. 장면은 해석기를 다시 돌리지 않는다.
 */

import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { sameHolder } from './algorithm.js';
import type { RcChange, RcHolder, RcVal } from './algorithm.js';

export type RcSceneObj = {
  id: string;
  type: string;
  fields: { name: string; value: RcVal }[];
  holders: RcHolder[];
  gone: boolean;
};

export type RcStep =
  | { kind: 'none' }
  | { kind: 'start' }
  | { kind: 'line'; line: number; changes: RcChange[] }
  | { kind: 'reclaim'; obj: string; changes: RcChange[] };

export type ReferenceCycleScene = {
  lines: { indent: number; text: string }[];
  names: string[];
  /** 이름 칸의 값. null 은 아직 비어 있는 칸 (값 null 과 다르다) */
  cells: { name: string; value: RcVal | null }[];
  objs: RcSceneObj[];
  current: number | null;
  step: RcStep;
};

type Rec = Record<string, unknown>;

function isRec(u: unknown): u is Rec {
  return typeof u === 'object' && u !== null;
}

function str(u: unknown): string | null {
  return typeof u === 'string' ? u : null;
}

function parseVal(u: unknown): RcVal | null {
  if (!isRec(u)) return null;
  if (u.k === 'null') return { k: 'null' };
  if (u.k === 'num' && typeof u.n === 'number') return { k: 'num', n: u.n };
  const obj = str(u.obj);
  if (u.k === 'ref' && obj !== null) return { k: 'ref', obj };
  return null;
}

function parseHolder(u: unknown): RcHolder | null {
  if (!isRec(u)) return null;
  const name = str(u.name);
  if (u.kind === 'name' && name !== null) return { kind: 'name', name };
  const obj = str(u.obj);
  const field = str(u.field);
  if (u.kind === 'field' && obj !== null && field !== null) return { kind: 'field', obj, field };
  return null;
}

function parseChange(u: unknown): RcChange | null {
  if (!isRec(u)) return null;
  const obj = str(u.obj);
  if (u.op === 'create' && obj !== null) {
    const type = str(u.type);
    const fields = Array.isArray(u.fields) ? u.fields.filter((f): f is string => typeof f === 'string') : null;
    return type !== null && fields ? { op: 'create', obj, type, fields } : null;
  }
  if (u.op === 'cell') {
    const name = str(u.name);
    const value = parseVal(u.value);
    return name !== null && value ? { op: 'cell', name, value } : null;
  }
  if (u.op === 'field' && obj !== null) {
    const field = str(u.field);
    const value = parseVal(u.value);
    return field !== null && value ? { op: 'field', obj, field, value } : null;
  }
  if ((u.op === 'hold' || u.op === 'release') && obj !== null) {
    const by = parseHolder(u.by);
    if (!by) return null;
    if (u.op === 'hold') return { op: 'hold', obj, by };
    return typeof u.at === 'number' ? { op: 'release', obj, by, at: u.at } : null;
  }
  if (u.op === 'gone' && obj !== null) return { op: 'gone', obj };
  return null;
}

function parseChanges(u: unknown): RcChange[] {
  if (!Array.isArray(u)) return [];
  const out: RcChange[] = [];
  for (const c of u) {
    const p = parseChange(c);
    if (p) out.push(p);
  }
  return out;
}

/** 바뀜 목록을 얹은 새 자취. 앞 장면의 배열 · 객체는 건드리지 않는다. */
function apply(scene: ReferenceCycleScene, changes: RcChange[]): Pick<ReferenceCycleScene, 'cells' | 'objs'> {
  let cells = scene.cells;
  let objs = scene.objs;
  const editObj = (id: string, f: (o: RcSceneObj) => RcSceneObj): void => {
    objs = objs.map((o) => (o.id === id ? f(o) : o));
  };
  for (const c of changes) {
    if (c.op === 'create') {
      objs = [
        ...objs,
        { id: c.obj, type: c.type, fields: c.fields.map((name) => ({ name, value: { k: 'null' } })), holders: [], gone: false },
      ];
    } else if (c.op === 'cell') {
      cells = cells.map((cell) => (cell.name === c.name ? { name: cell.name, value: c.value } : cell));
    } else if (c.op === 'field') {
      editObj(c.obj, (o) => ({
        ...o,
        fields: o.fields.map((f) => (f.name === c.field ? { name: f.name, value: c.value } : f)),
      }));
    } else if (c.op === 'hold') {
      editObj(c.obj, (o) => ({ ...o, holders: [...o.holders, c.by] }));
    } else if (c.op === 'release') {
      editObj(c.obj, (o) => {
        const at = o.holders.findIndex((h) => sameHolder(h, c.by));
        return at < 0 ? o : { ...o, holders: o.holders.filter((_, i) => i !== at) };
      });
    } else {
      editObj(c.obj, (o) => ({ ...o, gone: true }));
    }
  }
  return { cells, objs };
}

export const referenceCycleScene: ScenePlan<ReferenceCycleScene> = {
  initial() {
    return { lines: [], names: [], cells: [], objs: [], current: null, step: { kind: 'none' } };
  },
  reduce(scene, event: FacetRuntimeEvent) {
    const p = event.payload;
    if (event.type === 'init' && isRec(p)) {
      const lines = Array.isArray(p.lines)
        ? p.lines.flatMap((l) => {
            if (!isRec(l) || typeof l.indent !== 'number' || typeof l.text !== 'string') return [];
            return [{ indent: l.indent, text: l.text }];
          })
        : [];
      const names = Array.isArray(p.names) ? p.names.filter((n): n is string => typeof n === 'string') : [];
      return {
        lines,
        names,
        cells: names.map((name) => ({ name, value: null })),
        objs: [],
        current: null,
        step: { kind: 'start' },
      };
    }
    if (event.type === 'line' && isRec(p) && typeof p.line === 'number') {
      const changes = parseChanges(p.changes);
      return { ...scene, ...apply(scene, changes), current: p.line, step: { kind: 'line', line: p.line, changes } };
    }
    if (event.type === 'reclaim' && isRec(p) && typeof p.obj === 'string') {
      const changes = parseChanges(p.changes);
      return { ...scene, ...apply(scene, changes), step: { kind: 'reclaim', obj: p.obj, changes } };
    }
    return scene;
  },
};
