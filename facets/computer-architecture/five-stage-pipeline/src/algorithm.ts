/**
 * 5단계 파이프라인 — 명령어를 다섯 단계로 나누면 무엇이 빨라지고 무엇이 그대로인가.
 *
 * 명령어 N 개를 IF · ID · EX · MEM · WB 다섯 단계에 흘린다. i 번째(0 부터)는 박자 i+1 에
 * IF, 박자 i+5 에 WB 다. 해저드는 없다 — 명령어 열여섯은 서로의 결과를 읽지 않는다.
 * 같은 N 개를 한 번에 하나씩(앞 명령어의 WB 다음 박자에 다음 IF) 돌린 직렬 기계와 견준다.
 *
 * 걸음 하나 = 박자 하나. 직렬 쪽은 박자마다 재생하지 않고 막대와 끝 표시로만 보인다.
 * 한 판을 끝까지 재생한 뒤 손잡이(`count`) 입력을 기다리고, 받은 N 으로 다시 재생한다.
 *
 * ── 이벤트 (전부 `await ctx.emit`)
 *
 *   phase        { phase: string }                                          silent
 *   round-start  { count: number, instructions: string[], stageCount: number,
 *                  latencyCycles: number }
 *   serial-plan  { count: number, serialCycles: number, cyclesPerInstruction: number }
 *   tick         { cycle: number, slots: number[], busy: number }
 *                  slots[s] = 단계 s 에 든 명령어 번호(0 부터), 비었으면 -1
 *   retire       { index: number, ifCycle: number, wbCycle: number, latencyCycles: number }
 *   round-end    { pipeCycles: number, serialCycles: number, speedupPercent: number,
 *                  utilizationPercent: number, fullCycles: number, count: number }
 *
 * ── phase 어휘
 *
 *   'setup' | 'serial' | 'flow' | 'retire' | 'speedup'
 *
 * ── 메트릭 (지금 보이는 값을 들고 차이만 보낸다 — 판을 거듭해도 쌓이지 않는다)
 *
 *   cycle-count          파이프 박자. 박자마다 지금 박자로, 판 끝에 N+4
 *   serial-cycle-count   직렬 박자 5N
 *   latency-cycle-count  한 명령어의 IF 박자부터 WB 박자까지 (양끝 포함). 늘 5
 *   speedup-percent      (직렬*100 + 파이프//2) // 파이프 — 판 끝에 실린다
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type FiveStagePipelineData = {
  type: 'five-stage-pipeline';
  /** 명령어 글 열여섯. 손잡이 값 N 은 앞에서부터 N 개를 쓴다. 자료라 번역하지 않는다. */
  program: string[];
  /** 파이프라인 단계 수 (IF · ID · EX · MEM · WB). */
  stageCount: number;
  /** 손잡이 사다리 — facet.ts 의 `segments[].value` 와 같아야 한다. */
  countLadder: number[];
  /** 처음 재생할 명령어 수 — 손잡이의 기본 구간과 같아야 한다. */
  startCount: number;
};

/** 한 박자의 재생 간격. N=16 이면 20 박자 · 9 초. */
const STEP_MS = 450;

// ─────────────────────────────────────────────────────────────────────────────
// 순수 셈 — IR 의 세 함수와 같은 식을 쓴다. ctx 를 받지 않는다 (C8 Exception).
// ─────────────────────────────────────────────────────────────────────────────

/** i 번째(0 부터) 명령어가 IF 에 드는 박자. */
export function fetchCycleOf(index: number): number {
  return index + 1;
}

/** i 번째(0 부터) 명령어가 WB 를 마치는 박자. */
export function writebackCycleOf(index: number, stageCount: number): number {
  return index + stageCount;
}

/** IR `countPipelinedCycles` 와 같은 셈 — 마지막 명령어의 WB 박자. */
export function countPipelinedCycles(n: number, stageCount: number): number {
  let last = 0;
  for (let i = 0; i < n; i += 1) {
    const finish = writebackCycleOf(i, stageCount);
    if (finish > last) last = finish;
  }
  return last;
}

/** IR `countSerialCycles` 와 같은 셈 — 명령어마다 단계 수만큼 더한다. */
export function countSerialCycles(n: number, stageCount: number): number {
  let total = 0;
  for (let i = 0; i < n; i += 1) total += stageCount;
  return total;
}

/** IR `speedupPercent` 와 같은 반올림 식. */
export function speedupPercent(serial: number, piped: number): number {
  return Math.floor((serial * 100 + Math.floor(piped / 2)) / piped);
}

/** 한 박자에 각 단계에 든 명령어 번호. 비었으면 -1. */
export function slotsAt(cycle: number, n: number, stageCount: number): number[] {
  const slots: number[] = [];
  for (let s = 0; s < stageCount; s += 1) {
    const i = cycle - 1 - s;
    slots.push(i >= 0 && i < n ? i : -1);
  }
  return slots;
}

/** 한 판의 셈 전부 — 검사가 사양 표와 견줄 때 쓴다. */
export function computeFiveStagePipelineRound(
  n: number,
  stageCount: number,
): {
  pipeCycles: number;
  serialCycles: number;
  latencyCycles: number;
  speedupPercent: number;
  utilizationPercent: number;
  fullCycles: number;
} {
  const pipeCycles = countPipelinedCycles(n, stageCount);
  const serialCycles = countSerialCycles(n, stageCount);
  let busySum = 0;
  let fullCycles = 0;
  for (let c = 1; c <= pipeCycles; c += 1) {
    const busy = slotsAt(c, n, stageCount).filter((i) => i >= 0).length;
    busySum += busy;
    if (busy === stageCount) fullCycles += 1;
  }
  const capacity = stageCount * pipeCycles;
  return {
    pipeCycles,
    serialCycles,
    latencyCycles: writebackCycleOf(0, stageCount) - fetchCycleOf(0) + 1,
    speedupPercent: speedupPercent(serialCycles, pipeCycles),
    utilizationPercent: Math.floor((busySum * 100 + Math.floor(capacity / 2)) / capacity),
    fullCycles,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 알고리즘
// ─────────────────────────────────────────────────────────────────────────────

export async function fiveStagePipelineAlgorithm(
  baseCtx: FacetContext<FiveStagePipelineData>,
): Promise<void> {
  const ctx = baseCtx as ReactiveContext<FiveStagePipelineData>;
  const data = ctx.data;
  const stageCount = data.stageCount;
  const ladder = data.countLadder;

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 지금 보이는 값. 계기는 누적 채널이라 차이만 보낸다. 처음 한 번은 0 이어도 보낸다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number) => {
    const prev = shown.get(name);
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  /** 한 판을 끝까지 재생한다. 끝까지 갔으면 true, 도중에 취소됐으면 false. */
  async function playRound(n: number): Promise<boolean> {
    const latencyCycles = writebackCycleOf(0, stageCount) - fetchCycleOf(0) + 1;

    await phase('setup');
    gauge('cycle-count', 0);
    gauge('speedup-percent', 0);
    gauge('latency-cycle-count', latencyCycles);
    await ctx.emit({
      type: 'round-start',
      payload: {
        count: n,
        instructions: data.program.slice(0, n),
        stageCount,
        latencyCycles,
      },
    });
    // 걸음 경계 — 코드 패널은 앞 phase 를 덮으므로 'setup' 이 한 걸음 머물게 한다
    if (!(await ctx.sleep(STEP_MS))) return false;

    // 'serial' 은 아래 박자 루프 첫 sleep 까지 머문다
    await phase('serial');
    const serialCycles = countSerialCycles(n, stageCount);
    gauge('serial-cycle-count', serialCycles);
    await ctx.emit({
      type: 'serial-plan',
      payload: { count: n, serialCycles, cyclesPerInstruction: stageCount },
    });

    // 마지막 명령어의 WB 박자까지 흘린다 — 끝은 셈이 아니라 흐름이 정한다.
    let last = 0;
    let busySum = 0;
    let fullCycles = 0;
    for (let cycle = 1; ; cycle += 1) {
      if (ctx.cancelled) return false;
      const slots = slotsAt(cycle, n, stageCount);
      const busy = slots.filter((i) => i >= 0).length;
      if (busy === 0) break;
      if (!(await ctx.sleep(STEP_MS))) return false;
      busySum += busy;
      if (busy === stageCount) fullCycles += 1;

      // 'flow' 는 이 박자의 마지막 phase 로 남는다. 명령어가 나가는 박자에는 'retire' 가
      // 뒤따라 그 박자의 마지막이 된다 — 'flow' 는 채움 박자(1..stageCount-1)에 보인다
      await phase('flow');
      gauge('cycle-count', cycle);
      await ctx.emit({ type: 'tick', payload: { cycle, slots: [...slots], busy } });

      const leaving = slots[stageCount - 1] ?? -1;
      if (leaving >= 0) {
        await phase('retire');
        const wbCycle = writebackCycleOf(leaving, stageCount);
        if (wbCycle > last) last = wbCycle;
        await ctx.emit({
          type: 'retire',
          payload: {
            index: leaving,
            ifCycle: fetchCycleOf(leaving),
            wbCycle,
            latencyCycles: wbCycle - fetchCycleOf(leaving) + 1,
          },
        });
      }
    }

    await phase('speedup');
    const pipeCycles = last;
    const speedup = speedupPercent(serialCycles, pipeCycles);
    const capacity = stageCount * pipeCycles;
    gauge('speedup-percent', speedup);
    await ctx.emit({
      type: 'round-end',
      payload: {
        count: n,
        pipeCycles,
        serialCycles,
        speedupPercent: speedup,
        utilizationPercent: Math.floor((busySum * 100 + Math.floor(capacity / 2)) / capacity),
        fullCycles,
      },
    });
    return true;
  }

  /** 손잡이 입력을 기다린다. 사다리 위의 값이면 그 값, 취소면 null. */
  async function awaitCount(): Promise<number | null> {
    for (;;) {
      if (ctx.cancelled) return null;
      const input = await ctx.waitForInput<ReactiveInputEvent>();
      if (ctx.cancelled) return null;
      if (input.type !== 'count') continue;
      const payload = input.payload;
      if (typeof payload !== 'object' || payload === null) continue;
      const value = (payload as { value?: unknown }).value;
      if (typeof value !== 'number' || !ladder.includes(value)) continue;
      return value;
    }
  }

  try {
    let n = ladder.includes(data.startCount) ? data.startCount : (ladder[0] ?? 1);
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(n))) return;
      const next = await awaitCount();
      if (next === null) return;
      n = next;
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C6).
    if (!ctx.cancelled) throw err;
  }
}
