/**
 * slow-start — 망이 얼마나 받아 줄지 모를 때, 보내는 양을 어떻게 늘려 가는가.
 *
 * 모형 (예로 정한 값 · 줄인 자리는 설명 글이 밝힌다):
 * - 창은 **조각 수**로 센다 (실제 TCP 는 바이트).
 * - 한 걸음 = 한 왕복. 왕복마다 창만큼 보내고, 그 수만큼 확인이 돌아온다. 잃음은 없다.
 * - 확인 하나마다 **그때의 창**으로 판정한다.
 *   창 < 문턱 이면 창 + 1 (슬로 스타트),
 *   창 ≥ 문턱 이면 창 + 1/(그 왕복 머리의 창) (혼잡 회피 — 왕복에 +1).
 *   창 8 인 왕복의 여덟째 확인이 창을 16 으로 만든다.
 * - 창은 "정수 몫 + 나머지/왕복 머리의 창" 으로 셈해 부동소수를 쓰지 않는다.
 *   왕복이 끝났을 때 나머지가 남으면(정수가 아닌 창) 이 모형으로 셈할 수 없어 던진다 (C6).
 *
 * 이벤트:
 * - `init`  (silent) payload `{ widest: number }`
 *     재생 전체에서 가장 넓은 창. 그림이 조각 한 칸의 폭을 처음부터 정하게 한다.
 * - `round` payload `{ round: number; window: number; next: number; sent: number; grows: number[] }`
 *     round  몇째 왕복인가 (1 부터)
 *     window 그 왕복 머리의 창 = 보낸 조각 수 = 돌아온 확인 수
 *     next   왕복 뒤의 창
 *     sent   지금까지 보낸 조각의 합
 *     grows  확인마다 1 (창 + 1) 또는 0 (창 + 1/window). 길이는 window
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface SlowStartFacetData {
  type: 'slow-start';
  /** 처음 혼잡 창 (조각 수) */
  window: number;
  /** 문턱 (ssthresh, 조각 수) */
  ssthresh: number;
  /** 보일 왕복 수 */
  rounds: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
}

interface RoundPlan {
  round: number;
  window: number;
  next: number;
  sent: number;
  grows: number[];
}

function positiveInt(v: unknown, name: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
    throw new Error(`slow-start: ${name} 는 1 이상의 정수여야 한다 — 받은 값 ${String(v)}`);
  }
  return v;
}

/** 왕복 하나 — 확인마다 그때의 창으로 판정한다. */
function playRound(round: number, head: number, ssthresh: number, sentBefore: number): RoundPlan {
  let whole = head;
  let part = 0; // 나머지의 분자 — 분모는 왕복 머리의 창
  const grows: number[] = [];
  for (let ack = 0; ack < head; ack += 1) {
    if (whole < ssthresh) {
      whole += 1;
      grows.push(1);
    } else {
      part += 1;
      if (part === head) {
        whole += 1;
        part = 0;
      }
      grows.push(0);
    }
  }
  if (part !== 0) {
    throw new Error(
      `slow-start: 왕복 ${round} 뒤의 창이 정수가 아니다 (${whole} + ${part}/${head}) — 문턱을 왕복 도중에 넘는 자료는 이 모형이 셈하지 않는다`,
    );
  }
  return { round, window: head, next: whole, sent: sentBefore + head, grows };
}

export async function slowStart(ctx: FacetContext<SlowStartFacetData>): Promise<void> {
  const rctx = ctx as ReactiveContext<SlowStartFacetData>;
  const data = ctx.data;
  const first = positiveInt(data.window, 'window');
  const ssthresh = positiveInt(data.ssthresh, 'ssthresh');
  const rounds = positiveInt(data.rounds, 'rounds');
  const stepMs = positiveInt(data.stepMs, 'stepMs');

  // 셈을 먼저 다 해 둔다 — 셈할 수 없는 자료는 아무것도 그리기 전에 던진다.
  const plans: RoundPlan[] = [];
  let head = first;
  let sent = 0;
  for (let r = 1; r <= rounds; r += 1) {
    if (ctx.cancelled) return;
    const plan = playRound(r, head, ssthresh, sent);
    plans.push(plan);
    head = plan.next;
    sent = plan.sent;
  }
  let widest = first;
  for (const plan of plans) {
    if (ctx.cancelled) return;
    widest = Math.max(widest, plan.window, plan.next);
  }

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', payload: { widest }, silent: true });

  for (const plan of plans) {
    // 걸음 0 은 처음 창과 문턱이 이미 읽을 것이라 첫 왕복 앞에도 머문다.
    if (!(await pause())) return;
    await ctx.emit({
      type: 'round',
      payload: {
        round: plan.round,
        window: plan.window,
        next: plan.next,
        sent: plan.sent,
        grows: plan.grows.slice(),
      },
    });
  }
}
