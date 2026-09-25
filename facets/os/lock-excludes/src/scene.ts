/**
 * lockExcludes 의 장면.
 *
 * 바탕 — 자물쇠 이름 · 스레드 · 프로그램 줄 (initial 이 initialData 에서 베낀다)
 * 자취 — 주인 · 줄 · 스레드마다 다음 줄 (걸음마다 알고리즘이 셈한 값을 그대로 옮긴다)
 * 이번 걸음 — step (누가 무엇을 실행했고 무엇이 건네졌나)
 *
 * 장면은 셈을 다시 돌리지 않는다. 주인 · 줄 · 다음 줄은 payload 가 준 값이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type LockStep =
  | { kind: 'take'; tick: number; who: string; line: number }
  | { kind: 'block'; tick: number; who: string; line: number }
  | { kind: 'work'; tick: number; who: string; line: number }
  | { kind: 'release'; tick: number; who: string; line: number; to: string | null };

export interface LockScene {
  lock: string;
  threads: readonly string[];
  program: readonly string[];
  owner: string | null;
  queue: readonly string[];
  pc: readonly number[];
  step: LockStep | null;
}

/** 스레드가 지금 어느 자리에 있는가 — 장면에서 곧바로 읽히는 분류 (셈이 아니라 읽기). */
export type LockPlace = 'ready' | 'queue' | 'seat' | 'done';

export function placeOf(scene: LockScene, index: number): LockPlace {
  const id = scene.threads[index];
  if (id === undefined) throw new Error(`lockExcludesScene: 없는 스레드 ${index}`);
  if (scene.owner === id) return 'seat';
  if (scene.queue.includes(id)) return 'queue';
  const pc = scene.pc[index];
  if (pc === undefined) throw new Error(`lockExcludesScene: ${id} 의 줄 번호가 없다`);
  return pc >= scene.program.length ? 'done' : 'ready';
}

function strings(v: unknown, what: string): string[] {
  if (!Array.isArray(v) || !v.every((x): x is string => typeof x === 'string')) {
    throw new Error(`lockExcludesScene: ${what} 가 글자 목록이 아니다`);
  }
  return [...v];
}

function numbers(v: unknown, what: string): number[] {
  if (!Array.isArray(v) || !v.every((x): x is number => typeof x === 'number')) {
    throw new Error(`lockExcludesScene: ${what} 가 수 목록이 아니다`);
  }
  return [...v];
}

function field(p: Record<string, unknown>, key: string): unknown {
  if (!(key in p)) throw new Error(`lockExcludesScene: payload 에 ${key} 가 없다`);
  return p[key];
}

function num(p: Record<string, unknown>, key: string): number {
  const v = field(p, key);
  if (typeof v !== 'number') throw new Error(`lockExcludesScene: ${key} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, key: string): string {
  const v = field(p, key);
  if (typeof v !== 'string') throw new Error(`lockExcludesScene: ${key} 가 글자가 아니다`);
  return v;
}

function strOrNull(p: Record<string, unknown>, key: string): string | null {
  const v = field(p, key);
  if (v !== null && typeof v !== 'string') throw new Error(`lockExcludesScene: ${key} 가 글자도 null 도 아니다`);
  return v;
}

export const lockExcludesScene: ScenePlan<LockScene> = {
  initial(initialData: unknown): LockScene {
    if (typeof initialData !== 'object' || initialData === null) {
      throw new Error('lockExcludesScene: initialData 가 없다');
    }
    const d = initialData as Record<string, unknown>;
    const lock = d['lock'];
    if (typeof lock !== 'string') throw new Error('lockExcludesScene: lock 이 글자가 아니다');
    const threads = strings(d['threads'], 'threads');
    const program = strings(d['program'], 'program');
    return {
      lock,
      threads,
      program,
      owner: null,
      queue: [],
      pc: threads.map(() => 0),
      step: null,
    };
  },

  reduce(scene: LockScene, event: FacetRuntimeEvent): LockScene {
    const kind = event.type;
    if (kind !== 'take' && kind !== 'block' && kind !== 'work' && kind !== 'release') return scene;
    if (typeof event.payload !== 'object' || event.payload === null) {
      throw new Error(`lockExcludesScene: ${kind} 에 payload 가 없다`);
    }
    const p = event.payload as Record<string, unknown>;
    const tick = num(p, 'tick');
    const who = str(p, 'who');
    const line = num(p, 'line');
    const owner = strOrNull(p, 'owner');
    const queue = strings(field(p, 'queue'), 'queue');
    const pc = numbers(field(p, 'pc'), 'pc');
    if (pc.length !== scene.threads.length) throw new Error('lockExcludesScene: pc 길이가 스레드 수와 다르다');
    const step: LockStep =
      kind === 'release'
        ? { kind, tick, who, line, to: strOrNull(p, 'to') }
        : { kind, tick, who, line };
    return { ...scene, owner, queue, pc, step };
  },
};
