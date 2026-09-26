/**
 * interference-graph 의 장면 — 이벤트를 잇기만 한다. 셈은 알고리즘이 한다.
 *
 * 바탕: 명령 열 · 값 목록 (initialData 에서 곧바로 — 걸음 0 이 이미 전체 프로그램이다)
 * 자취: 훑는 자리 · 산 값 · 그은 선 · 칠한 값
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { narrowProgram, valueOrder, type Ins } from './algorithm.js';

export type Edge = readonly [string, string];
export type Painted = { value: string; reg: number };

export type InterferenceStep =
  | { kind: 'start' }
  | {
      kind: 'scan';
      line: number;
      def: string | null;
      after: string[];
      entered: string[];
      added: Edge[];
    }
  | { kind: 'color'; value: string; reg: number; neighbors: Painted[] };

export type InterferenceScene = {
  program: Ins[];
  values: string[];
  /** 훑는 자리 — 줄 사이 틈의 번호. n 이면 맨 끝(Ln 뒤), 0 이면 맨 앞(L1 앞) */
  gap: number;
  /** 그 틈에서 산 값 (정의 차례) */
  live: string[];
  edges: Edge[];
  /** 칠한 차례대로 */
  painted: Painted[];
  step: InterferenceStep;
};

function strList(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || v.some((s) => typeof s !== 'string')) throw new Error(`${what} 가 이름 목록이 아니다`);
  return [...(v as string[])];
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${what} 가 수가 아니다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`${what} 가 이름이 아니다`);
  return v;
}

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) throw new Error('payload 가 객체가 아니다');
  return (payload as Record<string, unknown>)[key];
}

function edgeList(v: unknown): Edge[] {
  if (!Array.isArray(v)) throw new Error('added 가 목록이 아니다');
  return v.map((e) => {
    const pair = strList(e, 'added 의 선');
    const [a, b] = pair;
    if (pair.length !== 2 || a === undefined || b === undefined) throw new Error('선은 값 둘이어야 한다');
    return [a, b] as const;
  });
}

function paintedList(v: unknown): Painted[] {
  if (!Array.isArray(v)) throw new Error('neighbors 가 목록이 아니다');
  return v.map((p) => ({ value: str(field(p, 'value'), 'neighbors.value'), reg: num(field(p, 'reg'), 'neighbors.reg') }));
}

export const interferenceGraphScene: ScenePlan<InterferenceScene> = {
  initial(initialData: unknown): InterferenceScene {
    if (typeof initialData !== 'object' || initialData === null) throw new Error('initialData 가 없다');
    const program = narrowProgram((initialData as Record<string, unknown>)['program']);
    return {
      program,
      values: valueOrder(program),
      gap: program.length,
      live: [],
      edges: [],
      painted: [],
      step: { kind: 'start' },
    };
  },

  reduce(scene: InterferenceScene, event: FacetRuntimeEvent): InterferenceScene {
    const p = event.payload;
    switch (event.type) {
      case 'scan': {
        const line = num(field(p, 'line'), 'line');
        const defRaw = field(p, 'def');
        const def = defRaw === null ? null : str(defRaw, 'def');
        const added = edgeList(field(p, 'added'));
        return {
          ...scene,
          gap: line - 1,
          live: strList(field(p, 'before'), 'before'),
          edges: [...scene.edges, ...added],
          step: {
            kind: 'scan',
            line,
            def,
            after: strList(field(p, 'after'), 'after'),
            entered: strList(field(p, 'entered'), 'entered'),
            added,
          },
        };
      }
      case 'color': {
        const value = str(field(p, 'value'), 'value');
        const reg = num(field(p, 'reg'), 'reg');
        return {
          ...scene,
          painted: [...scene.painted, { value, reg }],
          step: { kind: 'color', value, reg, neighbors: paintedList(field(p, 'neighbors')) },
        };
      }
      default:
        throw new Error(`모르는 이벤트 ${event.type}`);
    }
  },
};
