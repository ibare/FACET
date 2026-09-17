/**
 * 점근 교차 조각(piece) 알고리즘 — 두 정렬의 실제 비용을 한 저울에 올린다.
 *
 * 답하는 질문 하나: **작은 입력에서 이기던 쪽이 어디서 뒤집히는가.**
 *
 * ── 식별자
 *   쓰지 않는다. 화면의 자리는 stage 가 사다리 순서에서 셈한다.
 *
 * ── 이벤트 (전부 facet 고유 확장. payload 는 다섯 다 비어 있다. silent 도 없다)
 *   'board-set'       {} 저울과 아래 가로줄을 세운다. 사다리의 칸이 자리를 잡는다.
 *   'weigh'           {} 사다리의 다음 칸을 저울에 올린다. 두 비용이 접시에 얹히고
 *                     저울이 기울며, 싼 쪽의 표가 제 칸으로 날아가 앉는다.
 *   'mark-threshold'  {} 앞뒤가 뒤집히는 자리에 선을 긋고 좌우를 나눈다.
 *   'library-rule'    {} 왼쪽 구간에 괄호를 치고 실무의 선택을 적는다.
 *   'rewind'          {} 다시 보기. 판을 비운다 (`advance` 로 되감을 때).
 *
 * ── phase 어휘 / 메트릭
 *   없다. 조각은 코드 패널을 두지 않고 `ctx.metric` 도 부르지 않는다 (S-piece).
 *
 * ── 수는 여기서 셈하되 걸음에 싣지 않는다
 *   선언이 주는 것은 두 비용 식의 **모양**(지수·나눗수·로그 밑)과 n 사다리뿐이고,
 *   거기서 표 전체가 결정된다. 그러니 걸음이 판정할 것이 하나도 없다 — 발신은
 *   **어디까지 왔나**만 말하고, 화면에 뜨는 수는 `scene.ts` 가 아래 두 함수를
 *   불러 낸다 (프로토콜 4 절의 B 갈래). 한 출처를 지나므로 접시의 수와 표의
 *   색이 갈릴 자리가 없다.
 *
 *   표시와 판정이 어긋나지 않도록 **반올림한 정수로 견준다** — `n log₂n` 은
 *   정수가 아니어서 (n = 12 에서 43.02) 셈과 표시가 갈릴 수 있는 자리다.
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type CurvesCrossData = {
  type: string;
  /** 입력 크기 사다리. */
  sizes: number[];
  /** 삽입 정렬의 비용 모양 — n^exponent / divisor. */
  insertion: { exponent: number; divisor: number };
  /** 병합 정렬의 비용 모양 — n × log_logBase(n). */
  merge: { logBase: number };
  /** 걸음 사이의 정지 시간. 애니메이션이 그 위에 더해진다 (S-piece). */
  stepMs: number;
};

/** 싼 쪽. 둘이 같으면 `'tie'`. */
export type CostLead = 'insertion' | 'merge' | 'tie';

export type CostRow = {
  n: number;
  /** 반올림한 삽입 정렬 비용. */
  insertion: number;
  /** 반올림한 병합 정렬 비용. */
  merge: number;
  lead: CostLead;
};

function logBase(n: number, base: number): number {
  return base === 2 ? Math.log2(n) : Math.log(n) / Math.log(base);
}

/**
 * 사다리마다 두 비용을 셈한다.
 *
 * 반올림은 **판정 전에** 한다. 화면이 43 을 보이면서 43.02 로 견주면 보이는 수와
 * 결론이 갈릴 수 있고, 그 갈림은 하필 두 값이 가까운 교차점 근처에서 생긴다.
 */
export function computeCurvesCrossRows(data: CurvesCrossData): CostRow[] {
  const { exponent, divisor } = data.insertion;
  const base = data.merge.logBase;
  return data.sizes.map((n) => {
    const insertion = Math.round(n ** exponent / divisor);
    const merge = Math.round(n * logBase(n, base));
    const lead: CostLead =
      insertion < merge ? 'insertion' : insertion > merge ? 'merge' : 'tie';
    return { n, insertion, merge, lead };
  });
}

/**
 * 앞뒤가 뒤집히는 자리 — 사다리의 **몇 번째 칸**인가.
 *
 * 정확히 만나는 칸이 있으면 그 칸이고, 없으면 병합이 처음 앞서는 칸이다.
 * 둘 다 없으면(사다리가 교차 앞에서 끝나면) 마지막 칸을 준다.
 *
 * 줄이 아니라 번호를 돌려준다 — 화면의 자리는 배열의 차례가 정하므로, 줄에도
 * 번호를 적어 두면 같은 물음에 답이 둘이 된다 (프로토콜 4 절).
 */
export function findCrossingIndex(rows: readonly CostRow[]): number {
  const tie = rows.findIndex((r) => r.lead === 'tie');
  if (tie >= 0) return tie;
  const flipped = rows.findIndex((r) => r.lead === 'merge');
  if (flipped >= 0) return flipped;
  return rows.length - 1;
}

export async function curvesCrossAlgorithm(base: FacetContext<CurvesCrossData>): Promise<void> {
  const ctx = base as ReactiveContext<CurvesCrossData>;
  const stepMs = ctx.data.stepMs;

  /** 자동 재생이 끝나면 참이 된다. 그 뒤로는 문이 `advance` 를 기다린다. */
  let manual = false;

  async function waitAdvance(): Promise<boolean> {
    for (;;) {
      let input: ReactiveInputEvent;
      try {
        input = await ctx.waitForInput();
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다 (C6·C8).
        if (!ctx.cancelled) throw err;
        return false;
      }
      if (ctx.cancelled) return false;
      // 받은 것의 종류를 본다 — 위젯 입력이 붙어도 걸음으로 세지 않도록 (S-piece).
      if (input.type === 'advance') return true;
    }
  }

  /** 걸음 사이의 문. 자동 재생이면 쉬고, 손으로 짚는 중이면 누름을 기다린다. */
  async function gate(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return manual ? await waitAdvance() : await ctx.sleep(stepMs);
  }

  /**
   * 한 바퀴.
   *
   * 첫 emit 은 문 밖에 둔다 — 문은 걸음 *사이*의 것이라 첫 걸음 앞에는 기다릴
   * 앞걸음이 없고, 문을 먼저 두면 `stepMs` 만큼 빈 화면이 보인다 (S-piece).
   * 되감은 직후에도 같다: `rewind` 다음에 곧바로 판이 선다.
   */
  async function pass(): Promise<void> {
    await ctx.emit({ type: 'board-set', payload: {} });

    // 사다리를 한 칸씩 걸어간다. 몇 번째 칸인지도, 그 칸의 두 비용도 싣지 않는다 —
    // 장면이 같은 사다리를 `computeCurvesCrossRows` 에 먹여 낸다.
    for (let i = 0; i < ctx.data.sizes.length; i += 1) {
      if (!(await gate())) return;
      await ctx.emit({ type: 'weigh', payload: {} });
    }

    if (!(await gate())) return;
    // 어느 칸이 경계인가는 `findCrossingIndex` 가 낸다 — 표의 색과 같은 출처다.
    await ctx.emit({ type: 'mark-threshold', payload: {} });

    if (!(await gate())) return;
    await ctx.emit({ type: 'library-rule', payload: {} });
  }

  await pass();

  manual = true;
  for (;;) {
    // 자동 재생이 끝난 뒤 처음 누르는 `advance` 는 되감고 첫 걸음까지 간다.
    if (!(await waitAdvance())) return;
    await ctx.emit({ type: 'rewind', payload: {} });
    await pass();
  }
}
