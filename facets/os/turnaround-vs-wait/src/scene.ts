/**
 * turnaround-vs-wait 장면.
 *
 * 바탕: 프로세스 목록(도착 · 길이) · 시계 축의 길이(span, init 이 정한다)
 * 자취: 돈 결과(runs) · 갈라진 프로세스(splits) · 견준 짝(pair)
 * 이번 걸음: step
 *
 * 누가 언제 오르는지는 알고리즘이 돌린다. 장면은 이벤트를 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readProcesses } from './algorithm';

export type SceneProcess = { id: string; arrival: number; burst: number };
export type SceneRun = { id: string; start: number; end: number };
export type SceneSplit = { id: string; turnaround: number; wait: number };

export type TurnaroundVsWaitStep =
  | { kind: 'arrive' }
  | { kind: 'schedule' }
  | { kind: 'split'; id: string }
  | { kind: 'compare'; x: string; y: string };

export type TurnaroundVsWaitScene = {
  procs: SceneProcess[];
  span: number | null;
  runs: SceneRun[];
  splits: SceneSplit[];
  pair: { x: string; y: string } | null;
  step: TurnaroundVsWaitStep;
};

function field(payload: unknown, key: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('turnaround-vs-wait 장면: payload 가 객체가 아니다');
  }
  return (payload as Record<string, unknown>)[key];
}

function num(payload: unknown, key: string): number {
  const v = field(payload, key);
  if (typeof v !== 'number' || !Number.isInteger(v)) {
    throw new Error(`turnaround-vs-wait 장면: ${key} 가 정수가 아니다`);
  }
  return v;
}

function str(payload: unknown, key: string): string {
  const v = field(payload, key);
  if (typeof v !== 'string' || v === '') {
    throw new Error(`turnaround-vs-wait 장면: ${key} 가 문자열이 아니다`);
  }
  return v;
}

function knownId(scene: TurnaroundVsWaitScene, id: string): string {
  if (!scene.procs.some((p) => p.id === id)) {
    throw new Error(`turnaround-vs-wait 장면: 모르는 식별자 ${id}`);
  }
  return id;
}

export const turnaroundVsWaitScene: ScenePlan<TurnaroundVsWaitScene> = {
  initial(initialData: unknown): TurnaroundVsWaitScene {
    const procs = readProcesses(initialData).map((p) => ({
      id: p.id,
      arrival: p.arrival,
      burst: p.burst,
    }));
    return { procs, span: null, runs: [], splits: [], pair: null, step: { kind: 'arrive' } };
  },

  reduce(scene: TurnaroundVsWaitScene, event: FacetRuntimeEvent): TurnaroundVsWaitScene {
    const payload = event.payload;
    switch (event.type) {
      case 'init':
        return { ...scene, span: num(payload, 'span') };
      case 'schedule': {
        const list = field(payload, 'runs');
        if (!Array.isArray(list)) throw new Error('turnaround-vs-wait 장면: runs 가 배열이 아니다');
        const runs = list.map((r: unknown) => ({
          id: knownId(scene, str(r, 'id')),
          start: num(r, 'start'),
          end: num(r, 'end'),
        }));
        return { ...scene, runs, step: { kind: 'schedule' } };
      }
      case 'split': {
        const id = knownId(scene, str(payload, 'id'));
        const split = { id, turnaround: num(payload, 'turnaround'), wait: num(payload, 'wait') };
        return { ...scene, splits: [...scene.splits, split], step: { kind: 'split', id } };
      }
      case 'compare': {
        const x = knownId(scene, str(payload, 'x'));
        const y = knownId(scene, str(payload, 'y'));
        return { ...scene, pair: { x, y }, step: { kind: 'compare', x, y } };
      }
      default:
        throw new Error(`turnaround-vs-wait 장면: 모르는 이벤트 ${event.type}`);
    }
  },
};
