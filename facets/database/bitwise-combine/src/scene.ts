/**
 * bitwise-combine 장면 — 이벤트를 잇기만 한다. AND 와 줄 고르기는 알고리즘이 셈한다.
 *
 * 바탕: 표 이름 · 열 · 질의 · 조건 (initialData 에서) + 비트 줄 · 줄 수 (init 에서)
 * 자취: 포갠 결과 · 읽은 줄 · 끝 셈
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type BitwiseCombineReadRow = { index: number; values: string[] };

export type BitwiseCombineStep =
  | { kind: 'start' }
  | { kind: 'combine' }
  | { kind: 'read' }
  | { kind: 'done' };

export type BitwiseCombineSceneState = {
  table: string;
  columns: string[];
  query: string;
  conditions: { column: string; value: string }[];
  /** 조건마다의 비트 줄. init 전에는 빈 배열 */
  bits: string[];
  /** 표의 줄 수. init 전에는 0 */
  total: number;
  /** 포갠 결과. 포개기 전에는 null */
  result: string | null;
  ones: number;
  /** 읽은 줄 */
  read: BitwiseCombineReadRow[];
  /** 끝 셈. 끝나기 전에는 null */
  tally: { read: number; total: number; skipped: number } | null;
  step: BitwiseCombineStep;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function strings(x: unknown): string[] | null {
  if (!Array.isArray(x)) return null;
  const out: string[] = [];
  for (const v of x) {
    if (typeof v !== 'string') return null;
    out.push(v);
  }
  return out;
}

function num(x: unknown): number | null {
  return typeof x === 'number' && Number.isFinite(x) ? x : null;
}

function readConditions(x: unknown): { column: string; value: string }[] {
  if (!Array.isArray(x)) return [];
  const out: { column: string; value: string }[] = [];
  for (const c of x) {
    if (!isRecord(c) || typeof c.column !== 'string' || typeof c.value !== 'string') {
      throw new Error('bitwise-combine 장면: 조건 모양이 틀렸다');
    }
    out.push({ column: c.column, value: c.value });
  }
  return out;
}

function readRows(x: unknown): BitwiseCombineReadRow[] {
  if (!Array.isArray(x)) throw new Error('bitwise-combine 장면: read.rows 가 배열이 아니다');
  const out: BitwiseCombineReadRow[] = [];
  for (const r of x) {
    if (!isRecord(r)) throw new Error('bitwise-combine 장면: 읽은 줄 모양이 틀렸다');
    const index = num(r.index);
    const values = strings(r.values);
    if (index === null || values === null) throw new Error('bitwise-combine 장면: 읽은 줄 모양이 틀렸다');
    out.push({ index, values });
  }
  return out;
}

export const bitwiseCombineScene: ScenePlan<BitwiseCombineSceneState> = {
  initial(initialData: unknown): BitwiseCombineSceneState {
    const d = isRecord(initialData) ? initialData : {};
    return {
      table: typeof d.table === 'string' ? d.table : '',
      columns: strings(d.columns) ?? [],
      query: typeof d.query === 'string' ? d.query : '',
      conditions: readConditions(d.conditions),
      bits: [],
      total: 0,
      result: null,
      ones: 0,
      read: [],
      tally: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene: BitwiseCombineSceneState, event: FacetRuntimeEvent): BitwiseCombineSceneState {
    const p = isRecord(event.payload) ? event.payload : {};
    switch (event.type) {
      case 'init': {
        const bits = strings(p.bits);
        const total = num(p.total);
        if (bits === null || total === null) throw new Error('bitwise-combine 장면: init 모양이 틀렸다');
        return { ...scene, bits, total, step: { kind: 'start' } };
      }
      case 'combine': {
        const ones = num(p.ones);
        if (typeof p.result !== 'string' || ones === null) {
          throw new Error('bitwise-combine 장면: combine 모양이 틀렸다');
        }
        return { ...scene, result: p.result, ones, step: { kind: 'combine' } };
      }
      case 'read':
        return { ...scene, read: readRows(p.rows), step: { kind: 'read' } };
      case 'done': {
        const read = num(p.read);
        const total = num(p.total);
        const skipped = num(p.skipped);
        if (read === null || total === null || skipped === null) {
          throw new Error('bitwise-combine 장면: done 모양이 틀렸다');
        }
        return { ...scene, tally: { read, total, skipped }, step: { kind: 'done' } };
      }
      default:
        return scene;
    }
  },
};
