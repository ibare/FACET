/**
 * short-waits-for-long — 한 묶음의 요청 넷이 함께 시작해 가장 긴 것이 끝날 때까지 함께 돈다.
 *
 * 답은 소문자 낱말을 공백 하나로 가른 것이고 낱말 하나가 토큰 하나다. 걸음 t 에 아직 안 끝난
 * 요청은 답의 t 번째 토큰을 내고, 끝난 요청은 빈칸 하나를 차지한다. 묶음은 가장 긴 요청이
 * 끝나는 걸음에 끝난다. 걸음 수 · 칸 · 빈칸 · 기다린 걸음의 셈은 이 파일의 순수 함수
 * (`batchSteps` · `cellAt` · `tallyAt` · `blankPercent`)가 한 곳에서 한다 — 장면과 무대는
 * 이것을 가져다 쓴다. 따로 세면 두 자리가 언젠가 갈린다.
 *
 * 이벤트 (전부 silent 아님):
 *   init  payload: { requests: { id: string; words: string[] }[] }
 *         묶음에 든 요청과 그 답의 토큰. 걸음 0.
 *   step  payload: { t: number }
 *         걸음 t — 넷이 함께 한 칸씩 는다. t 는 1 부터 가장 긴 답의 길이까지.
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export interface ShortWaitsForLongFacetData {
  type: 'short-waits-for-long';
  /** 걸음 뒤 머무는 ms. */
  stepMs: number;
  /** 한 묶음의 요청. `answer` 는 예로 정한 답 — 낱말 하나 = 토큰 하나. */
  requests: { id: string; answer: string }[];
}

export interface BatchRequest {
  id: string;
  words: string[];
}

/** 묶음이 끝나는 걸음 = 가장 긴 답의 길이. */
export function batchSteps(requests: readonly BatchRequest[]): number {
  let n = 0;
  for (const r of requests) if (r.words.length > n) n = r.words.length;
  return n;
}

/** 걸음 t 에 요청 r 이 낸 토큰. 이미 끝났으면 null — 빈칸. */
export function cellAt(r: BatchRequest, t: number): string | null {
  return t <= r.words.length ? (r.words[t - 1] ?? null) : null;
}

export interface Tally {
  /** 걸음 t 한 걸음의 토큰 칸과 빈칸. */
  tokensNow: number;
  blanksNow: number;
  /** 걸음 1..t 의 누계. */
  cells: number;
  used: number;
  blanks: number;
  /** 요청마다 끝난 뒤 기다린 걸음. 아직 안 끝났으면 null. */
  waited: (number | null)[];
}

export function tallyAt(requests: readonly BatchRequest[], t: number): Tally {
  let tokensNow = 0;
  let blanksNow = 0;
  let used = 0;
  let blanks = 0;
  const waited: (number | null)[] = [];
  for (const r of requests) {
    const len = r.words.length;
    if (t >= 1) {
      if (cellAt(r, t) === null) blanksNow += 1;
      else tokensNow += 1;
    }
    const u = Math.min(t, len);
    used += u;
    blanks += t - u;
    waited.push(t >= len ? t - len : null);
  }
  return { tokensNow, blanksNow, cells: used + blanks, used, blanks, waited };
}

/** 빈칸 비율 백분율 — 정수로 반올림 (43.75 → 44). */
export function blankPercent(tally: Tally): number {
  if (tally.cells === 0) return 0;
  return Math.round((tally.blanks * 100) / tally.cells);
}

export async function shortWaitsForLong(
  context: FacetContext<ShortWaitsForLongFacetData>,
): Promise<void> {
  const ctx = context as ReactiveContext<ShortWaitsForLongFacetData>;
  const stepMs = ctx.data.stepMs;
  const requests = ctx.data.requests.map((r) => ({
    id: r.id,
    words: r.answer.split(' ').filter((w) => w.length > 0),
  }));
  const steps = batchSteps(requests);

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  await ctx.emit({ type: 'init', payload: { requests } });

  for (let t = 1; t <= steps; t += 1) {
    if (!(await pause())) return;
    await ctx.emit({ type: 'step', payload: { t } });
  }
}
