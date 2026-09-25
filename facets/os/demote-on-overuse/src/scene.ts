/**
 * demote-on-overuse 장면 — boundary 이벤트를 잇는다. 누가 오를지 다시 셈하지 않는다.
 *
 * 바탕: 줄마다의 몫 · 프로세스 목록 (initialData 에서 베낀다)
 * 자취: 프로세스마다 지금 있는 자리(아직 안 옴 · 줄 · CPU · 끝)와 줄, 줄의 차례, 끝난 차례
 * 이번 걸음: step — 이 틱 경계에서 일어난 일
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { checkDemoteData } from './algorithm.js';

export type DemoteWhere = 'absent' | 'waiting' | 'running' | 'done';

export type DemoteProcState = {
  id: string;
  where: DemoteWhere;
  /** 지금 속한 줄 */
  level: number;
  /** 남은 양 (틱) */
  left: number;
};

export type DemoteStep = {
  tick: number;
  finished: { id: string; level: number; used: number } | null;
  demoted: { id: string; from: number; to: number; used: number; left: number } | null;
  arrived: string[];
  ran: { id: string; level: number } | null;
};

export type DemoteScene = {
  quanta: number[];
  procs: DemoteProcState[];
  /** 줄마다 서 있는 차례 (CPU 에 있는 것은 빠져 있다) */
  queues: string[][];
  /** 끝난 차례 */
  done: string[];
  tick: number | null;
  step: DemoteStep | null;
};

function rec(v: unknown, what: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null) throw new Error(`demote-on-overuse 장면: ${what} 가 객체가 아니다`);
  return v as Record<string, unknown>;
}

function int(v: unknown, what: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw new Error(`demote-on-overuse 장면: ${what} 가 정수가 아니다`);
  return v;
}

function str(v: unknown, what: string): string {
  if (typeof v !== 'string') throw new Error(`demote-on-overuse 장면: ${what} 가 문자열이 아니다`);
  return v;
}

function strList(v: unknown, what: string): string[] {
  if (!Array.isArray(v)) throw new Error(`demote-on-overuse 장면: ${what} 가 배열이 아니다`);
  return v.map((x, i) => str(x, `${what}[${i}]`));
}

function parseStep(payload: unknown, levels: number): { step: DemoteStep; queues: string[][] } {
  const p = rec(payload, 'payload');
  const tick = int(p['tick'], 'tick');

  let finished: DemoteStep['finished'] = null;
  if (p['finished'] !== null) {
    const f = rec(p['finished'], 'finished');
    finished = { id: str(f['id'], 'finished.id'), level: int(f['level'], 'finished.level'), used: int(f['used'], 'finished.used') };
  }

  let demoted: DemoteStep['demoted'] = null;
  if (p['demoted'] !== null) {
    const d = rec(p['demoted'], 'demoted');
    demoted = {
      id: str(d['id'], 'demoted.id'),
      from: int(d['from'], 'demoted.from'),
      to: int(d['to'], 'demoted.to'),
      used: int(d['used'], 'demoted.used'),
      left: int(d['left'], 'demoted.left'),
    };
  }

  const arrived = strList(p['arrived'], 'arrived');

  let ran: DemoteStep['ran'] = null;
  if (p['ran'] !== null) {
    const r = rec(p['ran'], 'ran');
    ran = { id: str(r['id'], 'ran.id'), level: int(r['level'], 'ran.level') };
  }

  const rawQueues = p['queues'];
  if (!Array.isArray(rawQueues) || rawQueues.length !== levels) {
    throw new Error('demote-on-overuse 장면: queues 의 줄 수가 바탕과 다르다');
  }
  const queues = rawQueues.map((q, i) => strList(q, `queues[${i}]`));
  return { step: { tick, finished, demoted, arrived, ran }, queues };
}

export const demoteOnOveruseScene: ScenePlan<DemoteScene> = {
  initial(initialData: unknown): DemoteScene {
    const data = checkDemoteData(initialData);
    return {
      quanta: data.quanta.slice(),
      procs: data.procs.map((p) => ({ id: p.id, where: 'absent', level: 0, left: p.burst })),
      queues: data.quanta.map(() => []),
      done: [],
      tick: null,
      step: null,
    };
  },

  reduce(scene: DemoteScene, event: FacetRuntimeEvent): DemoteScene {
    if (event.type !== 'boundary') return scene;
    const { step, queues } = parseStep(event.payload, scene.quanta.length);

    const procs = scene.procs.map((p) => ({ ...p }));
    const at = (id: string): DemoteProcState => {
      const p = procs.find((x) => x.id === id);
      if (p === undefined) throw new Error(`demote-on-overuse 장면: 모르는 식별자 ${id}`);
      return p;
    };

    const done = scene.done.slice();
    if (step.finished !== null) {
      const p = at(step.finished.id);
      p.where = 'done';
      p.level = step.finished.level;
      p.left = 0;
      done.push(p.id);
    }
    if (step.demoted !== null) {
      const p = at(step.demoted.id);
      p.where = 'waiting';
      p.level = step.demoted.to;
      p.left = step.demoted.left;
    }
    for (const id of step.arrived) {
      const p = at(id);
      p.where = 'waiting';
      p.level = 0;
    }
    if (step.ran !== null) {
      const p = at(step.ran.id);
      p.where = 'running';
      p.level = step.ran.level;
    }

    return {
      quanta: scene.quanta.slice(),
      procs,
      queues,
      done,
      tick: step.tick,
      step,
    };
  },
};
