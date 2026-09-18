/**
 * branch-history-table — 분기의 지난 몇 번을 색인으로 삼아 2비트 카운터 표를 가른다.
 *
 * 한 판 = 결과 열 하나(18 번)를 처음부터 끝까지 짐작한다. 손잡이 둘(이력 길이 · 분기 열)
 * 중 무엇을 돌려도 처음부터 다시 재생한다. 재생 도중 돌리면 그 걸음에서 끊고 새 판을 연다.
 *
 * ── 규약
 *   - 분기 하나의 자기 이력(지역 이력). 이력은 처음에 전부 N(0)
 *   - 표 칸 수 = 2^h. 칸마다 2비트 카운터, 처음 값 2 (약한 탄다)
 *   - 색인 = 이력을 정수로. 걸음마다 hist = (hist * 2 + 결과) % 2^h (가장 최근이 가장 낮은 자리)
 *   - 짐작: 그 칸 ≥ 2 면 탄다. 결과를 본 뒤 그 칸을 포화 ±1, 그다음 이력을 민다
 *   - 맞힘 % = ((n − 틀림) * 100 + n // 2) // n
 *
 * ── 이벤트 (전부 facet 고유. target 없음)
 *   round-start  { trace: string, traceIndex: number, historyBits: number, size: number,
 *                  outcomes: number[] }                               silent 아님
 *   lookup       { step: number, index: number, counter: number, guess: 0|1,
 *                  historyBits: number }                              silent 아님
 *   resolve      { step: number, index: number, taken: 0|1, guess: 0|1, hit: boolean,
 *                  counter: number, misses: number, historyBits: number }   silent 아님
 *   shift        { step: number, taken: 0|1, history: number, historyBits: number }  silent 아님
 *   round-end    { trace: string, historyBits: number, size: number, misses: number,
 *                  total: number, percent: number }                   silent 아님
 *   phase        { phase: 'fill' | 'lookup' | 'update' | 'shift' | 'score' }   silent
 *
 * ── phase 어휘 (irs.ts 와 같다 — C3)
 *   fill · lookup · update · shift · score
 *
 * ── 메트릭 (C5)
 *   miss-count   이번 판에서 틀린 수
 *   hit-percent  이번 판의 맞힘 % (판 끝에 셈한다. 판 첫머리에 0 으로 되돌린다)
 *   entry-count  표 칸 수 (2^h)
 *
 * ── 입력 (segmented-slider)
 *   history  { value: 사다리 값 }         이력 길이
 *   trace    { value: traces 의 순번 }    분기 열
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type BranchHistoryTableData = {
  type: 'branch-history-table';
  /** 분기 열의 식별자. `trace` 손잡이의 값이 이 순번이다. */
  traces: string[];
  /** 식별자 → 결과 열 (1 = 탄다, 0 = 안 탄다). */
  outcomes: Record<string, number[]>;
  /** 이력 길이 사다리. `history` 손잡이의 `segments[].value` 와 같다. */
  ladder: number[];
};

/** 걸음 사이의 간격(ms). 이력을 미는 걸음은 반만 쉰다. */
const STEP_MS = 500;

type Pause = 'go' | 'cancelled' | 'restart';
type RoundEnd = 'done' | 'cancelled' | 'restart';

export async function branchHistoryTableAlgorithm(
  ctx0: FacetContext<BranchHistoryTableData>,
): Promise<void> {
  const ctx = ctx0 as ReactiveContext<BranchHistoryTableData>;
  const data = ctx.data;
  const ladder = data.ladder;
  const traces = data.traces;

  let historyBits = ladder[0] ?? 0;
  let traceIndex = 0;

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 계기는 누적 채널이다 — 지금 보이는 값을 들고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  /** 우리 손잡이의 입력이면 반영하고 true. 아니면 false (흘린다). */
  const accept = (input: ReactiveInputEvent): boolean => {
    const payload = input.payload;
    if (typeof payload !== 'object' || payload === null) return false;
    const value = (payload as { value?: unknown }).value;
    if (typeof value !== 'number') return false;
    if (input.type === 'history') {
      if (!ladder.includes(value)) return false;
      historyBits = value;
      return true;
    }
    if (input.type === 'trace') {
      if (!Number.isInteger(value) || value < 0 || value >= traces.length) return false;
      traceIndex = value;
      return true;
    }
    return false;
  };

  /** 쉬는 동안 손잡이가 돌았으면 끊고 새 판을 연다. 큐에 쌓인 것 중 마지막이 이긴다. */
  const pause = async (ms: number): Promise<Pause> => {
    if (!(await ctx.sleep(ms))) return 'cancelled';
    let turned = false;
    for (let input = ctx.pollInput(); input !== null; input = ctx.pollInput()) {
      if (ctx.cancelled) return 'cancelled';
      if (accept(input)) turned = true;
    }
    return turned ? 'restart' : 'go';
  };

  const playRound = async (): Promise<RoundEnd> => {
    const trace = traces[traceIndex] ?? '';
    const outcomes = data.outcomes[trace] ?? [];
    const total = outcomes.length;

    await phase('fill');
    let size = 1;
    for (let i = 0; i < historyBits; i += 1) size *= 2;
    const table: number[] = new Array<number>(size).fill(2);
    gauge('entry-count', size);
    gauge('miss-count', 0);
    gauge('hit-percent', 0);
    await ctx.emit({
      type: 'round-start',
      payload: { trace, traceIndex, historyBits, size, outcomes: [...outcomes] },
    });
    const opened = await pause(STEP_MS);
    if (opened !== 'go') return opened;

    let hist = 0;
    let misses = 0;
    for (let step = 0; step < total; step += 1) {
      if (ctx.cancelled) return 'cancelled';
      const taken = outcomes[step] === 1 ? 1 : 0;
      const index = hist;
      const before = table[index] ?? 2;
      const guess = before >= 2 ? 1 : 0;

      await phase('lookup');
      await ctx.emit({
        type: 'lookup',
        payload: { step, index, counter: before, guess, historyBits },
      });
      const looked = await pause(STEP_MS);
      if (looked !== 'go') return looked;

      await phase('update');
      const hit = guess === taken;
      if (!hit) misses += 1;
      const after = taken === 1 ? Math.min(3, before + 1) : Math.max(0, before - 1);
      table[index] = after;
      gauge('miss-count', misses);
      await ctx.emit({
        type: 'resolve',
        payload: { step, index, taken, guess, hit, counter: after, misses, historyBits },
      });
      const resolved = await pause(STEP_MS);
      if (resolved !== 'go') return resolved;

      await phase('shift');
      hist = (hist * 2 + taken) % size;
      await ctx.emit({
        type: 'shift',
        payload: { step, taken, history: hist, historyBits },
      });
      const shifted = await pause(STEP_MS / 2);
      if (shifted !== 'go') return shifted;
    }

    await phase('score');
    const percent = total === 0 ? 0 : Math.floor(((total - misses) * 100 + Math.floor(total / 2)) / total);
    gauge('hit-percent', percent);
    await ctx.emit({
      type: 'round-end',
      payload: { trace, historyBits, size, misses, total, percent },
    });
    return 'done';
  };

  try {
    for (;;) {
      if (ctx.cancelled) return;
      const end = await playRound();
      if (end === 'cancelled') return;
      if (end === 'restart') continue;
      // 한 판이 끝났다 — 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (accept(input)) break;
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다 (C8).
    if (!ctx.cancelled) throw err;
  }
}
