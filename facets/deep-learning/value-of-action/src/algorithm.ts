/**
 * value-of-action — (자리, 선택) 칸마다 붙는 값이 끝 칸의 상에서 거슬러 번진다.
 *
 * 판마다 주어진 선택의 차례를 따라 복도를 걷고, 전이 하나마다 Q-learning 의 벨만 갱신을
 * 한 번 한다. 고르는 법(탐험 · 활용)은 이 조각의 말이 아니다 — 차례는 데이터다.
 *
 *   Q(s,a) ← Q(s,a) + α · (r + γ · max_a′ Q(s′,a′) − Q(s,a))
 *   s′ 가 끝 칸이면 max_a′ Q(s′,a′) = 0
 *
 * 이벤트 (걸음 0 은 scene 의 initial() 이 initialData 에서 채운다. silent 이벤트 없음)
 *
 *   update  (걸음) — 전이 하나의 갱신. 값이 바뀌지 않아도(0 → 0) 걸음이다.
 *     payload {
 *       episode: number     판 번호 (1 부터)
 *       index: number       갱신 번호 (1 부터)
 *       total: number       갱신 전체 수
 *       state: string       자리 s
 *       action: string      선택 a
 *       next: string        다음 자리 s′
 *       terminal: boolean   s′ 가 끝 칸인가
 *       reward: number      상 r
 *       nextMax: number     max_a′ Q(s′,a′) (끝 칸이면 0)
 *       nextBest: string | null   그 최댓값을 가진 선택 (끝 칸이면 null. 동률이면 차례 앞)
 *       target: number      목표값 r + γ · nextMax
 *       before: number      갱신 전 Q(s,a)
 *       after: number       갱신 뒤 Q(s,a)
 *       changed: number     여기까지 값이 바뀐 갱신 수
 *       best: string[]      이 갱신 뒤 자리마다 더 큰 선택 (자리 차례. 동률이면 차례 앞)
 *     }
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ValueOfActionFacetData = {
  type: 'value-of-action';
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
  /** 복도 칸 식별자, 왼쪽부터 */
  cells: string[];
  /** 끝 칸 — 들어가면 판이 끝난다 */
  terminal: string[];
  /** 칸에 들어갈 때 받는 상. 칸마다 하나 */
  rewards: Record<string, number>;
  /** 선택 식별자, 동률을 가르는 차례 */
  actions: string[];
  /** 선택마다 몇 칸 움직이는가 (음수는 왼쪽) */
  moves: Record<string, number>;
  alpha: number;
  gamma: number;
  /** Q 초깃값 — 모든 (자리, 선택) 칸 */
  q0: number;
  /** 판마다 출발 자리 */
  start: string;
  /** 판마다 행위자가 한 선택의 차례 */
  episodes: string[][];
};

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function isNumberRecord(v: unknown): v is Record<string, number> {
  return (
    typeof v === 'object' &&
    v !== null &&
    Object.values(v as Record<string, unknown>).every((x) => typeof x === 'number')
  );
}

/** initialData 를 좁힌다. 모양이 틀리면 던진다. */
export function readValueOfActionData(raw: unknown): ValueOfActionFacetData {
  if (typeof raw !== 'object' || raw === null) throw new Error('value-of-action: 자료가 없다');
  const d = raw as Record<string, unknown>;
  if (d.type !== 'value-of-action') throw new Error(`value-of-action: 모르는 자료 종류 ${String(d.type)}`);
  if (typeof d.stepMs !== 'number') throw new Error('value-of-action: stepMs 가 수가 아니다');
  if (!isStringArray(d.cells) || d.cells.length === 0) throw new Error('value-of-action: cells 가 없다');
  if (!isStringArray(d.terminal)) throw new Error('value-of-action: terminal 이 없다');
  if (!isNumberRecord(d.rewards)) throw new Error('value-of-action: rewards 가 수의 표가 아니다');
  if (!isStringArray(d.actions) || d.actions.length === 0) throw new Error('value-of-action: actions 가 없다');
  if (!isNumberRecord(d.moves)) throw new Error('value-of-action: moves 가 수의 표가 아니다');
  if (typeof d.alpha !== 'number' || typeof d.gamma !== 'number') {
    throw new Error('value-of-action: alpha · gamma 가 수가 아니다');
  }
  if (typeof d.q0 !== 'number') throw new Error('value-of-action: q0 가 수가 아니다');
  if (typeof d.start !== 'string') throw new Error('value-of-action: start 가 없다');
  if (!Array.isArray(d.episodes) || !d.episodes.every(isStringArray)) {
    throw new Error('value-of-action: episodes 가 선택 목록의 목록이 아니다');
  }
  const cells = d.cells;
  for (const id of d.terminal) {
    if (!cells.includes(id)) throw new Error(`value-of-action: 끝 칸 ${id} 가 복도에 없다`);
  }
  for (const a of d.actions) {
    if (typeof d.moves[a] !== 'number') throw new Error(`value-of-action: 선택 ${a} 의 이동이 없다`);
  }
  return {
    type: 'value-of-action',
    stepMs: d.stepMs,
    cells: [...cells],
    terminal: [...d.terminal],
    rewards: { ...d.rewards },
    actions: [...d.actions],
    moves: { ...d.moves },
    alpha: d.alpha,
    gamma: d.gamma,
    q0: d.q0,
    start: d.start,
    episodes: d.episodes.map((e) => [...e]),
  };
}

/** 값이 붙는 자리 — 끝 칸이 아닌 칸, 복도 차례대로. 장면 · 그림도 이것을 부른다. */
export function valueStates(data: Pick<ValueOfActionFacetData, 'cells' | 'terminal'>): string[] {
  return data.cells.filter((c) => !data.terminal.includes(c));
}

/** 한 행에서 가장 큰 값의 선택 번호. 동률이면 차례 앞. */
export function bestIndex(row: readonly number[]): number {
  if (row.length === 0) throw new Error('value-of-action: 선택이 없는 자리');
  let best = 0;
  for (let i = 1; i < row.length; i += 1) {
    if (row[i]! > row[best]!) best = i;
  }
  return best;
}

export async function valueOfAction(context: FacetContext<ValueOfActionFacetData>): Promise<void> {
  const ctx = context as ReactiveContext<ValueOfActionFacetData>;
  const data = readValueOfActionData(ctx.data);
  const { cells, terminal, rewards, actions, moves, alpha, gamma, stepMs } = data;
  const states = valueStates(data);
  const q: number[][] = states.map(() => actions.map(() => data.q0));
  const total = data.episodes.reduce((n, e) => n + e.length, 0);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  function stateIndex(id: string): number {
    const i = states.indexOf(id);
    if (i < 0) throw new Error(`value-of-action: ${id} 는 값이 붙는 자리가 아니다`);
    return i;
  }

  // 걸음 0(여섯 값이 0 인 표)이 이미 읽을 화면이라 첫 발신 앞에 한 번 머문다.
  if (!(await pause())) return;

  let index = 0;
  let changed = 0;
  for (let e = 0; e < data.episodes.length; e += 1) {
    if (ctx.cancelled) return;
    const choices = data.episodes[e]!;
    let here = data.start;
    for (let k = 0; k < choices.length; k += 1) {
      if (ctx.cancelled) return;
      const action = choices[k]!;
      const ai = actions.indexOf(action);
      if (ai < 0) throw new Error(`value-of-action: 판 ${e + 1} 의 모르는 선택 ${action}`);
      const si = stateIndex(here);
      const move = moves[action];
      if (move === undefined) throw new Error(`value-of-action: 선택 ${action} 의 이동이 없다`);
      const to = cells.indexOf(here) + move;
      const next = cells[to];
      if (next === undefined) throw new Error(`value-of-action: ${here} 에서 ${action} 은 복도 밖이다`);
      const isEnd = terminal.includes(next);
      const isLastChoice = k === choices.length - 1;
      if (isEnd !== isLastChoice) {
        throw new Error(`value-of-action: 판 ${e + 1} 이 끝 칸에서 끝나지 않는다 (${next})`);
      }
      const reward = rewards[next];
      if (reward === undefined) throw new Error(`value-of-action: 칸 ${next} 의 상이 없다`);
      let nextMax = 0;
      let nextBest: string | null = null;
      if (!isEnd) {
        const row = q[stateIndex(next)]!;
        const b = bestIndex(row);
        nextMax = row[b]!;
        nextBest = actions[b]!;
      }
      const target = reward + gamma * nextMax;
      const before = q[si]![ai]!;
      const after = before + alpha * (target - before);
      q[si]![ai] = after;
      index += 1;
      if (after !== before) changed += 1;
      const best = q.map((row) => actions[bestIndex(row)]!);

      if (index > 1 && !(await pause())) return;
      await ctx.emit({
        type: 'update',
        payload: {
          episode: e + 1,
          index,
          total,
          state: here,
          action,
          next,
          terminal: isEnd,
          reward,
          nextMax,
          nextBest,
          target,
          before,
          after,
          changed,
          best,
        },
      });
      here = next;
    }
  }
}
