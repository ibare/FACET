/**
 * shrink-to-smallest 의 장면.
 *
 * 바탕: property · start (처음 입력)
 * 자취: input (지금 입력) · tried (돌려 본 입력과 깨졌는지, 처음 입력부터 차례로)
 * 이번 걸음: step — 돌린 후보 하나(try) 또는 멈춤(done)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type TriedEntry = { list: number[]; broke: boolean };

export type ShrinkStep =
  | {
      kind: 'try';
      round: number;
      op: 'delete' | 'value';
      index: number;
      from: number;
      to: number;
      /** 이 후보를 만든 입력 — 운동의 출발 */
      before: number[];
      candidate: number[];
      broke: boolean;
      skipped: number[][];
    }
  | { kind: 'done'; skipped: number[][]; run: number; kept: number; dropped: number };

export type ShrinkScene = {
  property: string;
  start: number[];
  input: number[];
  tried: TriedEntry[];
  step: ShrinkStep | null;
};

function numList(v: unknown, what: string): number[] {
  if (!Array.isArray(v)) throw new Error(`shrink-to-smallest 장면: ${what} 가 목록이 아니다`);
  return v.map((x, i) => {
    if (typeof x !== 'number') throw new Error(`shrink-to-smallest 장면: ${what} 의 ${i}번 칸이 수가 아니다`);
    return x;
  });
}

function numLists(v: unknown, what: string): number[][] {
  if (!Array.isArray(v)) throw new Error(`shrink-to-smallest 장면: ${what} 가 목록이 아니다`);
  return v.map((x, i) => numList(x, `${what}[${i}]`));
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number') throw new Error(`shrink-to-smallest 장면: ${what} 가 수가 아니다`);
  return v;
}

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) throw new Error('shrink-to-smallest 장면: payload 가 없다');
  return (payload as Record<string, unknown>)[key];
}

export const shrinkToSmallestScene: ScenePlan<ShrinkScene> = {
  initial(initialData: unknown): ShrinkScene {
    const property = field(initialData, 'property');
    if (typeof property !== 'string') throw new Error('shrink-to-smallest 장면: property 가 없다');
    const start = numList(field(initialData, 'input'), 'input');
    return {
      property,
      start: [...start],
      input: [...start],
      tried: [{ list: [...start], broke: true }],
      step: null,
    };
  },

  reduce(scene: ShrinkScene, event: FacetRuntimeEvent): ShrinkScene {
    const p = event.payload;
    if (event.type === 'try') {
      const op = field(p, 'op');
      if (op !== 'delete' && op !== 'value') throw new Error(`shrink-to-smallest 장면: 모르는 op (${String(op)})`);
      const broke = field(p, 'broke');
      if (typeof broke !== 'boolean') throw new Error('shrink-to-smallest 장면: broke 가 참거짓이 아니다');
      const candidate = numList(field(p, 'candidate'), 'candidate');
      const step: ShrinkStep = {
        kind: 'try',
        round: num(field(p, 'round'), 'round'),
        op,
        index: num(field(p, 'index'), 'index'),
        from: num(field(p, 'from'), 'from'),
        to: num(field(p, 'to'), 'to'),
        before: numList(field(p, 'before'), 'before'),
        candidate,
        broke,
        skipped: numLists(field(p, 'skipped'), 'skipped'),
      };
      return {
        ...scene,
        input: broke ? [...candidate] : [...scene.input],
        tried: [...scene.tried, { list: [...candidate], broke }],
        step,
      };
    }
    if (event.type === 'done') {
      return {
        ...scene,
        input: numList(field(p, 'input'), 'input'),
        step: {
          kind: 'done',
          skipped: numLists(field(p, 'skipped'), 'skipped'),
          run: num(field(p, 'run'), 'run'),
          kept: num(field(p, 'kept'), 'kept'),
          dropped: num(field(p, 'dropped'), 'dropped'),
        },
      };
    }
    throw new Error(`shrink-to-smallest 장면: 모르는 이벤트 (${event.type})`);
  },
};
