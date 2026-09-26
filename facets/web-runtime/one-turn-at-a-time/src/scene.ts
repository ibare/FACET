/**
 * one-turn-at-a-time 의 장면 — 태스크 줄 · 도는 것 · 끝난 차례를 이벤트에서 잇는다.
 *
 * 바탕(init) — tasks · 처음 queue. 자취 — finished. 이번 걸음 — step.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { parseOneTurnAtATimeData, type OneTurnAtATimeTask } from './algorithm.js';

export type OneTurnAtATimeStepInfo =
  | { kind: 'initial' }
  | {
      kind: 'unit';
      id: string;
      u: number;
      total: number;
      dequeued: boolean;
      done: boolean;
      arrived: string | null;
    };

export type OneTurnAtATimeScene = {
  /** 바탕 — 태스크 목록 (색·이름을 고르는 데만 쓴다). */
  tasks: OneTurnAtATimeTask[];
  /** 지금 줄 (도는 것은 뺀다). */
  queue: string[];
  running: { id: string; done: number; total: number } | null;
  /** 자취 — 끝난 차례. */
  finished: string[];
  step: OneTurnAtATimeStepInfo;
};

function readUnitPayload(payload: unknown): { id: string; u: number; total: number; arrived: string | null } {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('oneTurnAtATimeScene: unit payload 가 객체가 아니다');
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.id !== 'string') throw new Error('oneTurnAtATimeScene: unit payload 에 id 가 없다');
  if (typeof p.u !== 'number') throw new Error('oneTurnAtATimeScene: unit payload 에 u 가 없다');
  if (typeof p.total !== 'number') throw new Error('oneTurnAtATimeScene: unit payload 에 total 이 없다');
  if (p.arrived !== null && typeof p.arrived !== 'string') {
    throw new Error('oneTurnAtATimeScene: unit payload 의 arrived 가 문자열도 null 도 아니다');
  }
  return { id: p.id, u: p.u, total: p.total, arrived: p.arrived };
}

export const oneTurnAtATimeScene: ScenePlan<OneTurnAtATimeScene> = {
  initial(initialData: unknown): OneTurnAtATimeScene {
    const data = parseOneTurnAtATimeData(initialData);
    return {
      tasks: data.tasks.map((t) => ({ id: t.id, units: t.units })),
      queue: [...data.queue],
      running: null,
      finished: [],
      step: { kind: 'initial' },
    };
  },
  reduce(scene: OneTurnAtATimeScene, event: FacetRuntimeEvent): OneTurnAtATimeScene {
    if (event.type !== 'unit') return scene;
    const { id, u, total, arrived } = readUnitPayload(event.payload);

    const dequeued = scene.running === null || scene.running.id !== id;
    let queue = scene.queue;
    if (dequeued) {
      if (queue[0] !== id) {
        throw new Error(`oneTurnAtATimeScene: 줄 맨 앞이 ${id} 가 아니다 (지금 ${String(queue[0])})`);
      }
      queue = queue.slice(1);
    }
    if (arrived !== null) queue = [...queue, arrived];

    const done = u === total;
    const finished = done ? [...scene.finished, id] : scene.finished;

    return {
      tasks: scene.tasks,
      queue,
      running: done ? null : { id, done: u, total },
      finished,
      step: { kind: 'unit', id, u, total, dequeued, done, arrived },
    };
  },
};
