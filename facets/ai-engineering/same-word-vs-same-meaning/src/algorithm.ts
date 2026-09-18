/**
 * same-word-vs-same-meaning — 낱말로 찾는 검색과 뜻으로 찾는 검색은 무엇을 다르게 찾아오는가.
 *
 * 같은 질의와 같은 다섯 문서를 두 잣대로 따로 줄 세운다.
 *   - 낱말 쪽: BM25. 토큰 = 소문자화 → `[a-z0-9]+` 로 가름 → 불용어 제거 (어간 처리 없음)
 *     점수 = Σ_질의토큰 idf(t) · tf·(k1+1) / (tf + k1·(1 − b + b·|d|/avgdl)),
 *     idf(t) = ln((N − n_t + 0.5)/(n_t + 0.5) + 1)
 *   - 뜻 쪽: 코사인 = 내적 / (두 길이의 곱).
 *     벡터는 **예로 정한 값**이다 — 임베딩 모형의 출력이 아니고 축에도 이름이 없다.
 *     `initialData` 에 준 그대로, 정규화하지 않고 넣는다
 * 등수는 점수 내림차순, 같으면 식별자 오름차순 (이 자료에서는 BM25 의 d2 · d5 = 0 에서 걸린다).
 *
 * 이벤트 (전부 silent 아님 — 걸음마다 하나)
 *   init     { query: QueryWord[]; queryVector: number[];
 *              docs: { id: string; words: DocWord[]; overlap: number; vector: number[] }[] }
 *            질의 · 문서의 낱말(공백으로 가른 덩이)과 각 낱말이 질의 토큰과 겹치는지.
 *            overlap = 문서에 든 서로 다른 질의 토큰 수
 *   score    { side: 'words' | 'meaning'; scores: number[] }   문서 순서(식별자 순)대로의 점수
 *   rank     { side: 'words' | 'meaning'; order: number[] }    위에서부터 선 문서 번호
 *   verdict  { rise: number; sink: number }
 *            rise = 낱말 쪽 등수 − 뜻 쪽 등수가 가장 큰 문서 (같으면 뜻 쪽 등수가 높은 쪽),
 *            sink = 그 값이 가장 작은 문서 (같으면 뜻 쪽 등수가 낮은 쪽).
 *            이 자료에서 sink 는 d1 · d3 이 −2 로 같아 뒤 규칙으로 d1 이 된다
 */
import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type SameWordVsSameMeaningFacetData = {
  type: 'same-word-vs-same-meaning';
  stepMs: number;
  query: string;
  queryVector: number[];
  docs: { id: string; text: string; vector: number[] }[];
  stopwords: string[];
  k1: number;
  b: number;
};

export type Side = 'words' | 'meaning';
export type QueryWord = { text: string; stop: boolean };
export type DocWord = { text: string; hit: boolean };

function tokens(text: string, stop: ReadonlySet<string>): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => !stop.has(t));
}

/** 점수 내림차순, 같으면 식별자 오름차순. */
function rankOrder(scores: number[], ids: string[]): number[] {
  return scores
    .map((_, i) => i)
    .sort((a, b) => scores[b]! - scores[a]! || (ids[a]! < ids[b]! ? -1 : ids[a]! > ids[b]! ? 1 : 0));
}

function bm25(docTokens: string[][], queryTokens: string[], k1: number, b: number): number[] {
  const n = docTokens.length;
  const avgdl = docTokens.reduce((s, d) => s + d.length, 0) / n;
  return docTokens.map((d) => {
    let score = 0;
    for (const t of queryTokens) {
      const tf = d.filter((x) => x === t).length;
      if (tf === 0) continue;
      const nt = docTokens.filter((x) => x.includes(t)).length;
      const idf = Math.log((n - nt + 0.5) / (nt + 0.5) + 1);
      score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * d.length) / avgdl));
    }
    return score;
  });
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * (b[i] ?? 0);
    na += a[i]! * a[i]!;
    nb += (b[i] ?? 0) * (b[i] ?? 0);
  }
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

export async function sameWordVsSameMeaning(
  ctxBase: FacetContext<SameWordVsSameMeaningFacetData>,
): Promise<void> {
  const ctx = ctxBase as ReactiveContext<SameWordVsSameMeaningFacetData>;
  const data = ctx.data;
  const stepMs = data.stepMs;
  const stop = new Set(data.stopwords.map((w) => w.toLowerCase()));

  async function pause(): Promise<boolean> {
    if (ctx.cancelled) return false;
    return (await ctx.sleep(stepMs)) && !ctx.cancelled;
  }

  const ids = data.docs.map((d) => d.id);
  const queryTokens = [...new Set(tokens(data.query, stop))];
  const querySet = new Set(queryTokens);
  const docTokens = data.docs.map((d) => tokens(d.text, stop));

  const query: QueryWord[] = data.query
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .map((w) => ({ text: w, stop: tokens(w, stop).length === 0 }));
  const docs = data.docs.map((d, i) => ({
    id: d.id,
    words: d.text
      .split(/\s+/)
      .filter((w) => w.length > 0)
      .map((w): DocWord => ({ text: w, hit: tokens(w, stop).some((t) => querySet.has(t)) })),
    overlap: queryTokens.filter((t) => docTokens[i]!.includes(t)).length,
    vector: [...d.vector],
  }));

  const wordScores = bm25(docTokens, queryTokens, data.k1, data.b);
  const meaningScores = data.docs.map((d) => cosine(data.queryVector, d.vector));
  const wordOrder = rankOrder(wordScores, ids);
  const meaningOrder = rankOrder(meaningScores, ids);

  // 두 줄 사이 등수 차 — 양수면 뜻 쪽에서 떠올랐다
  const shift = ids.map((_, i) => wordOrder.indexOf(i) - meaningOrder.indexOf(i));
  let rise = 0;
  let sink = 0;
  for (let i = 1; i < ids.length; i += 1) {
    if (ctx.cancelled) return;
    const m = meaningOrder.indexOf(i);
    if (shift[i]! > shift[rise]! || (shift[i] === shift[rise] && m < meaningOrder.indexOf(rise))) {
      rise = i;
    }
    if (shift[i]! < shift[sink]! || (shift[i] === shift[sink] && m > meaningOrder.indexOf(sink))) {
      sink = i;
    }
  }

  // 첫 걸음은 문 밖에 둔다 — 마운트 직후 빈 화면을 두지 않는다
  await ctx.emit({
    type: 'init',
    payload: { query, queryVector: [...data.queryVector], docs },
  });

  if (!(await pause())) return;
  await ctx.emit({ type: 'score', payload: { side: 'words', scores: wordScores } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'rank', payload: { side: 'words', order: wordOrder } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'score', payload: { side: 'meaning', scores: meaningScores } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'rank', payload: { side: 'meaning', order: meaningOrder } });

  if (!(await pause())) return;
  await ctx.emit({ type: 'verdict', payload: { rise, sink } });
}
