/**
 * 뒤로 뛰면 반복 — 장면.
 *
 * 바탕: 프로그램과 만날 분기 수 (init 이 한 번 정한다)
 * 자취: 지금까지 만난 분기들 (짐작 · 결과 · 어디서 와서 어디로 갔는지)
 * 이번 걸음: 시작 · 분기 몇 번째 · 견줌
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';

import { jumpsBack } from './algorithm.js';

/** 방향 판정은 알고리즘의 것 하나를 쓴다 — 그림이 화살의 색과 휨을 고를 때. */
export { jumpsBack };

export type SceneOutcome = 'T' | 'N';

export type SceneInstruction = {
  op: string;
  args: string;
  label?: string;
  target?: number;
};

export type Encounter = {
  at: number;
  from: number;
  to: number;
  target: number;
  guess: SceneOutcome;
  outcome: SceneOutcome;
  /** 이 분기까지 BTFN 이 맞힌 수 (알고리즘이 셈한 것). */
  hits: number;
};

export type Tally = { total: number; btfn: number; alwaysN: number; alwaysT: number };

export type BackwardTakenStep =
  | { kind: 'start' }
  | { kind: 'branch'; index: number }
  | { kind: 'compare' };

export type BackwardTakenScene = {
  program: SceneInstruction[];
  total: number;
  trail: Encounter[];
  tally: Tally | null;
  step: BackwardTakenStep | null;
};

function copyProgram(raw: unknown): SceneInstruction[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const ins: SceneInstruction = { op: String(o.op ?? ''), args: String(o.args ?? '') };
    if (typeof o.label === 'string') ins.label = o.label;
    if (typeof o.target === 'number') ins.target = o.target;
    return ins;
  });
}

function asOutcome(v: unknown): SceneOutcome {
  return v === 'T' ? 'T' : 'N';
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** 자취 끝에서 흐름이 서 있는 주소. 아직 분기를 안 만났으면 0. */
export function standingAt(scene: BackwardTakenScene): number {
  const last = scene.trail[scene.trail.length - 1];
  return last ? last.to : 0;
}

export const backwardTakenScene: ScenePlan<BackwardTakenScene> = {
  initial(): BackwardTakenScene {
    return { program: [], total: 0, trail: [], tally: null, step: null };
  },
  reduce(scene: BackwardTakenScene, event: FacetRuntimeEvent): BackwardTakenScene {
    const p = (event.payload ?? {}) as Record<string, unknown>;
    if (event.type === 'init') {
      return {
        program: copyProgram(p.program),
        total: num(p.total),
        trail: [],
        tally: null,
        step: { kind: 'start' },
      };
    }
    if (event.type === 'branch') {
      const enc: Encounter = {
        at: num(p.at),
        from: num(p.from),
        to: num(p.to),
        target: num(p.target),
        guess: asOutcome(p.guess),
        outcome: asOutcome(p.outcome),
        hits: num(p.hits),
      };
      return {
        ...scene,
        trail: [...scene.trail, enc],
        step: { kind: 'branch', index: scene.trail.length },
      };
    }
    if (event.type === 'compare') {
      return {
        ...scene,
        tally: {
          total: num(p.total),
          btfn: num(p.btfn),
          alwaysN: num(p.alwaysN),
          alwaysT: num(p.alwaysT),
        },
        step: { kind: 'compare' },
      };
    }
    return scene;
  },
};
