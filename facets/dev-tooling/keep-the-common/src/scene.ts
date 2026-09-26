/**
 * keep-the-common 장면.
 *
 * 바탕 — 두 파일의 줄과 diff 표식 (initialData 에서 베낀다).
 * 자취 — 이어진 짝, 지움으로 떨어진 A 줄, 넣음으로 떨어진 B 줄, 지금 고칠 것의 수.
 * 이번 걸음 — `step`. 짝 걸음은 앞의 수(`from`)를 실어 세는 판이 그 수에서 깎여 내려가게 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { editCount } from './algorithm.js';

export type KeepPair = { a: number; b: number };

export type KeepStep =
  | { kind: 'start' }
  | { kind: 'pair'; a: number; b: number; from: number; to: number }
  | { kind: 'delete'; rows: number[] }
  | { kind: 'insert'; rows: number[]; del: number; total: number };

export type KeepTheCommonScene = {
  a: string[];
  b: string[];
  marks: { del: string; ins: string };
  pairs: KeepPair[];
  deleted: number[];
  inserted: number[];
  /** 지금 고칠 것의 수 */
  edits: number;
  step: KeepStep;
};

function fail(where: string): never {
  throw new Error(`keep-the-common scene: ${where}`);
}

function lines(v: unknown, where: string): string[] {
  if (!Array.isArray(v)) fail(`${where} 가 배열이 아니다`);
  return v.map((x, i) => (typeof x === 'string' ? x : fail(`${where}[${i}] 가 글자가 아니다`)));
}

function rowList(v: unknown, where: string): number[] {
  if (!Array.isArray(v)) fail(`${where} 가 배열이 아니다`);
  return v.map((x, i) => (typeof x === 'number' && Number.isInteger(x) ? x : fail(`${where}[${i}] 가 정수가 아니다`)));
}

function num(obj: Record<string, unknown>, key: string, where: string): number {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${where}.${key} 가 수가 아니다`);
  return v;
}

function record(v: unknown, where: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) fail(`${where} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

export const keepTheCommonScene: ScenePlan<KeepTheCommonScene> = {
  initial(initialData: unknown): KeepTheCommonScene {
    const d = record(initialData, 'initialData');
    const a = lines(d.a, 'initialData.a');
    const b = lines(d.b, 'initialData.b');
    const m = record(d.marks, 'initialData.marks');
    if (typeof m.del !== 'string') fail('initialData.marks.del 가 글자가 아니다');
    if (typeof m.ins !== 'string') fail('initialData.marks.ins 가 글자가 아니다');
    return {
      a,
      b,
      marks: { del: m.del, ins: m.ins },
      pairs: [],
      deleted: [],
      inserted: [],
      edits: editCount(a.length, b.length, 0),
      step: { kind: 'start' },
    };
  },

  reduce(scene: KeepTheCommonScene, event: FacetRuntimeEvent): KeepTheCommonScene {
    const p = record(event.payload, `${event.type}.payload`);
    if (event.type === 'pair') {
      const a = num(p, 'a', 'pair.payload');
      const b = num(p, 'b', 'pair.payload');
      const from = num(p, 'from', 'pair.payload');
      const to = num(p, 'to', 'pair.payload');
      return {
        ...scene,
        pairs: [...scene.pairs, { a, b }],
        edits: to,
        step: { kind: 'pair', a, b, from, to },
      };
    }
    if (event.type === 'delete') {
      const rows = rowList(p.rows, 'delete.payload.rows');
      return { ...scene, deleted: [...rows], step: { kind: 'delete', rows: [...rows] } };
    }
    if (event.type === 'insert') {
      const rows = rowList(p.rows, 'insert.payload.rows');
      const del = num(p, 'del', 'insert.payload');
      const total = num(p, 'total', 'insert.payload');
      return {
        ...scene,
        inserted: [...rows],
        edits: total,
        step: { kind: 'insert', rows: [...rows], del, total },
      };
    }
    return fail(`모르는 이벤트 ${event.type}`);
  },
};
