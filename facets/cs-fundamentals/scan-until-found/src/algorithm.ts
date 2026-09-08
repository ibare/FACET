/**
 * scanUntilFound — 순차 탐색 조각(piece).
 *
 * 같은 눈길이 같은 줄을 두 번 지나간다. 한 번은 도중에 딱 멎고, 한 번은 오른쪽
 * 끝을 지나 줄 밖으로 빠져나간다. 지나간 자취가 아래에 나란히 남아 두 길이를
 * 견줄 수 있다 — 그 **길이 차이**가 이 조각이 하려는 말 전부다.
 *
 * 줄이 서 있지 않으므로 중간에 포기할 근거가 없다. 그래서 "없다" 고 답하려면
 * 반드시 끝까지 봐야 한다.
 *
 * ── 식별자
 *   index:<i>   줄의 i 번째 칸
 *
 * ── 이벤트 (전부 step boundary — silent 없음)
 *   scan-begin  { pass: number; target: number }
 *               새 훑기가 시작된다. 칸 표시가 지워지고 눈길이 줄 앞에 선다.
 *   highlight   target `index:<i>`
 *               { pass: number; index: number; value: number; target: number; seen: number }
 *               눈길이 i 번 칸으로 옮겨 가 들여다본다. seen 은 이번 훑기에서
 *               지금까지 들여다본 칸 수.
 *   mark        target `index:<i>`
 *               { pass: number; index: number; target: number; seen: number }
 *               찾았다. 눈길이 그 자리에서 멎는다.
 *   overrun     { pass: number; target: number; seen: number }
 *               끝까지 갔는데 없다. 눈길이 줄 밖으로 빠져나간다.
 *   done        { stopped: number; exhausted: number }
 *               두 자취의 길이를 견준다. 값은 훑기가 실제로 센 수다.
 *   rewind      {}
 *               자동 재생이 끝난 뒤 advance 를 받아 처음으로 되감는다.
 *
 * ── 메트릭
 *   없다. 조각은 세지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ScanUntilFoundData = {
  type: 'scan-until-found';
  /** 줄 서 있지 않은 값들. 중간에 포기할 근거가 없다는 것이 이 조각의 전제다. */
  values: number[];
  /** 차례로 찾아 볼 값. 이 배열의 길이가 곧 훑는 횟수이자 자취 줄 수다. */
  queries: number[];
  /** 걸음 간격 (ms). 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

const FALLBACK_STEP_MS = 650;

export const scanUntilFound = async (ctx: FacetContext<ScanUntilFoundData>): Promise<void> => {
  const c = ctx as ReactiveContext<ScanUntilFoundData>;
  const stepMs = typeof c.data.stepMs === 'number' ? c.data.stepMs : FALLBACK_STEP_MS;

  /** 한 걸음씩 짚는 중인가. 자동 재생을 마치고 advance 를 받으면 켜진다. */
  let manual = false;
  /** 되감기 직후(그리고 맨 처음)의 첫 문은 그냥 통과시킨다 (S-piece). */
  let freePass = true;

  /** 걸음 사이의 문. 자동이면 재우고, 수동이면 다음 누름을 기다린다. */
  const gate = async (): Promise<boolean> => {
    if (freePass) {
      freePass = false;
      return !c.cancelled;
    }
    if (!manual) return await c.sleep(stepMs);
    await c.waitForInput();
    return !c.cancelled;
  };

  /**
   * 두 훑기를 차례로 돈다. 걸음은 queries · values 를 도는 데서 나오므로
   * 손으로 적은 걸음표가 없다 (C2).
   *
   * @returns 끝까지 갔으면 true, 취소로 끊겼으면 false.
   */
  const sweepAll = async (): Promise<boolean> => {
    /** 찾아서 멎은 훑기가 들여다본 칸 수. */
    let stopped = 0;
    /** 없다고 답한 훑기가 들여다본 칸 수. */
    let exhausted = 0;

    for (let pass = 0; pass < c.data.queries.length; pass++) {
      const target = c.data.queries[pass];

      if (!(await gate())) return false;
      await c.emit({ type: 'scan-begin', payload: { pass, target } });

      let seen = 0;
      let hit = -1;
      for (let i = 0; i < c.data.values.length && hit < 0; i++) {
        const value = c.data.values[i];
        if (!(await gate())) return false;
        seen = i + 1;
        await c.emit({
          type: 'highlight',
          target: `index:${i}`,
          payload: { pass, index: i, value, target, seen },
        });
        if (value === target) hit = i;
      }

      if (!(await gate())) return false;
      if (hit >= 0) {
        stopped = seen;
        await c.emit({
          type: 'mark',
          target: `index:${hit}`,
          payload: { pass, index: hit, target, seen },
        });
      } else {
        exhausted = seen;
        await c.emit({ type: 'overrun', payload: { pass, target, seen } });
      }
    }

    if (!(await gate())) return false;
    await c.emit({ type: 'done', payload: { stopped, exhausted } });
    return true;
  };

  if (!(await sweepAll())) return;

  // 자동 재생은 끝났다. 이제 advance 를 받으면 되감고 한 걸음씩 짚는다.
  // 첫 누름이 되감기만 하고 멈추면 눌러도 반응 없는 것으로 읽히므로,
  // 되감은 뒤 첫 걸음까지 보인다 (S-piece).
  for (;;) {
    await c.waitForInput();
    if (c.cancelled) return;
    manual = true;
    freePass = true;
    await c.emit({ type: 'rewind' });
    if (!(await sweepAll())) return;
  }
};
