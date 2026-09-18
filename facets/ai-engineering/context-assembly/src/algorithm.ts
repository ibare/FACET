/**
 * 맥락 조립 — 찾아온 조각을 예산 안에서 담고, 담은 것을 맥락의 자리에 놓는다.
 *
 * 한 판은 세 단계다.
 *   1. 담기 — 등수 차례로 조각의 낱말 수를 더해 간다. 누적이 예산을 **넘는** 첫 조각에서
 *      멈춘다. 그 뒤의 조각은 보지 않는다 (조각 `budget-runs-out` 과 같은 규약).
 *   2. 놓기 — 담은 n 개를 등수 차례로 자리에 앉힌다.
 *        등수대로(order 0)     등수 k 는 자리 k
 *        끝부터 번갈아(order 1) k 가 짝수면 앞에서 비어 있는 가장 앞 자리,
 *                              홀수면 뒤에서 비어 있는 가장 뒤 자리
 *   3. 거리 — 답 조각의 자리 p (0 기준) 에서 min(p, n − 1 − p). 조각 `lost-in-the-middle` 의
 *      d 와 같은 셈이다.
 *
 * 한 판을 끝까지 재생한 뒤 손잡이 입력을 기다리고, 받은 값으로 다시 재생한다 (reactive).
 *
 * ── 셈하는 것과 셈하지 않는 것
 *
 * 셈하는 것은 **자리와 거리뿐**이다. 모형이 가운데를 덜 쓴다는 것은 실측 연구
 * (Liu 외 2023, "Lost in the Middle") 가 보고한 경향이고, 여기서는 쓰임 · 정답률 · 주의 가중
 * 같은 수를 셈하지도 띄우지도 않는다.
 *
 * ── 예로 정한 값
 *
 * 검색기의 등수(조각 여덟의 차례)는 예로 정한 것이다. 답 조각을 4 위에 둔 것은 설계이고,
 * 3 위의 `16 July` 가 날짜로 헷갈리게 했다. 조각 글은 공개된 사실(아폴로 11 호)이다.
 * 낱말 = 공백으로 가른 덩이이고 **낱말 하나를 토큰 하나로 친다** — 실제 토크나이저가 아니다.
 *
 * ── 동률
 *
 * 등수는 자료가 준 차례라 동률이 없다. 거리의 두 끝이 같은 자리(p = (n − 1) / 2)는
 * min 이 어느 쪽을 골라도 같은 값이라 규칙이 필요 없다 — 이 데이터의 여덟 조합에서는
 * 한 번도 걸리지 않는다 (답의 자리 · n: 4·4, 3·4, 4·5, 4·5, 4·6, 5·6, 4·8, 7·8).
 *
 * ── 이벤트 (전부 await, type 은 리터럴)
 *
 *   phase        { phase }                                   silent
 *   round-start  { budget, order, lengths }                  — 새 판. 예산 문턱을 옮긴다.
 *                                                              lengths = 조각의 낱말 수 (stage 가 다시 세지 않게)
 *   admit        { rank, words, used, budget }               — 조각 하나가 예산 안에 든다
 *   overflow     { rank, words, used, budget, leftOut }      — 넘는 첫 조각이 튕긴다.
 *                                                              leftOut = 밖에 남은 수 (그 뒤 전부 포함)
 *   seat         { rank, side: 'front' | 'back', slot, count } — 조각 하나가 자리에 앉는다.
 *                                                              slot 은 0 기준 최종 자리
 *   depth        { answer, slot, count, depth, leftOut, slots } — 답 조각의 거리
 *
 *   rank · answer · slot 은 0 기준 색인이다. 화면은 하나를 더해 1 부터 읽는다.
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *
 *   'fill' | 'overflow' | 'place' | 'depth'
 *
 * ── 계기 (계기는 누적 채널이라 지금 값을 들고 차이만 보낸다)
 *
 *   chunk-count      담은 조각 수
 *   used-word-count  담은 조각의 낱말 수 합
 *   answer-depth     답 조각에서 가까운 끝까지의 거리
 */

import type { FacetContext, ReactiveContext, ReactiveInputEvent } from '@ffacet/core/runtime';

export type ContextAssemblyData = {
  type: 'context-assembly';
  /** 질문 (자료 — 번역하지 않는다) */
  question: string;
  /** 조각 여덟, 검색기가 매긴 등수 차례 (자료 — 번역하지 않는다) */
  chunks: string[];
  /** 답 조각의 등수 (1 부터) */
  answerRank: number;
  /** 손잡이 `budget` 의 사다리 (낱말) */
  budgets: number[];
  /** 손잡이 `order` 의 사다리 — 0 등수대로 · 1 끝부터 번갈아 */
  orders: number[];
  /** 첫 판의 예산 · 놓는 법 (손잡이의 default 와 같다) */
  budget: number;
  order: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

/** 낱말 = 공백으로 가른 덩이. */
export function wordCount(text: string): number {
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function isData(raw: unknown): raw is ContextAssemblyData {
  if (typeof raw !== 'object' || raw === null) return false;
  const d = raw as Record<string, unknown>;
  const nums = (v: unknown): v is number[] =>
    Array.isArray(v) && v.every((x) => typeof x === 'number');
  if (typeof d.question !== 'string') return false;
  if (!Array.isArray(d.chunks) || !d.chunks.every((c) => typeof c === 'string')) return false;
  if (typeof d.answerRank !== 'number' || typeof d.stepMs !== 'number') return false;
  if (!nums(d.budgets) || !nums(d.orders)) return false;
  if (typeof d.budget !== 'number' || typeof d.order !== 'number') return false;
  return true;
}

/** 손잡이 입력의 값 — number 이고 사다리에 속할 때만 받는다 (C9). */
function readKnob(input: ReactiveInputEvent, ladder: readonly number[]): number | null {
  const p = input.payload;
  if (typeof p !== 'object' || p === null) return null;
  const v = (p as { value?: unknown }).value;
  if (typeof v !== 'number' || !ladder.includes(v)) return null;
  return v;
}

export async function contextAssemblyAlgorithm(
  base: FacetContext<ContextAssemblyData>,
): Promise<void> {
  const ctx = base as ReactiveContext<ContextAssemblyData>;
  if (!isData(ctx.data)) return;
  const data = ctx.data;

  const lengths = data.chunks.map(wordCount);
  const total = lengths.length;
  const answer = data.answerRank - 1;
  const stepMs = data.stepMs;

  const phase = (name: string) =>
    ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 걸음 사이의 문. 끝까지 지났으면 true, 취소됐으면 false. */
  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  // 계기는 더하기만 하는 채널이다. 지금 보이는 값을 들고 차이만 보낸다.
  // 처음 한 번은 차이가 0 이어도 보낸다 — 계기 이름이 실리게.
  const shown = new Map<string, number>();
  function gauge(name: string, value: number): void {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  }

  /** 한 판. 끝까지 재생했으면 true, 취소됐으면 false. */
  async function playRound(budget: number, order: number): Promise<boolean> {
    await ctx.emit({ type: 'round-start', payload: { budget, order, lengths: [...lengths] } });
    gauge('chunk-count', 0);
    gauge('used-word-count', 0);

    // 1. 담기
    let n = 0;
    let used = 0;
    while (n < total) {
      if (ctx.cancelled) return false;
      const words = lengths[n]!;
      if (used + words > budget) {
        await phase('overflow');
        await ctx.emit({
          type: 'overflow',
          payload: { rank: n, words, used, budget, leftOut: total - n },
        });
        if (!(await pause())) return false;
        break;
      }
      used += words;
      n += 1;
      await phase('fill');
      await ctx.emit({ type: 'admit', payload: { rank: n - 1, words, used, budget } });
      gauge('chunk-count', n);
      gauge('used-word-count', used);
      if (!(await pause())) return false;
    }

    // 2. 놓기
    const slots: number[] = [];
    let front = 0;
    let back = n - 1;
    for (let k = 0; k < n; k += 1) {
      if (ctx.cancelled) return false;
      let side: 'front' | 'back';
      if (order === 1 && k % 2 === 1) {
        slots.push(back);
        back -= 1;
        side = 'back';
      } else {
        slots.push(front);
        front += 1;
        side = 'front';
      }
      await phase('place');
      await ctx.emit({ type: 'seat', payload: { rank: k, side, slot: slots[k], count: n } });
      if (!(await pause())) return false;
    }

    // 3. 거리 — 이 걸음의 경계는 뒤이은 입력 기다림이다
    const p = answer < n ? slots[answer]! : -1;
    const depth = p < 0 ? -1 : Math.min(p, n - 1 - p);
    await phase('depth');
    await ctx.emit({
      type: 'depth',
      payload: { answer, slot: p, count: n, depth, leftOut: total - n, slots: [...slots] },
    });
    // answer-depth 는 판 끝(이 걸음)에서만 갱신한다. 담기 · 놓기 도중에는 앞 판의 값을 그대로 둔다 —
    // 도중에 0 으로 되돌리면 "거리 0(답이 끝에 있다)" 이라는 참인 값과 구별되지 않고, 판이 덜 선
    // 맥락의 거리는 사양의 셈(최종 n 에 대한 min(p, n − 1 − p))이 아니기 때문이다.
    if (depth >= 0) gauge('answer-depth', depth);
    return !ctx.cancelled;
  }

  let budget = data.budget;
  let order = data.order;

  try {
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await playRound(budget, order))) return;

      // 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type === 'budget') {
          const v = readKnob(input, data.budgets);
          if (v === null) continue;
          budget = v;
          break;
        }
        if (input.type === 'order') {
          const v = readKnob(input, data.orders);
          if (v === null) continue;
          order = v;
          break;
        }
      }
    }
  } catch (err) {
    // reset/destroy 가 waitForInput 을 reject 한 것은 정상 종료 경로다.
    if (!ctx.cancelled) throw err;
  }
}
