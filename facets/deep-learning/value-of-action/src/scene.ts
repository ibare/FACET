/**
 * value-of-action 의 장면.
 *
 * 바탕 — 복도 · 끝 칸의 상 · 값이 붙는 자리 · 선택 · α · γ (initialData 에서 베낀다)
 * 자취 — 값 표 q (자리 × 선택). 갱신이 한 칸씩 고쳐 쌓는다
 * 이번 걸음 — step: 방금 한 갱신. 셈은 알고리즘이 했고 장면은 실어 온 값을 잇기만 한다
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import { readValueOfActionData, valueStates } from './algorithm.js';

export type ValueOfActionUpdate = {
  episode: number;
  index: number;
  total: number;
  state: string;
  action: string;
  next: string;
  terminal: boolean;
  reward: number;
  nextMax: number;
  nextBest: string | null;
  target: number;
  before: number;
  after: number;
  changed: number;
  best: string[];
};

export type ValueOfActionScene = {
  cells: string[];
  terminal: string[];
  /** 끝 칸의 상 — 그림이 상의 알을 그 높이에 놓는다 */
  terminalRewards: number[];
  states: string[];
  actions: string[];
  alpha: number;
  gamma: number;
  q: number[][];
  step: ValueOfActionUpdate | null;
};

function num(p: Record<string, unknown>, k: string): number {
  const v = p[k];
  if (typeof v !== 'number') throw new Error(`value-of-action 장면: ${k} 가 수가 아니다`);
  return v;
}

function str(p: Record<string, unknown>, k: string): string {
  const v = p[k];
  if (typeof v !== 'string') throw new Error(`value-of-action 장면: ${k} 가 글자가 아니다`);
  return v;
}

function readUpdate(raw: unknown): ValueOfActionUpdate {
  if (typeof raw !== 'object' || raw === null) throw new Error('value-of-action 장면: update 에 payload 가 없다');
  const p = raw as Record<string, unknown>;
  const nb = p.nextBest;
  if (nb !== null && typeof nb !== 'string') throw new Error('value-of-action 장면: nextBest 가 글자도 null 도 아니다');
  const best = p.best;
  if (!Array.isArray(best) || !best.every((b): b is string => typeof b === 'string')) {
    throw new Error('value-of-action 장면: best 가 글자 목록이 아니다');
  }
  if (typeof p.terminal !== 'boolean') throw new Error('value-of-action 장면: terminal 이 참거짓이 아니다');
  return {
    episode: num(p, 'episode'),
    index: num(p, 'index'),
    total: num(p, 'total'),
    state: str(p, 'state'),
    action: str(p, 'action'),
    next: str(p, 'next'),
    terminal: p.terminal,
    reward: num(p, 'reward'),
    nextMax: num(p, 'nextMax'),
    nextBest: nb,
    target: num(p, 'target'),
    before: num(p, 'before'),
    after: num(p, 'after'),
    changed: num(p, 'changed'),
    best: [...best],
  };
}

export const valueOfActionScene: ScenePlan<ValueOfActionScene> = {
  initial(initialData: unknown): ValueOfActionScene {
    const d = readValueOfActionData(initialData);
    const states = valueStates(d);
    return {
      cells: [...d.cells],
      terminal: [...d.terminal],
      terminalRewards: d.terminal.map((id) => {
        const r = d.rewards[id];
        if (r === undefined) throw new Error(`value-of-action 장면: 끝 칸 ${id} 의 상이 없다`);
        return r;
      }),
      states,
      actions: [...d.actions],
      alpha: d.alpha,
      gamma: d.gamma,
      q: states.map(() => d.actions.map(() => d.q0)),
      step: null,
    };
  },

  reduce(scene: ValueOfActionScene, event: FacetRuntimeEvent): ValueOfActionScene {
    if (event.type !== 'update') throw new Error(`value-of-action 장면: 모르는 이벤트 ${event.type}`);
    const u = readUpdate(event.payload);
    const si = scene.states.indexOf(u.state);
    const ai = scene.actions.indexOf(u.action);
    if (si < 0 || ai < 0) throw new Error(`value-of-action 장면: 표에 없는 칸 (${u.state}, ${u.action})`);
    const q = scene.q.map((row, i) => (i === si ? row.map((v, j) => (j === ai ? u.after : v)) : [...row]));
    return { ...scene, q, step: u };
  },
};
