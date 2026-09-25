/**
 * 상태 전이 장면 — `cross` 이벤트를 잇는다.
 *
 * 바탕: 상태 목록 · 시작 상태 · 옮김표 (initial 이 initialData 에서 베낀다)
 * 자취: 지금 상태 · 길마다 건넌 횟수 · 건넌 횟수 합
 * 이번 걸음: 방금 건넌 길의 번호 (없으면 걸음 0)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type StateEdge = { from: string; cause: string; to: string };

export type StateTransitionsScene = {
  states: string[];
  start: string;
  edges: StateEdge[];
  current: string;
  /** 옮김표 줄마다 건넌 횟수 */
  walked: number[];
  moves: number;
  step: { kind: 'cross'; edge: number } | null;
};

/** 한 상태에서 나가는 길(옮김표 줄 번호). 그림과 문안이 같은 셈을 쓴다. */
export function waysOut(edges: StateEdge[], state: string): number[] {
  const out: number[] = [];
  edges.forEach((e, i) => {
    if (e.from === state) out.push(i);
  });
  return out;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function readStrings(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`state-transitions 장면: ${what} 가 배열이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'string') throw new Error(`state-transitions 장면: ${what}[${i}] 가 글자가 아니다`);
    return x;
  });
}

function readEdges(v: unknown): StateEdge[] {
  if (!Array.isArray(v)) throw new Error('state-transitions 장면: table 이 배열이 아니다');
  return v.map((r, i) => {
    if (!isRecord(r)) throw new Error(`state-transitions 장면: table[${i}] 가 객체가 아니다`);
    const { from, cause, to } = r;
    if (typeof from !== 'string' || typeof cause !== 'string' || typeof to !== 'string') {
      throw new Error(`state-transitions 장면: table[${i}] 의 from · cause · to 가 글자가 아니다`);
    }
    return { from, cause, to };
  });
}

export const stateTransitionsScene: ScenePlan<StateTransitionsScene> = {
  initial(initialData: unknown): StateTransitionsScene {
    if (!isRecord(initialData)) throw new Error('state-transitions 장면: initialData 가 없다');
    const states = readStrings(initialData.states, 'states');
    const edges = readEdges(initialData.table);
    const start = initialData.start;
    if (typeof start !== 'string' || !states.includes(start)) {
      throw new Error('state-transitions 장면: start 가 상태 목록에 없다');
    }
    return {
      states,
      start,
      edges,
      current: start,
      walked: edges.map(() => 0),
      moves: 0,
      step: null,
    };
  },

  reduce(scene: StateTransitionsScene, event: FacetRuntimeEvent): StateTransitionsScene {
    if (event.type !== 'cross') return scene;
    const p = event.payload;
    if (!isRecord(p) || typeof p.edge !== 'number') {
      throw new Error('state-transitions 장면: cross 의 payload.edge 가 수가 아니다');
    }
    const edge = p.edge;
    const row = scene.edges[edge];
    if (row === undefined) throw new Error(`state-transitions 장면: 옮김표에 줄 ${edge} 가 없다`);
    if (row.from !== scene.current) {
      throw new Error(`state-transitions 장면: 지금 상태 ${scene.current} 에서 줄 ${edge} (${row.from} 에서 나감) 로 건널 수 없다`);
    }
    return {
      states: scene.states,
      start: scene.start,
      edges: scene.edges,
      current: row.to,
      walked: scene.walked.map((n, i) => (i === edge ? n + 1 : n)),
      moves: scene.moves + 1,
      step: { kind: 'cross', edge },
    };
  },
};
