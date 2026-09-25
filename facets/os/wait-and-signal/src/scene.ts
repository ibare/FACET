/**
 * wait-and-signal 장면.
 *
 * 바탕 — 자물쇠 · 조건 변수 · 공유 값 이름, 스레드와 그 프로그램 줄 (initialData 에서 베낀다).
 * 자취 — 자물쇠 주인 · 두 줄 · 끝난 스레드 · 공유 값 · 조건을 본 횟수 (알고리즘이 셈해 보낸 것을 그대로 잇는다).
 * 이번 걸음 — 달린 스레드와 줄, 일어난 일의 종류, 자리를 옮긴 스레드마다 떠난 자리.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SceneThread = { id: string; role: 'taker' | 'giver'; lines: string[] };

/** 스레드가 서 있는 곳 */
export type Spot =
  | { at: 'out' }
  | { at: 'holder' }
  | { at: 'lockQueue'; slot: number }
  | { at: 'condQueue'; slot: number };

export type StepKind =
  | 'take'
  | 'block'
  | 'checkFalse'
  | 'checkTrue'
  | 'wait'
  | 'set'
  | 'signal'
  | 'signalNone'
  | 'unlockHand'
  | 'unlockFree'
  | 'work';

export type SceneMove = { id: string; from: Spot };

export type SceneStep =
  | {
      kind: StepKind;
      tick: number;
      thread: string;
      line: number;
      other: string | null;
      moves: SceneMove[];
    }
  | { kind: 'deadlock'; tick: number };

export type WaitAndSignalScene = {
  lock: string;
  cond: string;
  flagName: string;
  threads: SceneThread[];
  owner: string | null;
  lockQueue: string[];
  condQueue: string[];
  done: string[];
  flag: boolean;
  checks: number;
  step: SceneStep | null;
};

const KINDS: readonly StepKind[] = [
  'take',
  'block',
  'checkFalse',
  'checkTrue',
  'wait',
  'set',
  'signal',
  'signalNone',
  'unlockHand',
  'unlockFree',
  'work',
];

function isKind(v: unknown): v is StepKind {
  return typeof v === 'string' && (KINDS as readonly string[]).includes(v);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function stringList(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  const out: string[] = [];
  for (const x of v) {
    if (typeof x !== 'string') return null;
    out.push(x);
  }
  return out;
}

function readThreads(v: unknown): SceneThread[] {
  if (!Array.isArray(v)) return [];
  const out: SceneThread[] = [];
  for (const th of v) {
    if (!isRecord(th)) continue;
    const id = th['id'];
    const role = th['role'];
    const lines = stringList(th['lines']);
    if (typeof id !== 'string' || (role !== 'taker' && role !== 'giver') || lines === null) continue;
    out.push({ id, role, lines });
  }
  return out;
}

/** 스레드가 장면의 어디에 서 있는지 — 주인 · 두 줄 · 그 밖 */
export function spotOf(scene: WaitAndSignalScene, id: string): Spot {
  if (scene.owner === id) return { at: 'holder' };
  const q = scene.lockQueue.indexOf(id);
  if (q >= 0) return { at: 'lockQueue', slot: q };
  const c = scene.condQueue.indexOf(id);
  if (c >= 0) return { at: 'condQueue', slot: c };
  return { at: 'out' };
}

function sameSpot(a: Spot, b: Spot): boolean {
  if (a.at !== b.at) return false;
  if (a.at === 'lockQueue' && b.at === 'lockQueue') return a.slot === b.slot;
  if (a.at === 'condQueue' && b.at === 'condQueue') return a.slot === b.slot;
  return true;
}

export const waitAndSignalScene: ScenePlan<WaitAndSignalScene> = {
  initial(initialData: unknown): WaitAndSignalScene {
    const d = isRecord(initialData) ? initialData : {};
    const lock = typeof d['lock'] === 'string' ? d['lock'] : '';
    const cond = typeof d['cond'] === 'string' ? d['cond'] : '';
    const flagName = typeof d['flag'] === 'string' ? d['flag'] : '';
    const flag = d['flagStart'] === true;
    return {
      lock,
      cond,
      flagName,
      threads: readThreads(d['threads']),
      owner: null,
      lockQueue: [],
      condQueue: [],
      done: [],
      flag,
      checks: 0,
      step: null,
    };
  },

  reduce(scene: WaitAndSignalScene, event: FacetRuntimeEvent): WaitAndSignalScene {
    const p = event.payload;
    if (event.type === 'deadlock') {
      if (!isRecord(p) || typeof p['tick'] !== 'number') return scene;
      return { ...scene, step: { kind: 'deadlock', tick: p['tick'] } };
    }
    if (event.type !== 'tick' || !isRecord(p)) return scene;
    const tick = p['tick'];
    const thread = p['thread'];
    const line = p['line'];
    const kind = p['kind'];
    const other = p['other'];
    const owner = p['owner'];
    const lockQueue = stringList(p['lockQueue']);
    const condQueue = stringList(p['condQueue']);
    const done = stringList(p['done']);
    const flag = p['flag'];
    const checks = p['checks'];
    if (
      typeof tick !== 'number' ||
      typeof thread !== 'string' ||
      typeof line !== 'number' ||
      !isKind(kind) ||
      !(other === null || typeof other === 'string') ||
      !(owner === null || typeof owner === 'string') ||
      lockQueue === null ||
      condQueue === null ||
      done === null ||
      typeof flag !== 'boolean' ||
      typeof checks !== 'number'
    ) {
      return scene;
    }
    const next: WaitAndSignalScene = {
      ...scene,
      owner,
      lockQueue,
      condQueue,
      done,
      flag,
      checks,
      step: null,
    };
    // 자리를 옮긴 스레드마다 떠난 자리를 계기값으로 싣는다
    const moves: SceneMove[] = [];
    for (const th of scene.threads) {
      const from = spotOf(scene, th.id);
      if (!sameSpot(from, spotOf(next, th.id))) moves.push({ id: th.id, from });
    }
    next.step = { kind, tick, thread, line, other, moves };
    return next;
  },
};
