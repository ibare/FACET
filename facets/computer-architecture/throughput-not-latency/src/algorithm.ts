/**
 * 처리량과 지연 — 같은 명령어 다섯을 비파이프 기계와 파이프 기계가 나란히 돌린다.
 *
 * 규약 (사양):
 *   - 두 기계 다 단계당 한 사이클. 단계 레지스터의 부담은 없다고 본다.
 *   - 비파이프: 앞 명령어가 WB 를 마친 다음 사이클에 다음 명령어의 IF.
 *   - 파이프: 순서대로 한 사이클에 하나씩 가져온다. 명령어끼리 걸리지 않으므로
 *     (자료가 그렇게 주어졌다) 멈춤은 없다.
 *
 * 걸음의 단위: 파이프 기계가 도는 동안은 한 사이클에 한 걸음, 파이프 기계가 다 비운
 * 뒤로는 비파이프 기계의 다음 명령어가 나오는 사이클까지를 한 걸음으로 묶는다.
 * 사이클마다 걸으면 스물다섯 걸음이 넘어 재생이 20 초를 넘는다.
 *
 * 이벤트 (전부 silent 아님):
 *   tick  { cycle: number }  — 이 사이클까지 시계가 흘렀다. 두 기계의 자리는
 *                              `entryCycles` 로 장면이 셈한다.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type ThroughputNotLatencyFacetData = {
  type: 'throughput-not-latency';
  /** 어셈블리 표기 그대로. 번역하지 않는다. */
  instructions: string[];
  /** 단계 식별자. 표시 이름은 messages 의 `stage.<id>`. */
  stages: string[];
  stepMs: number;
};

export type Machine = 'serial' | 'pipe';

/** 명령어마다 IF 에 드는 사이클 (1 부터). 규약에서 셈한다. */
export function entryCycles(count: number, depth: number, machine: Machine): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i === 0) out.push(1);
    else if (machine === 'serial') out.push(out[i - 1] + depth);
    else out.push(out[i - 1] + 1);
  }
  return out;
}

/** WB 를 마치는 사이클. */
export function exitCycle(entry: number, depth: number): number {
  return entry + depth - 1;
}

/**
 * 걸음마다 시계가 가 닿을 사이클.
 * 파이프 기계의 마지막 명령어가 나올 때까지는 한 사이클씩, 그 뒤로는 남은 기계의
 * 명령어가 나오는 사이클마다.
 */
export function tickCycles(count: number, depth: number): number[] {
  const pipeExits = entryCycles(count, depth, 'pipe').map((e) => exitCycle(e, depth));
  const serialExits = entryCycles(count, depth, 'serial').map((e) => exitCycle(e, depth));
  const pipeLast = Math.max(...pipeExits);
  const out: number[] = [];
  for (let c = 1; c <= pipeLast; c += 1) out.push(c);
  for (const c of [...serialExits, ...pipeExits].sort((a, b) => a - b)) {
    if (c > out[out.length - 1]) out.push(c);
  }
  return out;
}

export async function throughputNotLatency(
  ctx: FacetContext<ThroughputNotLatencyFacetData>,
): Promise<void> {
  const rctx = ctx as ReactiveContext<ThroughputNotLatencyFacetData>;
  const { instructions, stages, stepMs } = ctx.data;

  async function pause(): Promise<boolean> {
    if (rctx.cancelled) return false;
    return (await rctx.sleep(stepMs)) && !rctx.cancelled;
  }

  const ticks = tickCycles(instructions.length, stages.length);
  for (let k = 0; k < ticks.length; k += 1) {
    if (ctx.cancelled) return;
    // 첫 걸음은 문 없이 곧바로 — 마운트 뒤 빈 화면을 두지 않는다
    if (k > 0 && !(await pause())) return;
    await ctx.emit({ type: 'tick', payload: { cycle: ticks[k] } });
  }
}
