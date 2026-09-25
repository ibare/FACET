/**
 * 비선점 장면 — `tick` 이벤트를 잇는다. 셈은 알고리즘이 했고, 장면은 틱 뒤 모습을 베껴 쥔다.
 *
 * - 바탕: 자물쇠 이름 · 스레드(식별자 · 우선순위 · 오는 틱 · 줄 글자). `initial()` 이 initialData 에서 베낀다
 * - 자취: 틱 · 와 있는/잠든/끝난 스레드 · 스레드마다 다음 줄 · 자물쇠 주인과 줄 · 잠든 틱 수 · 넘어감 수
 * - 이번 걸음(`step`): 이 틱에 CPU 를 받은 스레드와 그 줄 · 동작 · CPU 가 떠나온 스레드 · 자물쇠가 옮긴 자리
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type NoPreemptionOp = 'take' | 'block' | 'work' | 'handoff' | 'release';

export type NoPreemptionSceneThread = {
  id: string;
  priority: number;
  arrive: number;
  lines: string[];
};

export type NoPreemptionStep = {
  thread: string;
  line: number;
  op: NoPreemptionOp;
  lock: string | null;
  cpuFrom: string | null;
  cpuFromLine: number | null;
  lockFrom: string | null;
  lockTo: string | null;
  arrived: string[];
};

export type NoPreemptionScene = {
  locks: string[];
  threads: NoPreemptionSceneThread[];
  /** 마지막으로 지난 틱. 아직 없으면 null */
  tick: number | null;
  present: string[];
  asleep: string[];
  done: string[];
  pcs: [string, number][];
  owners: [string, string | null][];
  queues: [string, string[]][];
  sleepTicks: [string, number][];
  switches: number;
  ownerChanges: number;
  step: NoPreemptionStep | null;
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strArr(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`noPreemptionScene: ${what} 이 목록이 아니다`);
  return v.map((x) => {
    if (typeof x !== 'string') throw new Error(`noPreemptionScene: ${what} 에 글자가 아닌 값`);
    return x;
  });
}

function num(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`noPreemptionScene: ${what} 이 수가 아니다`);
  return v;
}

function strOrNull(v: unknown, what: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`noPreemptionScene: ${what} 이 글자가 아니다`);
  return v;
}

function pairs<V>(v: unknown, what: string, val: (x: unknown) => V): [string, V][] {
  if (!Array.isArray(v)) throw new Error(`noPreemptionScene: ${what} 이 목록이 아니다`);
  return v.map((p) => {
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'string') {
      throw new Error(`noPreemptionScene: ${what} 의 짝 모양이 틀렸다`);
    }
    return [p[0], val(p[1])];
  });
}

function readOp(v: unknown): NoPreemptionOp {
  if (v === 'take' || v === 'block' || v === 'work' || v === 'handoff' || v === 'release') return v;
  throw new Error(`noPreemptionScene: 모르는 동작 ${String(v)}`);
}

function readThreads(v: unknown): NoPreemptionSceneThread[] {
  if (!Array.isArray(v)) return [];
  return v.map((th, i) => {
    if (!isObj(th) || typeof th.id !== 'string') throw new Error(`noPreemptionScene: 스레드 ${i} 모양이 틀렸다`);
    return {
      id: th.id,
      priority: num(th.priority, `스레드 ${th.id} 우선순위`),
      arrive: num(th.arrive, `스레드 ${th.id} 오는 틱`),
      lines: strArr(th.lines, `스레드 ${th.id} 줄`),
    };
  });
}

export const noPreemptionScene: ScenePlan<NoPreemptionScene> = {
  initial(initialData: unknown): NoPreemptionScene {
    const d = isObj(initialData) ? initialData : {};
    const locks = Array.isArray(d.locks) ? strArr(d.locks, 'locks') : [];
    const threads = readThreads(d.threads);
    return {
      locks,
      threads,
      tick: null,
      present: threads.filter((th) => th.arrive <= 0).map((th) => th.id),
      asleep: [],
      done: [],
      pcs: threads.map((th) => [th.id, 0]),
      owners: locks.map((name) => [name, null]),
      queues: locks.map((name) => [name, []]),
      sleepTicks: threads.map((th) => [th.id, 0]),
      switches: 0,
      ownerChanges: 0,
      step: null,
    };
  },

  reduce(scene: NoPreemptionScene, event: FacetRuntimeEvent): NoPreemptionScene {
    if (event.type !== 'tick') return scene;
    const p = event.payload;
    if (!isObj(p)) throw new Error('noPreemptionScene: tick payload 가 없다');
    if (typeof p.thread !== 'string') throw new Error('noPreemptionScene: tick.thread 가 글자가 아니다');
    return {
      locks: scene.locks,
      threads: scene.threads,
      tick: num(p.tick, 'tick'),
      present: strArr(p.present, 'present'),
      asleep: strArr(p.asleep, 'asleep'),
      done: strArr(p.done, 'done'),
      pcs: pairs(p.pcs, 'pcs', (x) => num(x, 'pc')),
      owners: pairs(p.owners, 'owners', (x) => strOrNull(x, 'owner')),
      queues: pairs(p.queues, 'queues', (x) => strArr(x, 'queue')),
      sleepTicks: pairs(p.sleepTicks, 'sleepTicks', (x) => num(x, 'sleepTicks')),
      switches: num(p.switches, 'switches'),
      ownerChanges: num(p.ownerChanges, 'ownerChanges'),
      step: {
        thread: p.thread,
        line: num(p.line, 'line'),
        op: readOp(p.op),
        lock: strOrNull(p.lock, 'lock'),
        cpuFrom: strOrNull(p.cpuFrom, 'cpuFrom'),
        cpuFromLine: p.cpuFromLine === null ? null : num(p.cpuFromLine, 'cpuFromLine'),
        lockFrom: strOrNull(p.lockFrom, 'lockFrom'),
        lockTo: strOrNull(p.lockTo, 'lockTo'),
        arrived: strArr(p.arrived, 'arrived'),
      },
    };
  },
};
