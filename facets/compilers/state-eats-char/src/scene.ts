/**
 * state-eats-char 의 장면.
 *
 * 바탕 — 기계(시작 · 옮김 · 받는 자리)와 입력 글줄. initial() 이 initialData 에서 베낀다.
 * 자취 — 먹은 글자 수(pos) · 지금 자리(at) · 밟은 자리(trail) · 지난 옮김(walked).
 * 이번 걸음 — step: 방금 먹은 글자와 옮김, 그 자리에서 나가던 길들.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  narrowStateEatsCharData,
  type AcceptMark,
  type MachineEdge,
} from './algorithm.js';

export type EatStep = {
  index: number;
  ch: string;
  from: string;
  to: string;
  outs: string[];
};

export type StateEatsCharScene = {
  base: {
    start: string;
    edges: MachineEdge[];
    accept: AcceptMark[];
    input: string[];
  };
  /** 먹은 글자 수 — 남은 입력은 input.slice(pos) */
  pos: number;
  at: string;
  trail: string[];
  /** 지나간 옮김의 자리 (base.edges 의 번호) */
  walked: number[];
  step: EatStep | null;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function narrowEat(payload: unknown): EatStep {
  if (!isRecord(payload)) throw new Error('state-eats-char: eat payload 가 객체가 아니다');
  const { index, ch, from, to, outs } = payload;
  if (typeof index !== 'number' || !Number.isInteger(index)) {
    throw new Error('state-eats-char: eat.index 가 정수가 아니다');
  }
  if (typeof ch !== 'string' || typeof from !== 'string' || typeof to !== 'string') {
    throw new Error('state-eats-char: eat 의 ch · from · to 가 문자열이 아니다');
  }
  if (!Array.isArray(outs) || !outs.every((o): o is string => typeof o === 'string')) {
    throw new Error('state-eats-char: eat.outs 가 문자열 배열이 아니다');
  }
  return { index, ch, from, to, outs: [...outs] };
}

export const stateEatsCharScene: ScenePlan<StateEatsCharScene> = {
  initial(initialData: unknown): StateEatsCharScene {
    const data = narrowStateEatsCharData(initialData);
    return {
      base: {
        start: data.start,
        edges: data.edges.map((e) => ({ ...e })),
        accept: data.accept.map((a) => ({ ...a })),
        input: [...data.input],
      },
      pos: 0,
      at: data.start,
      trail: [data.start],
      walked: [],
      step: null,
    };
  },

  reduce(scene: StateEatsCharScene, event: FacetRuntimeEvent): StateEatsCharScene {
    if (event.type !== 'eat') {
      throw new Error(`state-eats-char: 모르는 이벤트 ${event.type}`);
    }
    const step = narrowEat(event.payload);
    if (step.index !== scene.pos) {
      throw new Error(`state-eats-char: 먹을 자리는 ${scene.pos} 인데 ${step.index} 가 왔다`);
    }
    if (step.from !== scene.at) {
      throw new Error(`state-eats-char: 지금 자리는 ${scene.at} 인데 ${step.from} 에서 옮겼다`);
    }
    if (scene.base.input[step.index] !== step.ch) {
      throw new Error(`state-eats-char: 자리 ${step.index} 의 글자가 ${step.ch} 가 아니다`);
    }
    const edgeIndex = scene.base.edges.findIndex(
      (e) => e.from === step.from && e.ch === step.ch && e.to === step.to,
    );
    if (edgeIndex < 0) {
      throw new Error(`state-eats-char: 옮김 ${step.from} -${step.ch}-> ${step.to} 가 기계에 없다`);
    }
    return {
      base: scene.base,
      pos: scene.pos + 1,
      at: step.to,
      trail: [...scene.trail, step.to],
      walked: [...scene.walked, edgeIndex],
      step,
    };
  },
};
