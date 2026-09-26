/**
 * stateActionReward — 행위자와 환경이 반씩 주고받는 한 판.
 *
 * 행위자는 지금 자리만 보고 정책표에서 행동 하나를 골라 환경에 넘긴다. 환경은 주사위
 * 하나로 실제로 갈 방향을 정하고, 다음 자리와 상을 행위자에게 되돌려준다. 정책표는
 * 정해진 것이라 배우지 않는다. 다음 자리는 지금 자리 · 행동 · 주사위만으로 정해진다.
 *
 * 이벤트 (모두 걸음이다 — silent 없음):
 *
 *   act         행위자가 행동을 넘긴다 (홀수 걸음)
 *     payload { t: number; s: [number, number]; action: ActionId }
 *
 *   transition  환경이 다음 자리와 상을 돌려준다 (짝수 걸음)
 *     payload {
 *       t: number;                        // 몇 번째 주고받기인가 (0 부터)
 *       s: [number, number];              // 지금 자리
 *       action: ActionId;                 // 넘겨받은 행동
 *       u: number;                        // 주사위
 *       outcome: 'intended' | 'left' | 'right';  // 뜻대로 · 왼쪽으로 돈 방향 · 오른쪽으로 돈 방향
 *       actual: ActionId;                 // 실제 방향
 *       next: [number, number];           // 다음 자리
 *       bumped: boolean;                  // 격자 밖이라 제자리에 남았는가
 *       reward: number;                   // 상
 *       terminal: boolean;                // 목표에 들었는가
 *       repeat: { t: number; next: [number, number] } | null;
 *                                         // 앞서 같은 (자리, 행동) 을 넘긴 적이 있으면 그때의 차례와 다음 자리
 *     }
 *
 * 자취를 더하거나 할인하지 않는다 — 합은 이 조각의 말이 아니다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ActionId = 'up' | 'down' | 'left' | 'right';
export type Cell = [number, number];

export type StateActionRewardFacetData = {
  type: 'state-action-reward';
  stepMs: number;
  rows: number;
  cols: number;
  start: Cell;
  goal: Cell;
  /** 행위자가 가진 정책표 — 자리 → 행동 */
  policy: { s: Cell; action: ActionId }[];
  /** 환경이 가진 미끄러짐 — 뜻한 방향 · 왼쪽으로 돈 방향 · 오른쪽으로 돈 방향의 확률 */
  slip: { intended: number; left: number; right: number };
  /** 환경이 가진 상 — 목표에 들어가는 이동 · 그 밖의 이동 */
  rewards: { goal: number; move: number };
  /** 행동마다 하나씩, 차례대로 */
  dice: number[];
};

export const ACTIONS: readonly ActionId[] = ['up', 'down', 'left', 'right'];

const DELTA: Record<ActionId, Cell> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};

const LEFT_OF: Record<ActionId, ActionId> = { up: 'left', left: 'down', down: 'right', right: 'up' };
const RIGHT_OF: Record<ActionId, ActionId> = { up: 'right', right: 'down', down: 'left', left: 'up' };

export function isAction(v: unknown): v is ActionId {
  return typeof v === 'string' && (ACTIONS as readonly string[]).includes(v);
}

/** 뜻한 방향에서 왼쪽으로 돈 방향 */
export function turnLeft(a: ActionId): ActionId {
  return LEFT_OF[a];
}

/** 뜻한 방향에서 오른쪽으로 돈 방향 */
export function turnRight(a: ActionId): ActionId {
  return RIGHT_OF[a];
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function inGrid(c: Cell, rows: number, cols: number): boolean {
  return c[0] >= 0 && c[0] < rows && c[1] >= 0 && c[1] < cols;
}

/** 방향으로 한 칸 — 격자 밖이어도 그대로 돌려준다 (벽 판정은 부르는 쪽) */
export function stepToward(c: Cell, a: ActionId): Cell {
  const d = DELTA[a];
  return [c[0] + d[0], c[1] + d[1]];
}

/** 주사위로 실제 방향을 정한다. 문턱에 딱 걸리면 던진다 */
export function resolveDie(
  u: number,
  slip: StateActionRewardFacetData['slip'],
): 'intended' | 'left' | 'right' {
  const edge1 = slip.intended;
  const edge2 = slip.intended + slip.left;
  if (!(u >= 0 && u < 1)) throw new Error(`stateActionReward: 주사위 ${u} 가 [0, 1) 밖이다`);
  if (u === edge1 || u === edge2) {
    throw new Error(`stateActionReward: 주사위 ${u} 가 문턱에 딱 걸렸다`);
  }
  if (u < edge1) return 'intended';
  if (u < edge2) return 'left';
  return 'right';
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** 좁히개 — 장면도 같은 것을 부른다 (규칙이 두 벌이 되지 않게) */
export function asRecord(v: unknown, what: string): Record<string, unknown> {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  throw new Error(`stateActionReward: ${what} 가 객체가 아니다`);
}

export function asNumber(v: unknown, what: string): number {
  if (isNum(v)) return v;
  throw new Error(`stateActionReward: ${what} 가 수가 아니다`);
}

export function asCell(v: unknown, what: string): Cell {
  if (Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1])) return [v[0], v[1]];
  throw new Error(`stateActionReward: ${what} 가 자리 꼴이 아니다`);
}

export function asAction(v: unknown): ActionId {
  if (isAction(v)) return v;
  throw new Error(`stateActionReward: 모르는 행동 식별자 ${String(v)}`);
}

function asCount(v: unknown, what: string): number {
  const n = asNumber(v, what);
  if (!Number.isInteger(n) || n < 1) throw new Error(`stateActionReward: ${what} 가 양의 정수가 아니다 (${n})`);
  return n;
}

/** initialData 를 좁힌다. 모양이 어긋나면 던진다 */
export function readStateActionRewardData(raw: unknown): StateActionRewardFacetData {
  const d = asRecord(raw, 'initialData');
  if (d.type !== 'state-action-reward') throw new Error(`stateActionReward: type 이 다르다 (${String(d.type)})`);
  const slip = asRecord(d.slip, 'slip');
  const rewards = asRecord(d.rewards, 'rewards');
  if (!Array.isArray(d.policy)) throw new Error('stateActionReward: 정책표가 배열이 아니다');
  if (!Array.isArray(d.dice)) throw new Error('stateActionReward: 주사위가 배열이 아니다');
  const rows = asCount(d.rows, 'rows');
  const cols = asCount(d.cols, 'cols');
  const start = asCell(d.start, 'start');
  const goal = asCell(d.goal, 'goal');
  if (!inGrid(start, rows, cols)) throw new Error('stateActionReward: 출발이 격자 밖이다');
  if (!inGrid(goal, rows, cols)) throw new Error('stateActionReward: 목표가 격자 밖이다');
  const policy = d.policy.map((p, i) => {
    const r = asRecord(p, `policy[${i}]`);
    const s = asCell(r.s, `policy[${i}].s`);
    if (!inGrid(s, rows, cols)) throw new Error(`stateActionReward: 정책표의 자리 (${s[0]},${s[1]}) 가 격자 밖이다`);
    return { s, action: asAction(r.action) };
  });
  const slipOut = {
    intended: asNumber(slip.intended, 'slip.intended'),
    left: asNumber(slip.left, 'slip.left'),
    right: asNumber(slip.right, 'slip.right'),
  };
  const sum = slipOut.intended + slipOut.left + slipOut.right;
  if (Math.abs(sum - 1) > 1e-9) throw new Error(`stateActionReward: 미끄러짐 확률의 합이 1 이 아니다 (${sum})`);
  const dice = d.dice.map((u, i) => asNumber(u, `dice[${i}]`));
  if (dice.length === 0) throw new Error('stateActionReward: 주사위가 없다');
  return {
    type: 'state-action-reward',
    stepMs: asNumber(d.stepMs, 'stepMs'),
    rows,
    cols,
    start,
    goal,
    policy,
    slip: slipOut,
    rewards: { goal: asNumber(rewards.goal, 'rewards.goal'), move: asNumber(rewards.move, 'rewards.move') },
    dice,
  };
}

export function policyAt(data: StateActionRewardFacetData, s: Cell): ActionId {
  const row = data.policy.find((p) => sameCell(p.s, s));
  if (!row) throw new Error(`stateActionReward: 정책표에 자리 (${s[0]},${s[1]}) 가 없다`);
  if (!isAction(row.action)) {
    throw new Error(`stateActionReward: 모르는 행동 식별자 ${String(row.action)}`);
  }
  return row.action;
}

export async function stateActionReward(context: FacetContext<StateActionRewardFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<StateActionRewardFacetData>;
  const data = readStateActionRewardData(ctx.data);
  const { stepMs, rows, cols, goal, slip, rewards, dice } = data;

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  let s: Cell = [data.start[0], data.start[1]];
  const past: { s: Cell; action: ActionId; next: Cell }[] = [];

  for (let t = 0; t < dice.length; t += 1) {
    // 걸음 0 은 격자 · 정책표가 이미 읽을 것이라 첫 발신 앞에도 머문다
    if (!(await pause())) return;
    if (sameCell(s, goal)) throw new Error(`stateActionReward: 목표에 든 뒤에도 주사위가 남았다 (${t})`);

    const action = policyAt(data, s);
    await ctx.emit({ type: 'act', payload: { t, s: [s[0], s[1]], action } });

    if (!(await pause())) return;

    const u = dice[t]!;
    const outcome = resolveDie(u, slip);
    const actual = outcome === 'intended' ? action : outcome === 'left' ? turnLeft(action) : turnRight(action);
    const moved = stepToward(s, actual);
    const bumped = !inGrid(moved, rows, cols);
    const next: Cell = bumped ? [s[0], s[1]] : moved;
    const terminal = sameCell(next, goal);
    const reward = terminal ? rewards.goal : rewards.move;
    const earlier = past.find((p) => sameCell(p.s, s) && p.action === action);
    const repeat = earlier
      ? { t: past.indexOf(earlier), next: [earlier.next[0], earlier.next[1]] as Cell }
      : null;

    await ctx.emit({
      type: 'transition',
      payload: {
        t,
        s: [s[0], s[1]],
        action,
        u,
        outcome,
        actual,
        next: [next[0], next[1]],
        bumped,
        reward,
        terminal,
        repeat,
      },
    });

    past.push({ s: [s[0], s[1]], action, next: [next[0], next[1]] });
    s = next;
  }

  if (!sameCell(s, goal)) {
    throw new Error(`stateActionReward: 주사위를 다 썼는데 목표에 들지 않았다 (${s[0]},${s[1]})`);
  }
}
