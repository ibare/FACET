/**
 * sixteen-milliseconds 의 장면.
 *
 * 바탕(init 이 한 번 정한다): 예산 · 박자 시각 · 단계 목록.
 * 자취(걸음이 쌓는다): 놓인 단계 막대 · 깎인 자리(cut) · 남은 시간 · 넘친 몫 · 박자에 나온 화면.
 * 이번 걸음(step): 무엇이 일어났는지와 흐를 운동의 계기값(from · leftBefore).
 *
 * 셈은 알고리즘이 한다. 장면은 payload 를 옮겨 이을 뿐이다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

export type SixteenMillisecondsBlock = { index: number; start: number; end: number };

export type SixteenMillisecondsStep =
  | { kind: 'start' }
  | { kind: 'stage'; index: number; from: number; to: number; leftBefore: number }
  | { kind: 'beat'; index: number; from: number; to: number; leftBefore: number; beat: number; done: number; ms: number }
  | { kind: 'late'; index: number; from: number; to: number; late: number; shownBeat: number; shownAt: number };

export type SixteenMillisecondsScene = {
  /** 바탕 — init 전에는 null */
  base: {
    budget: number;
    beats: number[];
    stages: { id: string; ms: number }[];
  } | null;
  /** 놓인 단계 막대 */
  blocks: SixteenMillisecondsBlock[];
  /** 예산에서 깎여 나간 끝 시각 (예산을 넘지 않는다) */
  cut: number;
  /** 남은 시간 (알고리즘이 셈한 값) */
  left: number;
  /** 넘친 몫 — 박자를 넘긴 단계가 끝난 뒤에만 */
  over: number | null;
  /** 박자가 왔을 때 — 그 박자 번호와 새로 나온 장 수 */
  arrived: { beat: number; newFrames: number } | null;
  /** 이 장이 나오는 박자 */
  shown: { beat: number; at: number } | null;
  step: SixteenMillisecondsStep;
};

function num(p: Record<string, unknown>, key: string, type: string): number {
  const v = p[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`sixteenMillisecondsScene: ${type} 의 ${key} 가 수가 아니다`);
  }
  return v;
}

function record(event: FacetRuntimeEvent): Record<string, unknown> {
  const p = event.payload;
  if (typeof p !== 'object' || p === null) {
    throw new Error(`sixteenMillisecondsScene: ${event.type} 에 payload 가 없다`);
  }
  return p as Record<string, unknown>;
}

function readStages(v: unknown): { id: string; ms: number }[] {
  if (!Array.isArray(v)) throw new Error('sixteenMillisecondsScene: init 의 stages 가 배열이 아니다');
  return v.map((s: unknown, i) => {
    if (typeof s !== 'object' || s === null) throw new Error(`sixteenMillisecondsScene: 단계 ${i} 가 객체가 아니다`);
    const r = s as Record<string, unknown>;
    if (typeof r.id !== 'string') throw new Error(`sixteenMillisecondsScene: 단계 ${i} 의 id 가 없다`);
    return { id: r.id, ms: num(r, 'ms', 'init') };
  });
}

function readBeats(v: unknown): number[] {
  if (!Array.isArray(v)) throw new Error('sixteenMillisecondsScene: init 의 beats 가 배열이 아니다');
  return v.map((b: unknown, i) => {
    if (typeof b !== 'number' || !Number.isFinite(b)) {
      throw new Error(`sixteenMillisecondsScene: 박자 ${i} 가 수가 아니다`);
    }
    return b;
  });
}

function withBase(scene: SixteenMillisecondsScene, type: string): NonNullable<SixteenMillisecondsScene['base']> {
  if (scene.base === null) throw new Error(`sixteenMillisecondsScene: init 전에 ${type} 가 왔다`);
  return scene.base;
}

export const sixteenMillisecondsScene: ScenePlan<SixteenMillisecondsScene> = {
  initial(): SixteenMillisecondsScene {
    return {
      base: null,
      blocks: [],
      cut: 0,
      left: 0,
      over: null,
      arrived: null,
      shown: null,
      step: { kind: 'start' },
    };
  },

  reduce(scene, event) {
    if (event.type === 'init') {
      const p = record(event);
      const budget = num(p, 'budget', 'init');
      return {
        base: { budget, beats: readBeats(p.beats), stages: readStages(p.stages) },
        blocks: [],
        cut: 0,
        left: budget,
        over: null,
        arrived: null,
        shown: null,
        step: { kind: 'start' },
      };
    }
    if (event.type === 'stage') {
      withBase(scene, 'stage');
      const p = record(event);
      const index = num(p, 'index', 'stage');
      const start = num(p, 'start', 'stage');
      const end = num(p, 'end', 'stage');
      return {
        ...scene,
        blocks: [...scene.blocks, { index, start, end }],
        cut: end,
        left: num(p, 'left', 'stage'),
        step: { kind: 'stage', index, from: start, to: end, leftBefore: scene.left },
      };
    }
    if (event.type === 'beat') {
      withBase(scene, 'beat');
      const p = record(event);
      const index = num(p, 'index', 'beat');
      const start = num(p, 'start', 'beat');
      const at = num(p, 'at', 'beat');
      const beat = num(p, 'beat', 'beat');
      return {
        ...scene,
        blocks: [...scene.blocks, { index, start, end: at }],
        cut: at,
        left: 0,
        arrived: { beat, newFrames: num(p, 'newFrames', 'beat') },
        step: {
          kind: 'beat',
          index,
          from: start,
          to: at,
          leftBefore: scene.left,
          beat,
          done: num(p, 'done', 'beat'),
          ms: num(p, 'ms', 'beat'),
        },
      };
    }
    if (event.type === 'late') {
      withBase(scene, 'late');
      const p = record(event);
      const index = num(p, 'index', 'late');
      const end = num(p, 'end', 'late');
      const last = scene.blocks[scene.blocks.length - 1];
      if (last === undefined || last.index !== index) {
        throw new Error(`sixteenMillisecondsScene: late 의 단계 ${index} 가 박자에서 멈춘 막대가 아니다`);
      }
      const late = num(p, 'late', 'late');
      const shownBeat = num(p, 'shownBeat', 'late');
      const shownAt = num(p, 'shownAt', 'late');
      return {
        ...scene,
        blocks: [...scene.blocks.slice(0, -1), { index, start: last.start, end }],
        over: late,
        shown: { beat: shownBeat, at: shownAt },
        step: { kind: 'late', index, from: last.end, to: end, late, shownBeat, shownAt },
      };
    }
    throw new Error(`sixteenMillisecondsScene: 모르는 이벤트 ${event.type}`);
  },
};
