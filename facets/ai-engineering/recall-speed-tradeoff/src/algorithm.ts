/**
 * 덜 뒤지면 놓친다 — 조각의 알고리즘.
 *
 * 1차 데이터는 점 스물넷의 좌표 · 대표 넷의 좌표 · 질의 좌표 · k 다. 거리와
 * 본 점 수와 재현율은 전부 여기서 셈한다. 표를 옮겨 적지 않는다.
 *
 * ── 어느 칸을 여느냐
 *
 * 이 조각의 주장이 아니다. 그것은 이웃 조각의 몫이고 여기서는 **전제**일 뿐이라,
 * 차례도 사람이 적지 않고 데이터가 정한다 — 대표가 질의에 가까운 칸부터 연다.
 * 걸음도 손으로 적은 표가 아니라 폭을 하나씩 넓히는 순회이며, 답이 참값과
 * 같아지는 폭에서 멈춘다 (더 열어도 답이 같다).
 *
 * ── 이벤트 (facet 고유 확장, C2)
 *
 *   truth-fixed        { order: number[] }
 *       전수로 잰 참값 다섯 — `points` 안의 번호를 가까운 차례대로. 좌표도 개수도
 *       싣지 않는다. 번호만 있으면 바탕에서 좌표가 나오고 개수는 세면 나온다.
 *       silent 아님.
 *
 *   answer-recomputed  { opened: number[]; holders: number[] }
 *       폭 하나로 다시 셈한 답. `opened` 는 이 폭에서 연 칸의 번호이고,
 *       `holders[i]` 는 참값 i 번 자리에 지금 앉은 점의 번호다. 임자가 제자리를
 *       지키면 `holders[i]` 가 `order[i]` 와 같다. silent 아님.
 *
 *   rewind             {}
 *       한 걸음씩 다시 보려고 처음으로 되감는다. silent 아님.
 *
 *   done               {}
 *       마지막 말. silent 아님.
 *
 * ── 무엇을 싣지 않는가
 *
 * 본 점의 수도 재현율도 칸의 총수도 몇 번째 답인가도 싣지 않는다. 연 칸과 자리의
 * 임자만 있으면 장면이 바탕에서 전부 세고, 그래야 화면에 뜨는 수와 그림이 **같은
 * 자료**를 지난다 (`scene.ts` 의 갈래표). 실어 보내면 그림과 따로 받아 적는 두
 * 출처가 된다.
 *
 * 메트릭은 없다 — 조각은 셀 것이 없다 (S-piece).
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

/** 평면 위의 점 하나. cell 은 이 점이 속한 무리의 번호다. */
export type RecallPoint = { x: number; y: number; cell: number };

export type RecallSpeedTradeoffData = {
  type: string;
  /** 점 스물넷. 차례는 칸 0 부터 묶어 놓은 것이며 동점을 가르는 기준이 된다. */
  points: RecallPoint[];
  /** 무리 넷의 대표. 칸을 여는 차례를 여기서 셈한다. */
  cells: { x: number; y: number }[];
  query: { x: number; y: number };
  k: number;
  /** 걸음 사이에 쉬는 시간. 읽을 틈을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
};

type Ranked = RecallPoint & { index: number; far: number };

/**
 * 폭 하나로 잰 것.
 *
 * `hit` 은 멈출 때를 가리는 데만 쓰고 발신에는 안 실린다 — 자리를 세면 나오는 수라
 * 장면이 센다.
 */
type Measured = { hit: number; opened: number[]; holders: number[] };

function far(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

export async function recallSpeedTradeoffAlgorithm(
  ctx: FacetContext<RecallSpeedTradeoffData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<RecallSpeedTradeoffData>;
  const { points, cells, query, k, stepMs } = ctx.data;

  /*
   * 거리가 같은 짝이 있다 — 그때는 points 에 적힌 차례가 앞선 것을 앞세운다.
   * 정해 두지 않으면 참값 다섯이 실행마다 달라진다. 이 규칙이 무엇을 가르는지는
   * description.ts 가 밝힌다.
   */
  const ranked: Ranked[] = points
    .map((p, index) => ({ ...p, index, far: far(p.x, p.y, query.x, query.y) }))
    .sort((a, b) => a.far - b.far || a.index - b.index);

  const truth = ranked.slice(0, k);
  const truthIds = new Set(truth.map((p) => p.index));

  // 대표가 질의에 가까운 칸부터. 차례를 데이터가 정한다.
  const cellOrder = cells
    .map((c, index) => ({ index, far: far(c.x, c.y, query.x, query.y) }))
    .sort((a, b) => a.far - b.far || a.index - b.index)
    .map((c) => c.index);

  function measure(width: number): Measured {
    const openedIds = cellOrder.slice(0, width);
    const opened = new Set(openedIds);
    const pool = ranked.filter((p) => opened.has(p.cell));
    const answer = pool.slice(0, k);
    const answerIds = new Set(answer.map((p) => p.index));
    const hit = truth.filter((p) => answerIds.has(p.index)).length;

    // 빈자리 수와 참값 아닌 것의 수는 언제나 같다 (둘 다 k - hit).
    const takers = answer.filter((p) => !truthIds.has(p.index));
    let next = 0;
    const holders = truth.map((owner): number => {
      if (answerIds.has(owner.index)) return owner.index;
      const taker = takers[next];
      next += 1;
      // taker 는 언제나 있다. 없을 때 임자를 두는 것은 타입을 위한 자리다.
      return taker === undefined ? owner.index : taker.index;
    });
    return { hit, opened: openedIds, holders };
  }

  /** advance 로 한 걸음씩 짚어 보는 중인가. */
  let stepping = false;

  /**
   * 걸음 사이의 문. 자동 재생이면 쉬고, 한 걸음 모드면 누를 때까지 기다린다.
   * 첫 걸음 앞에는 문이 없다 — 문은 걸음 *사이*의 것이다 (S-piece).
   */
  async function gate(): Promise<boolean> {
    if (!stepping) return rctx.sleep(stepMs);
    for (;;) {
      // 앞 검사는 루프 안 첫 줄이다 — 밖에 두면 continue 로 돌아왔을 때 지나지 않는다.
      if (ctx.cancelled) return false;
      let input: ReactiveInputEvent;
      try {
        input = await rctx.waitForInput();
      } catch (err) {
        // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
        // 올려 러너가 드러내게 둔다 (C8 정본).
        if (!ctx.cancelled) throw err;
        return false;
      }
      if (ctx.cancelled) return false;
      if (input.type === 'advance') return true;
    }
  }

  async function run(): Promise<void> {
    await ctx.emit({
      type: 'truth-fixed',
      payload: { order: truth.map((p) => p.index) },
    });

    for (let width = 1; width <= cells.length; width += 1) {
      if (!(await gate())) return;
      const view = measure(width);
      await ctx.emit({
        type: 'answer-recomputed',
        payload: { opened: view.opened, holders: view.holders },
      });
      // 다 모았으면 멈춘다 — 더 열어도 답이 같다.
      if (view.hit === k) break;
    }

    if (!(await gate())) return;
    await ctx.emit({ type: 'done', payload: {} });
  }

  await run();

  // 다 보인 뒤 — 누르면 되감고 첫 걸음까지 간다. 그 뒤로는 한 걸음씩.
  for (;;) {
    if (ctx.cancelled) return;
    let input: ReactiveInputEvent;
    try {
      input = await rctx.waitForInput();
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다 (C8 정본).
      if (!ctx.cancelled) throw err;
      return;
    }
    if (ctx.cancelled) return;
    if (input.type !== 'advance') continue;
    stepping = true;
    await ctx.emit({ type: 'rewind', payload: {} });
    await run();
    stepping = false;
  }
}
