/**
 * match-from-back — 패턴을 뒤에서부터 견주는 일.
 *
 * 한 자리에 패턴을 놓고 **오른쪽 끝에서 왼쪽으로** 짚어 온다. 어긋나면 거기서
 * 멈추므로, 마지막 글자 하나가 어긋나는 자리는 앞을 한 글자도 읽지 않고 통째로
 * 날아간다.
 *
 * ── 이벤트 (facet 고유 확장, C2)
 *
 * | type     | payload                                            | silent |
 * | -------- | -------------------------------------------------- | ------ |
 * | `land`   | `{ shift: number }`                                | no     |
 * | `probe`  | `{ shift: number; patIndex: number; matched: boolean }` | no |
 * | `reject` | `{ shift: number; tailMatched: number; unread: number }` | no |
 * | `found`  | `{ shift: number }`                                | no     |
 * | `done`   | `{ comparisons: number; never: number }`           | no     |
 * | `rewind` | 없음                                                | no     |
 *
 * `target` 은 쓰지 않는다. 짚는 자리는 글의 인덱스와 패턴의 인덱스 두 축으로
 * 정해져서 `index:N` 하나로는 말이 되지 않는다 — payload 가 정규 경로다.
 *
 * ── 메트릭
 *
 * 없다. 조각이므로 `ctx.metric` 을 부르지 않는다 (S-piece). 견줌 횟수와 한 번도
 * 보지 않은 글자 수는 `done` 의 payload 로 화면 안에 남는다 — 재는 자리가 곧
 * 그림 안이다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type MatchFromBackData = {
  type: string;
  /** 훑을 글. */
  text: string;
  /** 찾을 패턴. */
  pattern: string;
  /**
   * 밟아 볼 자리들.
   *
   * **손으로 적은 배열이다.** S-piece 는 걸음표를 손으로 두르는 것을 막지만,
   * 여기는 그 예외에 해당한다 — 이 조각이 보이는 것은 "한 자리 안에서 뒤에서부터
   * 짚는 일" 이고, **어긋났을 때 얼마나 뛸지는 이 조각의 일이 아니다.** 건너뛰기
   * 규칙을 알고리즘에 넣으면 화면이 답하지 않는 질문을 코드가 주장하게 된다.
   * 그래서 어느 자리를 보일지는 저작 결정으로 선언에 두고, **한 자리 안의 순회는
   * 데이터가 정한다** (아래 while 루프).
   */
  shifts: number[];
  /** 걸음 사이의 정지 시간 (ms). 애니메이션이 끝난 뒤의 쉼이다 (S-piece). */
  stepMs: number;
};

export async function matchFromBackAlgorithm(
  ctx: FacetContext<MatchFromBackData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<MatchFromBackData>;
  const { text, pattern, shifts, stepMs } = ctx.data;

  /**
   * 걸음마다의 쉼.
   *
   * 캡션이 바뀌는 걸음(자리에 놓기 · 판정 · 셈)은 `stepMs` 를 거의 그대로 받아
   * 읽을 틈을 주고, 캡션이 그대로인 걸음(뒤에서부터 한 칸씩 짚기)은 짧게 지난다.
   * 짚는 걸음은 한 자리 안에서 최대 일곱 번 이어지므로, 그것마저 `stepMs` 를
   * 다 쓰면 한 자리를 보는 데만 여덟 걸음이 걸린다 (S-piece 걸음 벽시계).
   */
  const hold = {
    land: Math.round(stepMs * 0.65),
    probe: Math.round(stepMs * 0.25),
    verdict: Math.round(stepMs * 0.85),
    tally: Math.round(stepMs * 1.4),
  };

  /** 자동 재생이 끝난 뒤에는 걸음마다 `advance` 를 기다린다. */
  let manual = false;
  /** 첫 걸음은 문을 지나지 않는다 — 마운트 직후와 되감기 직후 (S-piece). */
  let doorOpen = true;

  /** 걸음 사이의 문. */
  async function gate(): Promise<boolean> {
    if (rctx.cancelled) return false;
    if (doorOpen) {
      doorOpen = false;
      return true;
    }
    if (!manual) return true;
    for (;;) {
      // 받은 것의 종류를 본다 — 위젯 입력이 걸음으로 세어지지 않게 (S-piece).
      const input = await rctx.waitForInput();
      if (input.type === 'advance') return true;
    }
  }

  /** 그림이 선 뒤의 쉼. 손으로 짚을 때는 문이 대신 기다리므로 쉬지 않는다. */
  async function rest(ms: number): Promise<boolean> {
    if (rctx.cancelled) return false;
    if (manual) return true;
    return rctx.sleep(ms);
  }

  async function run(): Promise<void> {
    const looked = new Set<number>();
    let comparisons = 0;

    for (const shift of shifts) {
      if (!(await gate())) return;
      await ctx.emit({ type: 'land', payload: { shift } });
      if (!(await rest(hold.land))) return;

      // 오른쪽 끝에서 왼쪽으로. 어긋나면 거기서 멈춘다.
      let j = pattern.length - 1;
      while (j >= 0) {
        const matched = pattern[j] === text[shift + j];
        comparisons += 1;
        looked.add(shift + j);
        if (!(await gate())) return;
        await ctx.emit({ type: 'probe', payload: { shift, patIndex: j, matched } });
        if (!(await rest(hold.probe))) return;
        if (!matched) break;
        j -= 1;
      }

      if (j < 0) {
        if (!(await gate())) return;
        await ctx.emit({ type: 'found', payload: { shift } });
        if (!(await rest(hold.verdict))) return;
        break;
      }

      if (!(await gate())) return;
      await ctx.emit({
        type: 'reject',
        payload: { shift, tailMatched: pattern.length - 1 - j, unread: j },
      });
      if (!(await rest(hold.verdict))) return;
    }

    if (!(await gate())) return;
    await ctx.emit({
      type: 'done',
      payload: { comparisons, never: text.length - looked.size },
    });
    await rest(hold.tally);
  }

  await run();

  // 자동 재생이 끝난 뒤 — 처음 누르는 `advance` 는 되감고 첫 걸음까지 보인다.
  for (;;) {
    if (ctx.cancelled) return;
    const input = await rctx.waitForInput();
    if (input.type !== 'advance') continue;
    await ctx.emit({ type: 'rewind' });
    manual = true;
    doorOpen = true;
    await run();
  }
}
