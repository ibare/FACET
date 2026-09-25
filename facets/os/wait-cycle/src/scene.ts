/**
 * wait-cycle 장면 — 이벤트를 잇기만 한다. 차례 · 주인 · 화살 · 고리는 알고리즘이 셈해
 * payload 로 보낸 것을 옮겨 적는다 (셈을 다시 돌리지 않는다).
 *
 * 바탕: threads · locks (initialData 에서 베낌)
 * 자취: owners · pcs · status · waits · ring · tick · cpu · halted
 * 이번 걸음: step
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  readWaitCycleData,
  type WaitCycleEdge,
  type WaitCycleOutcome,
  type WaitCycleStatus,
  type WaitCycleThread,
} from './algorithm.js';

export type WaitCycleStep =
  | {
      kind: 'tick';
      tick: number;
      thread: string;
      line: number;
      outcome: WaitCycleOutcome;
      lock: string | null;
      other: string | null;
      /** 앞 틱을 받았던 스레드 — CPU 표지가 어디서 오는지 */
      cpuFrom: string | null;
    }
  | { kind: 'halt'; cpuFrom: string | null };

export type WaitCycleHalt = { tick: number; ready: number; asleep: number; done: number };

export type WaitCycleScene = {
  threads: WaitCycleThread[];
  locks: string[];
  owners: { lock: string; owner: string | null }[];
  pcs: { thread: string; pc: number }[];
  status: { thread: string; status: WaitCycleStatus }[];
  waits: WaitCycleEdge[];
  ring: string[];
  tick: number | null;
  cpu: string | null;
  halted: WaitCycleHalt | null;
  step: WaitCycleStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(p: Record<string, unknown>, key: string): number {
  const v = p[key];
  if (typeof v !== 'number') throw new Error(`wait-cycle 장면: payload.${key} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, key: string): string {
  const v = p[key];
  if (typeof v !== 'string') throw new Error(`wait-cycle 장면: payload.${key} 가 글자가 아니다`);
  return v;
}

function strOrNull(p: Record<string, unknown>, key: string): string | null {
  const v = p[key];
  if (v === null) return null;
  if (typeof v !== 'string') throw new Error(`wait-cycle 장면: payload.${key} 가 글자나 null 이 아니다`);
  return v;
}

function list(p: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const v = p[key];
  if (!Array.isArray(v)) throw new Error(`wait-cycle 장면: payload.${key} 가 배열이 아니다`);
  return v.map((x) => {
    if (!isRecord(x)) throw new Error(`wait-cycle 장면: payload.${key} 의 칸이 객체가 아니다`);
    return x;
  });
}

const OUTCOMES: readonly WaitCycleOutcome[] = ['took', 'blocked', 'ran', 'released', 'handed'];
const STATUSES: readonly WaitCycleStatus[] = ['ready', 'asleep', 'done'];

function outcomeOf(v: string): WaitCycleOutcome {
  const hit = OUTCOMES.find((o) => o === v);
  if (!hit) throw new Error(`wait-cycle 장면: 모르는 outcome '${v}'`);
  return hit;
}

function statusOf(v: string): WaitCycleStatus {
  const hit = STATUSES.find((o) => o === v);
  if (!hit) throw new Error(`wait-cycle 장면: 모르는 status '${v}'`);
  return hit;
}

export const waitCycleScene: ScenePlan<WaitCycleScene> = {
  initial(initialData: unknown): WaitCycleScene {
    const data = readWaitCycleData(initialData);
    return {
      threads: data.threads.map((th) => ({
        id: th.id,
        program: th.program.map((op) => ({ ...op })),
      })),
      locks: [...data.locks],
      owners: data.locks.map((l) => ({ lock: l, owner: null })),
      pcs: data.threads.map((th) => ({ thread: th.id, pc: 0 })),
      status: data.threads.map((th) => ({ thread: th.id, status: 'ready' as const })),
      waits: [],
      ring: [],
      tick: null,
      cpu: null,
      halted: null,
      step: null,
    };
  },

  reduce(scene: WaitCycleScene, event: FacetRuntimeEvent): WaitCycleScene {
    const p = event.payload;
    if (event.type === 'tick') {
      if (!isRecord(p)) throw new Error('wait-cycle 장면: tick payload 가 객체가 아니다');
      const thread = str(p, 'thread');
      const tick = num(p, 'tick');
      const ringRaw = p['ring'];
      if (!Array.isArray(ringRaw)) throw new Error('wait-cycle 장면: payload.ring 이 배열이 아니다');
      const ring = ringRaw.map((x) => {
        if (typeof x !== 'string') throw new Error('wait-cycle 장면: payload.ring 의 칸이 글자가 아니다');
        return x;
      });
      return {
        threads: scene.threads,
        locks: scene.locks,
        owners: list(p, 'owners').map((o) => ({ lock: str(o, 'lock'), owner: strOrNull(o, 'owner') })),
        pcs: list(p, 'pcs').map((o) => ({ thread: str(o, 'thread'), pc: num(o, 'pc') })),
        status: list(p, 'status').map((o) => ({
          thread: str(o, 'thread'),
          status: statusOf(str(o, 'status')),
        })),
        waits: list(p, 'waits').map((o) => ({ from: str(o, 'from'), lock: str(o, 'lock'), to: str(o, 'to') })),
        // 한 번 닫힌 고리는 풀릴 길이 없다 — 이 조각의 멈춤까지 남긴다
        ring: ring.length > 0 ? ring : [...scene.ring],
        tick,
        cpu: thread,
        halted: null,
        step: {
          kind: 'tick',
          tick,
          thread,
          line: num(p, 'line'),
          outcome: outcomeOf(str(p, 'outcome')),
          lock: strOrNull(p, 'lock'),
          other: strOrNull(p, 'other'),
          cpuFrom: scene.cpu,
        },
      };
    }
    if (event.type === 'halt') {
      if (!isRecord(p)) throw new Error('wait-cycle 장면: halt payload 가 객체가 아니다');
      return {
        ...scene,
        owners: scene.owners.map((o) => ({ ...o })),
        pcs: scene.pcs.map((o) => ({ ...o })),
        status: scene.status.map((o) => ({ ...o })),
        waits: scene.waits.map((o) => ({ ...o })),
        ring: [...scene.ring],
        tick: num(p, 'tick'),
        cpu: null,
        halted: {
          tick: num(p, 'tick'),
          ready: num(p, 'ready'),
          asleep: num(p, 'asleep'),
          done: num(p, 'done'),
        },
        step: { kind: 'halt', cpuFrom: scene.cpu },
      };
    }
    return scene;
  },
};
