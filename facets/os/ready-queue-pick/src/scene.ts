/**
 * ready-queue-pick 장면 — 알고리즘의 `boundary` 를 이어 줄 · CPU 자리 · 끝난 것을 쌓는다.
 *
 * 장면은 누가 오를지 다시 셈하지 않는다. 알고리즘이 말한 끝 · 도착 · 고름을 그대로 옮기되,
 * 그 말이 장면과 어긋나면(돌던 것이 아닌 것이 끝났다, 줄 맨 앞이 아닌 것이 올랐다) 던진다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

/** 이번 걸음 — 한 틱 경계. `queueBefore` · `cpuBefore` 는 운동의 출발을 말하는 계기값이다. */
export type ReadyQueueStep = {
  tick: number;
  finished: string | null;
  arrived: string[];
  picked: string | null;
  queueBefore: string[];
  cpuBefore: string | null;
};

export type ReadyQueueScene = {
  /** 바탕 — 프로세스 식별자, 데이터 목록 차례 */
  procs: string[];
  /** 자취 — 준비 큐 (앞이 0 번) */
  queue: string[];
  /** 자취 — CPU 자리의 주인 */
  cpu: string | null;
  /** 자취 — 끝난 차례 */
  done: string[];
  /** 이번 걸음 */
  step: ReadyQueueStep | null;
};

function readIds(initialData: unknown): string[] {
  if (typeof initialData !== 'object' || initialData === null) {
    throw new Error('ready-queue-pick 장면: initialData 가 없다');
  }
  const procs = (initialData as Record<string, unknown>).procs;
  if (!Array.isArray(procs)) throw new Error('ready-queue-pick 장면: procs 가 배열이 아니다');
  return procs.map((raw: unknown, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`ready-queue-pick 장면: procs[${i}] 가 객체가 아니다`);
    }
    const id = (raw as Record<string, unknown>).id;
    if (typeof id !== 'string' || id === '') {
      throw new Error(`ready-queue-pick 장면: procs[${i}].id 가 없다`);
    }
    return id;
  });
}

function readId(v: unknown, field: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`ready-queue-pick 장면: ${field} 가 문자열이 아니다`);
  return v;
}

export const readyQueuePickScene: ScenePlan<ReadyQueueScene> = {
  initial(initialData: unknown): ReadyQueueScene {
    return { procs: readIds(initialData), queue: [], cpu: null, done: [], step: null };
  },

  reduce(scene: ReadyQueueScene, event: FacetRuntimeEvent): ReadyQueueScene {
    if (event.type !== 'boundary') return scene;
    const p = event.payload;
    if (typeof p !== 'object' || p === null) {
      throw new Error('ready-queue-pick 장면: boundary 의 payload 가 없다');
    }
    const rec = p as Record<string, unknown>;
    const tick = rec.tick;
    if (typeof tick !== 'number') throw new Error('ready-queue-pick 장면: tick 이 수가 아니다');
    const finished = readId(rec.finished, 'finished');
    const picked = readId(rec.picked, 'picked');
    const arrivedRaw = rec.arrived;
    if (!Array.isArray(arrivedRaw)) throw new Error('ready-queue-pick 장면: arrived 가 배열이 아니다');
    const arrived = arrivedRaw.map((v: unknown) => {
      if (typeof v !== 'string' || !scene.procs.includes(v)) {
        throw new Error(`ready-queue-pick 장면: 모르는 도착 ${String(v)}`);
      }
      return v;
    });

    let cpu = scene.cpu;
    const done = [...scene.done];
    if (finished !== null) {
      if (finished !== cpu) {
        throw new Error(`ready-queue-pick 장면: 돌던 것이 아닌 ${finished} 가 끝났다`);
      }
      done.push(finished);
      cpu = null;
    }
    const queue = [...scene.queue, ...arrived];
    if (picked !== null) {
      if (cpu !== null) throw new Error(`ready-queue-pick 장면: CPU 가 차 있는데 ${picked} 가 올랐다`);
      if (queue[0] !== picked) {
        throw new Error(`ready-queue-pick 장면: 줄 맨 앞이 아닌 ${picked} 가 올랐다`);
      }
      queue.shift();
      cpu = picked;
    }

    return {
      procs: [...scene.procs],
      queue,
      cpu,
      done,
      step: {
        tick,
        finished,
        arrived,
        picked,
        queueBefore: [...scene.queue],
        cpuBefore: scene.cpu,
      },
    };
  },
};
