/**
 * hold-and-wait 장면 — `tick` 이벤트의 상태 떠냄을 잇기만 한다. 셈은 알고리즘이 한다.
 *
 * 바탕: 스레드(식별자 · 도착 틱 · 프로그램 줄)와 자물쇠 이름 — initialData 에서 베낀다.
 * 자취: 틱마다 스레드 상태 · 자물쇠 주인 · 줄 · 수 (알고리즘이 낸 값 그대로).
 * 이번 걸음: 누가 무슨 줄을 돌렸고 무엇이 어디서 어디로 갔는가.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type HawThreadState = 'new' | 'ready' | 'blocked' | 'done';

export type HawThreadBase = { id: string; arrive: number; lines: string[] };
export type HawThreadNow = { id: string; state: HawThreadState; pc: number; waited: number };
export type HawLockNow = { id: string; owner: string | null; queue: string[]; idle: number; used: number };

export type HawStepKind = 'take' | 'block' | 'work' | 'release';

export type HawStep = {
  tick: number;
  thread: string;
  was: string | null;
  line: number;
  kind: HawStepKind;
  lock: string | null;
  owner: string | null;
  to: string | null;
  arrived: string[];
};

export type HoldAndWaitScene = {
  base: { threads: HawThreadBase[]; locks: string[] };
  threads: HawThreadNow[];
  locks: HawLockNow[];
  step: HawStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function strArr(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') return null;
    out.push(x);
  }
  return out;
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function isThreadState(v: unknown): v is HawThreadState {
  return v === 'new' || v === 'ready' || v === 'blocked' || v === 'done';
}

function isKind(v: unknown): v is HawStepKind {
  return v === 'take' || v === 'block' || v === 'work' || v === 'release';
}

/** initialData 에서 바탕을 베낀다. 모양이 아니면 빈 바탕. */
export function readBase(data: unknown): HoldAndWaitScene['base'] {
  if (!isRecord(data)) return { threads: [], locks: [] };
  const locks = strArr(data['locks']) ?? [];
  const threads: HawThreadBase[] = [];
  const raw = data['threads'];
  if (Array.isArray(raw)) {
    for (const th of raw) {
      if (!isRecord(th)) continue;
      const id = th['id'];
      const arrive = th['arrive'];
      const lines = strArr(th['lines']);
      if (typeof id !== 'string' || typeof arrive !== 'number' || lines === null) continue;
      threads.push({ id, arrive, lines });
    }
  }
  return { threads, locks };
}

export const holdAndWaitScene: ScenePlan<HoldAndWaitScene> = {
  initial(initialData: unknown): HoldAndWaitScene {
    const base = readBase(initialData);
    return {
      base,
      threads: base.threads.map((th) => ({
        id: th.id,
        state: th.arrive <= 0 ? 'ready' : 'new',
        pc: 0,
        waited: 0,
      })),
      locks: base.locks.map((m) => ({ id: m, owner: null, queue: [], idle: 0, used: 0 })),
      step: null,
    };
  },

  reduce(scene: HoldAndWaitScene, event: FacetRuntimeEvent): HoldAndWaitScene {
    if (event.type !== 'tick') return scene;
    const p = event.payload;
    if (!isRecord(p)) return scene;
    const tick = p['tick'];
    const thread = p['thread'];
    const line = p['line'];
    const kind = p['kind'];
    const arrived = strArr(p['arrived']);
    if (typeof tick !== 'number' || typeof thread !== 'string' || typeof line !== 'number' || !isKind(kind) || arrived === null) {
      return scene;
    }
    const threads: HawThreadNow[] = [];
    if (Array.isArray(p['threads'])) {
      for (const th of p['threads']) {
        if (!isRecord(th)) continue;
        const id = th['id'];
        const state = th['state'];
        const pc = th['pc'];
        const waited = th['waited'];
        if (typeof id !== 'string' || !isThreadState(state) || typeof pc !== 'number' || typeof waited !== 'number') continue;
        threads.push({ id, state, pc, waited });
      }
    }
    const locks: HawLockNow[] = [];
    if (Array.isArray(p['locks'])) {
      for (const lk of p['locks']) {
        if (!isRecord(lk)) continue;
        const id = lk['id'];
        const queue = strArr(lk['queue']);
        const idle = lk['idle'];
        const used = lk['used'];
        if (typeof id !== 'string' || queue === null || typeof idle !== 'number' || typeof used !== 'number') continue;
        locks.push({ id, owner: strOrNull(lk['owner']), queue, idle, used });
      }
    }
    return {
      base: scene.base,
      threads,
      locks,
      step: {
        tick,
        thread,
        was: strOrNull(p['was']),
        line,
        kind,
        lock: strOrNull(p['lock']),
        owner: strOrNull(p['owner']),
        to: strOrNull(p['to']),
        arrived,
      },
    };
  },
};
