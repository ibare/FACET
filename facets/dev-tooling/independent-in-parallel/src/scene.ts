/**
 * independent-in-parallel 의 장면.
 *
 * - 바탕: 규칙(대상 · 입력 · 시간)과 일꾼 수 — `initial()` 이 `initialData` 에서 베낀다
 * - 자취: 시계, 일꾼에 오른 것(누가 · 어느 일꾼 · 언제), 끝난 것(누가 · 언제)
 * - 이번 걸음: 시계가 어디서 어디로 갔고 무엇이 끝나고 무엇이 올랐는가
 *
 * 셈은 알고리즘이 한다. 장면은 `tick` 을 잇기만 한다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import type { BuildTarget } from './algorithm.js';

export type BuildRun = { name: string; worker: number; start: number };
export type BuildDone = { name: string; at: number };

export type IndependentInParallelScene = {
  targets: BuildTarget[];
  workers: number;
  clock: number;
  runs: BuildRun[];
  finished: BuildDone[];
  step: null | { from: number; to: number; finished: string[]; started: string[] };
};

function readTargets(value: unknown): BuildTarget[] {
  if (!Array.isArray(value)) throw new Error('independentInParallelScene: initialData.targets 가 배열이 아니다');
  return value.map((item, i) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error(`independentInParallelScene: targets[${i}] 가 객체가 아니다`);
    }
    const rec = item as Record<string, unknown>;
    const { name, inputs, seconds } = rec;
    if (typeof name !== 'string' || typeof seconds !== 'number' || !Array.isArray(inputs)) {
      throw new Error(`independentInParallelScene: targets[${i}] 의 모양이 틀렸다`);
    }
    return {
      name,
      seconds,
      inputs: inputs.map((input) => {
        if (typeof input !== 'string') throw new Error(`independentInParallelScene: ${name} 의 입력이 글자가 아니다`);
        return input;
      }),
    };
  });
}

function readNames(value: unknown, what: string): string[] {
  if (!Array.isArray(value)) throw new Error(`independentInParallelScene: tick 의 ${what} 가 배열이 아니다`);
  return value.map((item) => {
    if (typeof item !== 'string') throw new Error(`independentInParallelScene: tick 의 ${what} 에 글자가 아닌 것`);
    return item;
  });
}

function readStarts(value: unknown): { name: string; worker: number }[] {
  if (!Array.isArray(value)) throw new Error('independentInParallelScene: tick 의 started 가 배열이 아니다');
  return value.map((item) => {
    if (typeof item !== 'object' || item === null) {
      throw new Error('independentInParallelScene: tick 의 started 에 객체가 아닌 것');
    }
    const rec = item as Record<string, unknown>;
    if (typeof rec.name !== 'string' || typeof rec.worker !== 'number') {
      throw new Error('independentInParallelScene: tick 의 started 모양이 틀렸다');
    }
    return { name: rec.name, worker: rec.worker };
  });
}

export const independentInParallelScene: ScenePlan<IndependentInParallelScene> = {
  initial(initialData) {
    if (typeof initialData !== 'object' || initialData === null) {
      throw new Error('independentInParallelScene: initialData 가 객체가 아니다');
    }
    const data = initialData as Record<string, unknown>;
    const workers = data.workers;
    if (typeof workers !== 'number' || !Number.isInteger(workers) || workers < 1) {
      throw new Error(`independentInParallelScene: initialData.workers 가 1 이상의 정수가 아니다 (${String(workers)})`);
    }
    return {
      targets: readTargets(data.targets),
      workers,
      clock: 0,
      runs: [],
      finished: [],
      step: null,
    };
  },
  reduce(scene, event: FacetRuntimeEvent) {
    if (event.type !== 'tick') return scene;
    const payload = event.payload;
    if (typeof payload !== 'object' || payload === null) {
      throw new Error('independentInParallelScene: tick 에 payload 가 없다');
    }
    const rec = payload as Record<string, unknown>;
    if (typeof rec.t !== 'number') throw new Error('independentInParallelScene: tick 의 t 가 수가 아니다');
    const t = rec.t;
    const finished = readNames(rec.finished, 'finished');
    const started = readStarts(rec.started);
    const known = new Set(scene.targets.map((target) => target.name));
    for (const name of [...finished, ...started.map((s) => s.name)]) {
      if (!known.has(name)) throw new Error(`independentInParallelScene: 규칙에 없는 대상 ${name}`);
    }
    return {
      targets: scene.targets,
      workers: scene.workers,
      clock: t,
      runs: [...scene.runs, ...started.map((s) => ({ name: s.name, worker: s.worker, start: t }))],
      finished: [...scene.finished, ...finished.map((name) => ({ name, at: t }))],
      step: { from: scene.clock, to: t, finished, started: started.map((s) => s.name) },
    };
  },
};
