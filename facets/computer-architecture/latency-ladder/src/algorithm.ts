/**
 * 지연 계단 — 못 찾을 때마다 한 층씩 더 내려간다.
 *
 * 코어가 값을 찾는다. 가장 가까운 층에 없으면 한 층 내려가고, 거기도 없으면 또
 * 한 층 내려간다. 층은 넷뿐인데 처음과 끝이 쉰 배다.
 *
 * ── 식별자
 *   층은 `initialData.levels` 의 `id` 를 그대로 쓴다 (`l1` · `l2` · `l3` · `dram`).
 *   사람이 읽는 이름은 데이터가 아니라 문안이므로 `facet.ts` 의 `label.*` 에 있다.
 *
 * ── 이벤트 (전부 이 facet 고유. silent 없음)
 *   `ask`    `{ level: string; cycles: number; ns: number }`
 *            첫 층에 묻는다. 걸음의 시작이라 문(gate)을 지나지 않는다.
 *   `miss`   `{ from: string; to: string; cycles: number; ns: number; factor: number }`
 *            `from` 에 없어 `to` 로 내려간다. `factor` 는 바로 위 층 대비 배수.
 *   `hit`    `{ level: string; cycles: number; ns: number }`
 *   `span`   `{ factor: number }` — 첫 층 대비 마지막 층의 총 배수.
 *   `rewind` payload 없음. 한 걸음씩 다시 보기 전에 화면을 처음으로 되돌린다.
 *
 * ── 셈
 *   1차 데이터는 층 식별자와 사이클 수뿐이다. 배수 · 총 배수 · 나노초 환산은
 *   여기서 그 자리에 셈한다.
 *
 * 조각이므로 `ctx.metric` 은 부르지 않는다 (S-piece).
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type LatencyLevel = {
  /** 층 식별자. 사람이 읽는 이름은 `facet.ts` 의 `label.<id>` 가 갖는다. */
  id: string;
  /** 그 층에 닿는 데 드는 대략의 사이클 수. */
  cycles: number;
};

export type LatencyLadderData = {
  type: 'latency-ladder';
  /** 걸음 사이의 정지 시간. 읽을 시간을 주는 것은 저작 결정이다 (S-piece). */
  stepMs: number;
  levels: LatencyLevel[];
};

/**
 * 사이클 하나의 시간(ns). 3.3GHz 언저리의 코어를 가정한 값이며, 그 전제를
 * 밝히는 것은 화면이 아니라 `description.ts` 의 일이다 (S-piece).
 */
const NS_PER_CYCLE = 0.3;

const round1 = (v: number): number => Math.round(v * 10) / 10;

const nsOf = (cycles: number): number => round1(cycles * NS_PER_CYCLE);

/**
 * 걸음 사이의 문. 자동 재생에서는 `ctx.sleep`, 다시 보기에서는 `advance` 대기다.
 * false 를 돌려주면 취소된 것이므로 걸음을 멈춘다.
 */
type Gate = () => Promise<boolean>;

/**
 * 한 번의 내려가기. 걸음표를 손으로 적지 않고 `levels` 를 순회한다 — 순서를
 * 정하는 것은 저작자가 아니라 데이터다 (S-piece).
 */
async function descend(
  ctx: ReactiveContext<LatencyLadderData>,
  levels: LatencyLevel[],
  gate: Gate,
): Promise<void> {
  const first = levels[0];
  const last = levels[levels.length - 1];

  // 마운트 직후의 첫 걸음은 문을 지나지 않는다. 문을 먼저 두면 stepMs 만큼
  // 빈 화면이 보인 뒤에야 그림이 선다 (S-piece).
  await ctx.emit({
    type: 'ask',
    payload: { level: first.id, cycles: first.cycles, ns: nsOf(first.cycles) },
  });

  for (let i = 1; i < levels.length; i += 1) {
    if (!(await gate())) return;
    const from = levels[i - 1];
    const to = levels[i];
    await ctx.emit({
      type: 'miss',
      payload: {
        from: from.id,
        to: to.id,
        cycles: to.cycles,
        ns: nsOf(to.cycles),
        factor: round1(to.cycles / from.cycles),
      },
    });
  }

  if (!(await gate())) return;
  await ctx.emit({
    type: 'hit',
    payload: { level: last.id, cycles: last.cycles, ns: nsOf(last.cycles) },
  });

  if (!(await gate())) return;
  await ctx.emit({
    type: 'span',
    payload: { factor: round1(last.cycles / first.cycles) },
  });
}

export const latencyLadderAlgorithm = async (
  ctx: FacetContext<LatencyLadderData>,
): Promise<void> => {
  const rctx = ctx as ReactiveContext<LatencyLadderData>;
  const data = rctx.data;
  const levels = Array.isArray(data.levels) ? data.levels : [];
  if (levels.length < 2) return;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : 700;

  // 1. 자동 재생. 스스로 시작해 할 말을 마친다.
  await descend(rctx, levels, () => rctx.sleep(stepMs));

  // 2. 그 뒤로는 한 걸음씩. 곱씹으며 읽고 싶은 사람을 위한 것이다.
  for (;;) {
    if (rctx.cancelled) return;
    let input: { type: string };
    try {
      input = await rctx.waitForInput();
    } catch (err) {
      // reset/destroy 가 reject 한 것은 정상 종료 경로다. 그 밖의 오류는 그대로
      // 올려 러너가 드러내게 둔다 (C8 정본).
      if (!rctx.cancelled) throw err;
      return;
    }
    if (rctx.cancelled) return;
    // 받은 것의 종류를 본다 — 위젯 입력이 붙는 날 걸음으로 세지 않게 (S-piece).
    if (input.type !== 'advance') continue;

    // 첫 누름은 되감고 첫 걸음까지 간다. 되감기만 하면 눌러도 반응이 없는 것으로
    // 읽힌다 — 첫 emit 이 문 밖에 있으므로 이 한 번에 둘이 나간다.
    await rctx.emit({ type: 'rewind' });
    await descend(rctx, levels, async () => {
      for (;;) {
        if (rctx.cancelled) return false;
        try {
          const next = await rctx.waitForInput();
          if (rctx.cancelled) return false;
          if (next.type === 'advance') return true;
        } catch (err) {
          if (!rctx.cancelled) throw err;
          return false;
        }
      }
    });
  }
};
