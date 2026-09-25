/**
 * non-atomic-increment 장면.
 *
 * 바탕 — 스레드 · 기억 자리 이름 · 레지스터 이름 · 겉의 한 줄 · 펼친 줄 (initialData 에서 베낀다)
 * 자취 — 펼쳤는가 · 줄마다의 종류 · 틈 수 · 지금 줄 · 두 곳의 값 · 서로 다른가
 * 이번 걸음 — step (운동을 고르는 데 쓰는 계기값을 함께 싣는다)
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type MicroKind = 'load' | 'add' | 'store';

export type NonAtomicIncrementStep =
  | { kind: 'unfold' }
  | { kind: 'load'; index: number }
  | { kind: 'add'; index: number; was: number }
  | { kind: 'store'; index: number; was: number };

export type NonAtomicIncrementScene = {
  thread: string;
  memoryName: string;
  registerName: string;
  line: string;
  steps: string[];
  unfolded: boolean;
  kinds: MicroKind[];
  gaps: number;
  /** 방금 실행한 펼친 줄. 아직 없으면 -1 */
  current: number;
  memory: number;
  /** 비었으면 null */
  register: number | null;
  differ: boolean;
  step: NonAtomicIncrementStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function needString(rec: Record<string, unknown>, key: string): string {
  const v = rec[key];
  if (typeof v !== 'string') throw new Error(`non-atomic-increment 장면: ${key} 가 글자가 아니다`);
  return v;
}

function needNumber(rec: Record<string, unknown>, key: string): number {
  const v = rec[key];
  if (typeof v !== 'number') throw new Error(`non-atomic-increment 장면: ${key} 가 수가 아니다`);
  return v;
}

function needBoolean(rec: Record<string, unknown>, key: string): boolean {
  const v = rec[key];
  if (typeof v !== 'boolean') throw new Error(`non-atomic-increment 장면: ${key} 가 참거짓이 아니다`);
  return v;
}

function isKind(v: unknown): v is MicroKind {
  return v === 'load' || v === 'add' || v === 'store';
}

type Values = { index: number; memory: number; register: number; differ: boolean };

function readValues(payload: unknown): Values {
  if (!isRecord(payload)) throw new Error('non-atomic-increment 장면: payload 가 없다');
  return {
    index: needNumber(payload, 'index'),
    memory: needNumber(payload, 'memory'),
    register: needNumber(payload, 'register'),
    differ: needBoolean(payload, 'differ'),
  };
}

export const nonAtomicIncrementScene: ScenePlan<NonAtomicIncrementScene> = {
  initial(initialData: unknown): NonAtomicIncrementScene {
    if (!isRecord(initialData)) throw new Error('non-atomic-increment 장면: initialData 가 없다');
    const rawSteps = initialData['steps'];
    if (!Array.isArray(rawSteps) || !rawSteps.every((s): s is string => typeof s === 'string')) {
      throw new Error('non-atomic-increment 장면: steps 가 글자 목록이 아니다');
    }
    return {
      thread: needString(initialData, 'thread'),
      memoryName: needString(initialData, 'memory'),
      registerName: needString(initialData, 'register'),
      line: needString(initialData, 'line'),
      steps: [...rawSteps],
      unfolded: false,
      kinds: [],
      gaps: 0,
      current: -1,
      memory: needNumber(initialData, 'start'),
      register: null,
      differ: false,
      step: null,
    };
  },

  reduce(scene: NonAtomicIncrementScene, event: FacetRuntimeEvent): NonAtomicIncrementScene {
    switch (event.type) {
      case 'unfold': {
        const p = event.payload;
        if (!isRecord(p)) throw new Error('non-atomic-increment 장면: unfold payload 가 없다');
        const kinds = p['kinds'];
        if (!Array.isArray(kinds) || !kinds.every(isKind)) {
          throw new Error('non-atomic-increment 장면: unfold 의 kinds 를 모른다');
        }
        return {
          ...scene,
          unfolded: true,
          kinds: [...kinds],
          gaps: needNumber(p, 'gaps'),
          step: { kind: 'unfold' },
        };
      }
      case 'load': {
        const v = readValues(event.payload);
        return {
          ...scene,
          current: v.index,
          memory: v.memory,
          register: v.register,
          differ: v.differ,
          step: { kind: 'load', index: v.index },
        };
      }
      case 'add': {
        const v = readValues(event.payload);
        if (scene.register === null) throw new Error('non-atomic-increment 장면: 빈 레지스터에 더했다');
        return {
          ...scene,
          current: v.index,
          memory: v.memory,
          register: v.register,
          differ: v.differ,
          step: { kind: 'add', index: v.index, was: scene.register },
        };
      }
      case 'store': {
        const v = readValues(event.payload);
        return {
          ...scene,
          current: v.index,
          memory: v.memory,
          register: v.register,
          differ: v.differ,
          step: { kind: 'store', index: v.index, was: scene.memory },
        };
      }
      default:
        return scene;
    }
  },
};
