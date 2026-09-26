/**
 * stateActionRewardScene — act · transition 을 장면으로 잇는다.
 *
 * 바탕(격자 · 출발 · 목표 · 정책표 · 미끄러짐 확률)은 initialData 에서 베낀다.
 * 자취는 궤적 칸들이고, 이번 걸음은 넘긴 행동 또는 돌아온 다음 자리 · 상이다.
 * 셈은 하지 않는다 — 다음 자리 · 미끄러짐 판정 · 상은 이벤트가 싣고 온다.
 */
import type { FacetRuntimeEvent, ScenePlan } from '@ffacet/core/runtime';
import {
  asAction,
  asCell,
  asNumber,
  asRecord,
  readStateActionRewardData,
  type ActionId,
  type Cell,
} from './algorithm.js';

export type Outcome = 'intended' | 'left' | 'right';

export type SarBase = {
  rows: number;
  cols: number;
  start: Cell;
  goal: Cell;
  policy: { s: Cell; action: ActionId }[];
  slip: { intended: number; left: number; right: number };
  /** 궤적이 가장 길어질 수 있는 칸 수 — 주사위 수 */
  maxLen: number;
};

export type SarEntry = {
  t: number;
  s: Cell;
  action: ActionId;
  reward: number;
  outcome: Outcome;
  next: Cell;
};

export type SarStep =
  | { kind: 'start' }
  | { kind: 'act'; t: number; s: Cell; action: ActionId }
  | {
      kind: 'transition';
      t: number;
      s: Cell;
      action: ActionId;
      u: number;
      outcome: Outcome;
      actual: ActionId;
      next: Cell;
      bumped: boolean;
      reward: number;
      terminal: boolean;
      repeat: { t: number; next: Cell } | null;
    };

export type StateActionRewardScene = {
  base: SarBase;
  /** 행위자가 지금 보는 자리이자 격자 위의 자리 */
  pos: Cell;
  trajectory: SarEntry[];
  done: boolean;
  step: SarStep;
};

function toOutcome(v: unknown): Outcome {
  if (v === 'intended' || v === 'left' || v === 'right') return v;
  throw new Error(`stateActionRewardScene: 모르는 판정 ${String(v)}`);
}

const num = asNumber;
const toCell = asCell;
const toAction = asAction;
const rec = (v: unknown): Record<string, unknown> => asRecord(v, 'payload');

/** initialData 를 바탕으로 좁힌다 — 알고리즘의 좁히개를 그대로 부른다 */
export function readBase(initialData: unknown): SarBase {
  const d = readStateActionRewardData(initialData);
  return {
    rows: d.rows,
    cols: d.cols,
    start: [d.start[0], d.start[1]],
    goal: [d.goal[0], d.goal[1]],
    policy: d.policy.map((p) => ({ s: [p.s[0], p.s[1]] as Cell, action: p.action })),
    slip: { ...d.slip },
    maxLen: d.dice.length,
  };
}

export const stateActionRewardScene: ScenePlan<StateActionRewardScene> = {
  initial(initialData: unknown): StateActionRewardScene {
    const base = readBase(initialData);
    return {
      base,
      pos: [base.start[0], base.start[1]],
      trajectory: [],
      done: false,
      step: { kind: 'start' },
    };
  },

  reduce(scene: StateActionRewardScene, event: FacetRuntimeEvent): StateActionRewardScene {
    if (event.type === 'act') {
      const p = rec(event.payload);
      return {
        ...scene,
        step: { kind: 'act', t: num(p.t, 't'), s: toCell(p.s, 's'), action: toAction(p.action) },
      };
    }
    if (event.type === 'transition') {
      const p = rec(event.payload);
      const next = toCell(p.next, 'next');
      const repeatRaw = p.repeat;
      let repeat: { t: number; next: Cell } | null = null;
      if (repeatRaw !== null) {
        const r = rec(repeatRaw);
        repeat = { t: num(r.t, 'repeat.t'), next: toCell(r.next, 'repeat.next') };
      }
      if (typeof p.bumped !== 'boolean' || typeof p.terminal !== 'boolean') {
        throw new Error('stateActionRewardScene: bumped · terminal 이 참거짓이 아니다');
      }
      const step: SarStep = {
        kind: 'transition',
        t: num(p.t, 't'),
        s: toCell(p.s, 's'),
        action: toAction(p.action),
        u: num(p.u, 'u'),
        outcome: toOutcome(p.outcome),
        actual: toAction(p.actual),
        next,
        bumped: p.bumped,
        reward: num(p.reward, 'reward'),
        terminal: p.terminal,
        repeat,
      };
      return {
        ...scene,
        pos: [next[0], next[1]],
        trajectory: [
          ...scene.trajectory,
          { t: step.t, s: step.s, action: step.action, reward: step.reward, outcome: step.outcome, next },
        ],
        done: step.terminal,
        step,
      };
    }
    throw new Error(`stateActionRewardScene: 모르는 이벤트 ${event.type}`);
  },
};
