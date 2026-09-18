/**
 * 지난 몇 번이 다음을 가리킨다 — 이력으로 칸을 찾는 분기 예측 표.
 *
 * 지난 두 결과(이력)가 표의 한 칸을 가리키고, 짐작은 그 칸의 1비트에서 나온다.
 * 결과를 본 뒤 그 칸에 결과를 적고, 이력은 뒤 한 자리에 결과를 이어 붙인 것이 된다.
 *
 *   짐작 = 표[이력]
 *   표[이력] ← 결과
 *   이력 ← (이력의 뒤 len-1 자리 + 결과)
 *
 * 이벤트 (모두 silent 아님 — 하나하나가 걸음이다):
 *
 *   init    { outcomes: Bit[]; history: Bit[]; initialBit: Bit }
 *           결과 열 · 처음 이력 · 칸의 처음 값. 첫 화면. 문 밖에서 곧바로 보낸다
 *   branch  { index: number; key: string; guess: Bit; outcome: Bit; hit: boolean; history: Bit[] }
 *           분기 하나. key 는 이 분기를 짐작할 때의 이력(칸 이름), guess 는 그 칸의 값,
 *           history 는 결과를 반영한 **뒤의** 이력. 칸에는 outcome 이 적힌다
 *   done    { miss: number; total: number; streak: number }
 *           틀린 수 · 분기 수 · 끝에서부터 잇달아 맞힌 수
 *
 * Bit = 'T' (탄다) | 'N' (안 탄다). 표시 이름은 문안이다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type Bit = 'T' | 'N';

export interface PatternFromHistoryFacetData {
  type: 'pattern-from-history';
  /** 분기 결과 열 — 걸음 하나가 분기 하나 */
  outcomes: Bit[];
  /** 처음 이력. 길이가 곧 이력 길이다 */
  history: Bit[];
  /** 표의 모든 칸이 처음에 갖는 값 */
  initialBit: Bit;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
}

/**
 * 이력 길이 len 의 모든 칸 이름. T 가 먼저 — len 2 면 TT · TN · NT · NN.
 * 장면이 같은 함수로 표의 칸을 세운다.
 */
export function historyKeys(len: number): string[] {
  let keys = [''];
  for (let d = 0; d < len; d += 1) {
    keys = keys.flatMap((k) => [`${k}T`, `${k}N`]);
  }
  return keys;
}

export async function patternFromHistory(ctx: FacetContext<PatternFromHistoryFacetData>): Promise<void> {
  const rc = ctx as ReactiveContext<PatternFromHistoryFacetData>;
  const { outcomes, history: start, initialBit, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (rc.cancelled) return false;
    return (await rc.sleep(stepMs)) && !rc.cancelled;
  }

  const table = new Map<string, Bit>(historyKeys(start.length).map((k) => [k, initialBit]));
  let history: Bit[] = [...start];

  await rc.emit({
    type: 'init',
    payload: { outcomes: [...outcomes], history: [...start], initialBit },
  });

  let miss = 0;
  let streak = 0;
  for (let index = 0; index < outcomes.length; index += 1) {
    if (!(await pause())) return;
    const outcome = outcomes[index];
    const key = history.join('');
    const guess = table.get(key) ?? initialBit;
    const hit = guess === outcome;
    if (hit) streak += 1;
    else {
      miss += 1;
      streak = 0;
    }
    table.set(key, outcome);
    history = [...history.slice(1), outcome];
    await rc.emit({
      type: 'branch',
      payload: { index, key, guess, outcome, hit, history: [...history] },
    });
  }

  if (!(await pause())) return;
  await rc.emit({ type: 'done', payload: { miss, total: outcomes.length, streak } });
}
