/**
 * reranking — 꼼꼼하지만 비싼 재순위기에 몇 개를 넘겨야 하는가.
 *
 * 첫 단계가 문서 열둘을 첫 단계 점수 내림차순으로 세운다. 그 앞 n 개만 재순위기에
 * 넘기고, 재순위기는 그 n 개를 재순위 점수 내림차순으로 다시 세운다. 최종 줄은
 * 다시 세운 n 개 뒤에 나머지가 첫 단계 차례 그대로 붙는다. 위 3 이 답이다.
 *
 * ── 예로 정한 값
 *
 * 첫 단계 점수와 재순위 점수(둘 다 0~100 정수)는 **예로 정한 값**이다. 어떤 벡터
 * 검색이나 재순위 모형이 실제로 낸 수가 아니다. 문서의 정답 여부는 사람이 매긴
 * 것으로 둔다. 문서 글과 질의는 실제 영어 글이며 자료(`initialData`)에 있다.
 *
 * ── 동률 규칙
 *
 * 두 점수 모두 같으면 문서 번호가 작은 쪽이 앞선다. 이 데이터에서 동률은 첫 단계
 * 점수 · 재순위 점수 모두 0 건이다 (검사가 센다).
 *
 * ── 재순위기는 넘겨받은 것만 본다
 *
 * 넘기지 않은 문서의 재순위 점수는 셈하지 않는다 — 자료에 있어도 "아직 안 본 것" 이다.
 * `score` 이벤트는 넘겨받은 n 개에 대해서만 나간다.
 *
 * ── 이벤트 (payload 의 문서 번호 · 자리는 모두 1 부터)
 *
 *   phase     { phase: 'shortlist' | 'score' | 'swap' | 'count' }          silent
 *   shortlist { n: number, order: number[] }      문턱을 n 에 둔다. order = 첫 단계 차례
 *   score     { doc: number, score: number, slot: number, calls: number }
 *                                                  재순위기가 slot 자리의 문서 하나를 읽었다
 *   reorder   { order: number[], n: number, moved: number }
 *                                                  넘겨받은 n 개를 다시 세웠다. order = 최종 줄
 *   answer    { top: number[], relevant: number[], hits: number, calls: number, order: number[],
 *               leftRelevant: number[] }
 *                                                  위 3 과 그 정답 여부(1/0), 최종 줄,
 *                                                  문턱 아래 남은 정답 문서 번호(오름차순)
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *
 *   shortlist — 문턱 안만 도는 바깥 루프
 *   score     — 재순위 점수를 견주는 줄
 *   swap      — 가장 큰 것을 제자리로 바꿔 넣는 줄
 *   count     — 위 3 의 정답을 세는 줄
 *
 * 걸음 경계는 `ctx.sleep` 하나뿐이다. 네 phase 는 각각 뒤에 걸음 경계를 두어 코드 패널에서
 * 한 번씩 켜진다.
 *
 * ── 메트릭 (판마다 지금 값을 보인다 — 누적하지 않는다)
 *
 *   rerank-count        재순위기 호출 = 넘긴 수 n
 *   relevant-top-count  위 3 의 정답 수
 *   moved-count         최종 줄의 자리가 첫 단계 자리와 다른 문서 수
 *
 * ── 입력
 *
 *   shortlist { value: number, segmentIndex: number }   value 는 사다리(shortlists) 안의 수
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type RerankingDoc = {
  /** 문서 번호 (1 부터) */
  id: number;
  /** 문서 글 (자료 — 번역하지 않는다) */
  text: string;
  /** 사람이 매긴 정답 여부 */
  relevant: boolean;
  /** 첫 단계 점수 (예로 정한 값) */
  first: number;
  /** 재순위 점수 (예로 정한 값) */
  cross: number;
};

export type RerankingData = {
  type: 'reranking';
  query: string;
  docs: RerankingDoc[];
  /** 손잡이 사다리 */
  shortlists: number[];
  /** 기본으로 넘기는 수 */
  shortlist: number;
  /** 걸음 뒤 머무는 ms */
  stepMs: number;
};

/** 위 몇 개를 답으로 보는가 — 맥락에 넣을 셋. */
export const TOP_K = 3;

/** 첫 단계 차례 — 첫 단계 점수 내림차순, 같으면 번호 오름차순. 문서 번호 배열. */
export function firstStageOrder(docs: readonly RerankingDoc[]): number[] {
  return [...docs]
    .sort((a, b) => (b.first !== a.first ? b.first - a.first : a.id - b.id))
    .map((d) => d.id);
}

/**
 * 앞 n 개만 재순위 점수로 다시 세운다 — 선택 정렬, irs.ts 의 `rerankTop` 과 같은 걸음.
 * 더 크거나, 같으면 번호가 더 작을 때만 가장 좋은 자리를 바꾼다.
 */
export function rerankOrder(order: readonly number[], crossOf: (doc: number) => number, n: number): number[] {
  const out = [...order];
  const m = Math.min(n, out.length);
  for (let i = 0; i < m; i++) {
    let best = i;
    for (let j = i + 1; j < m; j++) {
      const c = crossOf(out[j]);
      const cb = crossOf(out[best]);
      if (c > cb || (c === cb && out[j] < out[best])) best = j;
    }
    const tmp = out[i];
    out[i] = out[best];
    out[best] = tmp;
  }
  return out;
}

/** 자리 바뀐 문서 수. */
export function movedCount(before: readonly number[], after: readonly number[]): number {
  let moved = 0;
  for (let i = 0; i < after.length; i++) if (after[i] !== before[i]) moved += 1;
  return moved;
}

export async function rerankingAlgorithm(rawCtx: FacetContext<RerankingData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<RerankingData>;
  const data = ctx.data;
  const docs = data.docs;
  const ladder = data.shortlists;
  const stepMs = data.stepMs;
  const byId = new Map<number, RerankingDoc>();
  for (const d of docs) byId.set(d.id, d);
  const crossOf = (doc: number): number => byId.get(doc)?.cross ?? 0;

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 계기는 더하기만 한다 — 지금 보이는 값을 쥐고 차이만 보낸다. 처음 한 번은 0 이어도 보낸다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  /** 한 판 — 문턱을 두고, 넘긴 것만 읽고, 다시 세우고, 위 3 을 센다. 끝까지 갔으면 true. */
  async function round(n: number): Promise<boolean> {
    const first = firstStageOrder(docs);

    await phase('shortlist');
    await ctx.emit({ type: 'shortlist', payload: { n, order: first } });
    gauge('rerank-count', 0);
    gauge('moved-count', 0);
    gauge('relevant-top-count', 0);
    if (!(await ctx.sleep(stepMs))) return false;

    for (let i = 0; i < n; i++) {
      if (ctx.cancelled) return false;
      const doc = first[i];
      await phase('score');
      await ctx.emit({ type: 'score', payload: { doc, score: crossOf(doc), slot: i + 1, calls: i + 1 } });
      gauge('rerank-count', i + 1);
      if (!(await ctx.sleep(stepMs))) return false;
    }

    const order = rerankOrder(first, crossOf, n);
    const moved = movedCount(first, order);
    await phase('swap');
    await ctx.emit({ type: 'reorder', payload: { order, n, moved } });
    gauge('moved-count', moved);
    if (!(await ctx.sleep(stepMs))) return false;

    const top = order.slice(0, TOP_K);
    const relevant: number[] = top.map((d) => (byId.get(d)?.relevant ? 1 : 0));
    const hits = relevant.reduce((a, b) => a + b, 0);
    // 문턱 아래 남은 정답 — 넘기지 않았으니 영영 위로 오지 못한다.
    const leftRelevant = order
      .slice(n)
      .filter((d) => byId.get(d)?.relevant === true)
      .sort((a, b) => a - b);
    await phase('count');
    await ctx.emit({ type: 'answer', payload: { top, relevant, hits, calls: n, order, leftRelevant } });
    gauge('relevant-top-count', hits);
    return ctx.sleep(stepMs);
  }

  try {
    let n = ladder.includes(data.shortlist) ? data.shortlist : ladder[0];
    for (;;) {
      if (ctx.cancelled) return;
      if (!(await round(n))) return;
      // 한 판을 끝냈다 — 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'shortlist') continue;
        const p = input.payload;
        const v = p && typeof p === 'object' ? (p as { value?: unknown }).value : undefined;
        if (typeof v !== 'number' || !ladder.includes(v)) continue;
        n = v;
        break;
      }
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
