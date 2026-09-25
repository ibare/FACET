/**
 * virtual-runtime 장면.
 *
 * 바탕 — 프로세스 목록(식별자 · 무게)과 축의 끝(max). 목록은 initialData 에서, max 는 silent init 에서.
 * 자취 — 프로세스마다 지금 가상 시간 · 마지막으로 돈 틱 · 돈 토막들(from → to).
 * 이번 걸음 — step. 뽑힌 것과 그 출발값(from) · 동률이던 것들.
 *
 * 누가 뽑힐지는 알고리즘이 셈한다. 장면은 pick 이벤트를 이을 뿐 다시 고르지 않는다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type VirtualRuntimeRun = { tick: number; from: number; to: number };

export type VirtualRuntimeLane = {
  id: string;
  weight: number;
  v: number;
  last: number | null;
  runs: VirtualRuntimeRun[];
};

export type VirtualRuntimeStep =
  | { kind: 'start' }
  | {
      kind: 'pick';
      tick: number;
      id: string;
      from: number;
      to: number;
      tie: string[];
      by: 'least' | 'never' | 'oldest';
    }
  | { kind: 'done'; ticks: number };

export type VirtualRuntimeScene = {
  lanes: VirtualRuntimeLane[];
  baseWeight: number;
  max: number;
  step: VirtualRuntimeStep;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function num(rec: Record<string, unknown>, key: string, where: string): number {
  const x = rec[key];
  if (typeof x !== 'number' || !Number.isFinite(x)) {
    throw new Error(`virtual-runtime 장면: ${where}.${key} 가 수가 아니다`);
  }
  return x;
}

function str(rec: Record<string, unknown>, key: string, where: string): string {
  const x = rec[key];
  if (typeof x !== 'string') throw new Error(`virtual-runtime 장면: ${where}.${key} 가 문자열이 아니다`);
  return x;
}

export const virtualRuntimeScene: ScenePlan<VirtualRuntimeScene> = {
  initial(initialData: unknown): VirtualRuntimeScene {
    if (!isRecord(initialData)) throw new Error('virtual-runtime 장면: initialData 가 없다');
    const tasks = initialData.tasks;
    if (!Array.isArray(tasks)) throw new Error('virtual-runtime 장면: initialData.tasks 가 배열이 아니다');
    const lanes = tasks.map((task: unknown, i): VirtualRuntimeLane => {
      if (!isRecord(task)) throw new Error(`virtual-runtime 장면: tasks[${i}] 가 객체가 아니다`);
      return {
        id: str(task, 'id', `tasks[${i}]`),
        weight: num(task, 'weight', `tasks[${i}]`),
        v: 0,
        last: null,
        runs: [],
      };
    });
    return {
      lanes,
      baseWeight: num(initialData, 'baseWeight', 'initialData'),
      max: 0,
      step: { kind: 'start' },
    };
  },

  reduce(scene: VirtualRuntimeScene, event: FacetRuntimeEvent): VirtualRuntimeScene {
    const payload = event.payload;
    if (event.type === 'init') {
      if (!isRecord(payload)) throw new Error('virtual-runtime 장면: init 의 payload 가 없다');
      return { ...scene, max: num(payload, 'max', 'init'), step: { kind: 'start' } };
    }
    if (event.type === 'pick') {
      if (!isRecord(payload)) throw new Error('virtual-runtime 장면: pick 의 payload 가 없다');
      const tick = num(payload, 'tick', 'pick');
      const id = str(payload, 'id', 'pick');
      const from = num(payload, 'from', 'pick');
      const to = num(payload, 'to', 'pick');
      const rawTie = payload.tie;
      if (!Array.isArray(rawTie)) throw new Error('virtual-runtime 장면: pick.tie 가 배열이 아니다');
      const tie = rawTie.map((x: unknown) => {
        if (typeof x !== 'string') throw new Error('virtual-runtime 장면: pick.tie 에 문자열이 아닌 것');
        return x;
      });
      const by = payload.by;
      if (by !== 'least' && by !== 'never' && by !== 'oldest') {
        throw new Error(`virtual-runtime 장면: pick.by 를 모른다 (${String(by)})`);
      }
      if (!scene.lanes.some((lane) => lane.id === id)) {
        throw new Error(`virtual-runtime 장면: 모르는 식별자 ${id}`);
      }
      const lanes = scene.lanes.map((lane) =>
        lane.id === id
          ? { ...lane, v: to, last: tick, runs: [...lane.runs, { tick, from, to }] }
          : lane,
      );
      return { ...scene, lanes, step: { kind: 'pick', tick, id, from, to, tie, by } };
    }
    if (event.type === 'done') {
      if (!isRecord(payload)) throw new Error('virtual-runtime 장면: done 의 payload 가 없다');
      return { ...scene, step: { kind: 'done', ticks: num(payload, 'ticks', 'done') } };
    }
    return scene;
  },
};
