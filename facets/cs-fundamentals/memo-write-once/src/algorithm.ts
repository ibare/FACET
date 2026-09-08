/**
 * memoWriteOnce — 한 번 푼 항은 표에 적고, 두 번째부터는 읽기만 한다.
 *
 * 정의대로 편 재귀 `f(k) = f(k-1) + f(k-2)` 를 그대로 돌린다. 다만 답을 얻은
 * 항은 `memo` 에 적고, 같은 항을 다시 만나면 아래로 뻗지 않고 표에서 읽는다.
 * 걸음은 이 재귀가 정한다 — 손으로 적은 걸음표가 아니다 (S-piece / C2).
 *
 * ── 이벤트 (전부 이 facet 고유 확장. type 은 리터럴)
 *
 * | type      | target        | payload                                              | silent |
 * | --------- | ------------- | ---------------------------------------------------- | ------ |
 * | `branch`  | `node:<id>`   | `{ id, n, depth, parentId: string \| null, side }`    | 아니오 |
 * | `resolve` | `node:<id>`   | `{ id, n, value }`                                    | 아니오 |
 * | `read`    | `node:<id>`   | `{ id, n, value }`                                    | 아니오 |
 * | `done`    | 없음          | `{ n, value, solved, reused }`                        | 아니오 |
 * | `rewind`  | 없음          | 없음                                                  | 아니오 |
 *
 * - `branch`  가지가 한 칸 뻗어 새 호출 자리가 생긴다. `side` 는 `'root' | 'L' | 'R'`.
 * - `resolve` 그 항의 답이 나왔다. 값이 표의 제 칸으로 **옮겨 가 적힌다**.
 * - `read`    이미 적힌 항이다. 값이 표에서 **되돌아 나와** 그 자리를 채우고,
 *             그 아래로는 아무것도 뻗지 않는다.
 * - `done`    `solved` / `reused` 는 셈해 둔 상수가 아니라 이 실행이 센 값이다.
 * - `rewind`  자동 재생이 끝난 뒤 `advance` 를 처음 눌렀을 때 화면을 비운다.
 *
 * ── 메트릭
 *
 * 없다. 조각은 셀 것이 없으므로 `ctx.metric` 을 부르지 않는다 (S-piece).
 *
 * ── 진행
 *
 * `mechanismKind: 'reactive'`. mount 하면 스스로 재생하고, 끝나면 `waitForInput`
 * 으로 `advance` 를 기다린다. 처음 누르면 되감고 첫 걸음까지 보인다 — 걸음의
 * 문(gate)이 emit 앞에 있으므로 되감기 직후의 첫 문만 그냥 통과시킨다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MemoWriteOnceData = {
  type: 'memo-write-once';
  /** 펼칠 항 — `f(n)` 을 정의대로 편다. */
  n: number;
  /** 걸음 사이 간격(ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

const DEFAULT_N = 5;
const DEFAULT_STEP_MS = 650;

/** 취소 신호를 예외로 올린다. reactive 메커니즘이 이 메시지를 조용히 삼킨다. */
function cancelled(): Error {
  return new Error('cancelled');
}

export async function memoWriteOnce(ctx: FacetContext<MemoWriteOnceData>): Promise<void> {
  const rc = ctx as ReactiveContext<MemoWriteOnceData>;
  const data = rc.data;
  const n = typeof data?.n === 'number' && data.n >= 2 ? Math.floor(data.n) : DEFAULT_N;
  const stepMs = typeof data?.stepMs === 'number' && data.stepMs > 0 ? data.stepMs : DEFAULT_STEP_MS;

  /** 'auto' 는 스스로 걸음을 떼고, 'manual' 은 advance 를 기다린다. */
  let mode: 'auto' | 'manual' = 'auto';
  /** 되감기 직후의 첫 문 하나만 그냥 통과시킨다. */
  let passOnce = false;

  async function gate(): Promise<void> {
    if (rc.cancelled) throw cancelled();
    if (mode === 'auto') {
      const ok = await rc.sleep(stepMs);
      if (!ok) throw cancelled();
      return;
    }
    if (passOnce) {
      passOnce = false;
      return;
    }
    await rc.waitForInput();
    if (rc.cancelled) throw cancelled();
  }

  async function play(): Promise<void> {
    const memo = new Map<number, number>();
    let seq = 0;
    let solved = 0;
    let reused = 0;

    async function visit(
      k: number,
      parentId: string | null,
      side: 'root' | 'L' | 'R',
      depth: number,
    ): Promise<number> {
      const id = `c${seq}`;
      seq += 1;

      await gate();
      await rc.emit({
        type: 'branch',
        target: `node:${id}`,
        payload: { id, n: k, depth, parentId, side },
      });

      const written = memo.get(k);
      if (written !== undefined) {
        reused += 1;
        await gate();
        await rc.emit({ type: 'read', target: `node:${id}`, payload: { id, n: k, value: written } });
        return written;
      }

      let value: number;
      if (k <= 1) {
        value = k;
      } else {
        const left = await visit(k - 1, id, 'L', depth + 1);
        const right = await visit(k - 2, id, 'R', depth + 1);
        value = left + right;
      }

      memo.set(k, value);
      solved += 1;
      await gate();
      await rc.emit({ type: 'resolve', target: `node:${id}`, payload: { id, n: k, value } });
      return value;
    }

    const answer = await visit(n, null, 'root', 0);
    await gate();
    await rc.emit({ type: 'done', payload: { n, value: answer, solved, reused } });
  }

  await play();

  // 자동 재생이 끝났다. 곱씹으며 읽고 싶은 사람을 위해 한 걸음씩 다시 짚는다.
  for (;;) {
    await rc.waitForInput();
    if (rc.cancelled) return;
    mode = 'manual';
    passOnce = true;
    await rc.emit({ type: 'rewind' });
    await play();
  }
}
