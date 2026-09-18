/**
 * hybrid-search — 낱말 등수와 뜻 등수를 몫을 나눠 섞는다 (가중 RRF).
 *
 * 질의 하나와 문서 여덟이 있다. 낱말 쪽은 BM25 로 점수를 매겨 등수를 내고, 뜻 쪽은
 * 유사도로 등수를 낸다. 손잡이 `lexical` 이 낱말 쪽 몫 w (0..4, 곧 w/4) 를 정하면
 * 두 등수를 섞어 한 줄로 다시 세운다.
 *
 * ── 예로 정한 값
 *
 *   뜻 쪽 유사도(d1 0.60 · d2 0.86 · …)는 **예로 정한 값**이다 — 임베딩 모형이 낸 것이
 *   아니다. 정답 표시도 사람이 매긴 자료다. 질의와 문서 글은 실제 영어이고 번역하지 않는다.
 *
 * ── 셈의 규약
 *
 *   토큰    소문자 → `[a-z0-9]+` 로 가름 → 불용어 스물둘 제거. 어간 처리 없음.
 *   BM25    k1 = 1.2, b = 0.75, idf(t) = ln((N − n_t + 0.5)/(n_t + 0.5) + 1),
 *           |d| = 불용어를 뺀 토큰 수, avgdl = 토큰 수 평균 (이 자료에서 8.875).
 *   등수    점수 내림차순, **같으면 번호 오름차순**. 이 자료에서 걸린다 — BM25 0 점 넷
 *           (d2 · d5 · d7 · d8) 이 번호 차례로 5 · 6 · 7 · 8 위. 뜻 쪽 유사도는 백분율
 *           정수로 바꿔 견준다 (실수 동률을 믿지 않는다).
 *   섞기    점수 = w/(60 + 낱말 등수) + (4 − w)/(60 + 뜻 등수). 견주기는 통분한 정수
 *           num = w·(60+rv) + (4−w)·(60+rl), den = (60+rl)(60+rv) 로 `a·d` 대 `c·b`.
 *           실수 합으로 견주지 않는다.
 *   동률    번호 오름차순. 이 자료에서 **한 번** 걸린다 — 몫 50 % 에서 d1 (1, 5) 과
 *           d2 (5, 1) 이 정확히 같아 d1 이 앞선다.
 *
 * ── 이벤트 (발신 순서대로)
 *
 *   ladders  { top: number; docs: { lexScore: number; lexRank: number; vecRank: number; tokens: number;
 *                      relevant: boolean; noShared: boolean }[] }      — 처음 한 번, 두 등수 줄
 *   weigh    { weight: number; parts: number;
 *              fused: { num: number; den: number }[]; order: number[];
 *              lexShare: number[]; vecShare: number[] }                    — 몫을 매긴다 (걸음)
 *   seat     { doc: number; place: number; counted: boolean }           — 문서 하나가 합친 줄에 선다 (걸음)
 *   settle   { relevantTop: number; noSharedTop: number; top: number }   — 판을 마친다 (걸음)
 *   phase    { phase }                                                   — silent
 *
 *   doc 은 0 부터의 문서 색인, place 는 0 부터의 자리다. 화면과 글은 둘 다 1 부터 읽는다.
 *
 * ── phase 어휘 (irs.ts 와 같다)
 *
 *   'weigh' | 'seat' | 'count' | 'done'
 *
 * ── 메트릭
 *
 *   relevant-top-count     위 3 가운데 정답 수
 *   no-shared-word-count   위 3 가운데 BM25 가 0 인 (질의와 낱말이 하나도 안 겹친) 문서 수
 *
 * ── 입력
 *
 *   `lexical` — payload.value 가 사다리 `ladder` 의 수일 때만 받는다. 한 판을 끝까지
 *   재생한 뒤 기다리고, 받은 몫으로 다시 재생한다.
 */

import type { FacetContext, ReactiveContext } from '@ffacet/core/runtime';

export type HybridSearchDoc = {
  id: string;
  text: string;
  /** 사람이 매긴 정답 여부 (자료). */
  relevant: boolean;
  /** 뜻 쪽 유사도 — 예로 정한 값. */
  similarity: number;
};

export type HybridSearchData = {
  type: 'hybrid-search';
  query: string;
  docs: HybridSearchDoc[];
  stopwords: string[];
  k1: number;
  b: number;
  /** RRF 상수 (60). */
  rrfK: number;
  /** 몫을 나누는 칸 수 (4 — 몫 w 는 w/4). */
  parts: number;
  /** 위 몇 개를 재는가 (3). */
  top: number;
  /** 손잡이 사다리 — facet.ts 의 segments[].value 와 같다. */
  ladder: number[];
  /** 처음 몫 (사다리의 기본값). */
  weight: number;
  stepMs: number;
};

/** 토큰 — 소문자 → `[a-z0-9]+` → 불용어 제거. */
export function tokenize(text: string, stopwords: readonly string[]): string[] {
  const out: string[] = [];
  for (const m of text.toLowerCase().matchAll(/[a-z0-9]+/g)) {
    if (!stopwords.includes(m[0])) out.push(m[0]);
  }
  return out;
}

/** 점수 내림차순 · 같으면 번호 오름차순으로 등수(1 부터)를 매긴다. */
function rankBy(scoreCmp: (a: number, b: number) => number, n: number): number[] {
  const idx = Array.from({ length: n }, (_, i) => i);
  idx.sort((a, b) => scoreCmp(a, b) || a - b);
  const rank = new Array<number>(n).fill(0);
  idx.forEach((d, i) => {
    rank[d] = i + 1;
  });
  return rank;
}

export type HybridSearchBase = {
  queryTokens: string[];
  tokenCounts: number[];
  avgdl: number;
  lexScores: number[];
  lexRank: number[];
  vecRank: number[];
  relevant: boolean[];
  noShared: boolean[];
};

/** 몫과 무관한 바탕 — 토큰 · BM25 · 두 등수. */
export function computeBase(data: HybridSearchData): HybridSearchBase {
  const queryTokens = [...new Set(tokenize(data.query, data.stopwords))];
  const docTokens = data.docs.map((d) => tokenize(d.text, data.stopwords));
  const n = docTokens.length;
  const tokenCounts = docTokens.map((t) => t.length);
  const avgdl = tokenCounts.reduce((s, c) => s + c, 0) / n;
  const lexScores = docTokens.map((toks, di) => {
    let score = 0;
    for (const term of queryTokens) {
      const tf = toks.filter((t) => t === term).length;
      if (tf === 0) continue;
      const nt = docTokens.filter((dt) => dt.includes(term)).length;
      const idf = Math.log((n - nt + 0.5) / (nt + 0.5) + 1);
      const len = tokenCounts[di]!;
      score += (idf * tf * (data.k1 + 1)) / (tf + data.k1 * (1 - data.b + (data.b * len) / avgdl));
    }
    return score;
  });
  // BM25 는 실수 합이라 동률 판정을 믿지 않는다 — 0 점만 정확히 같고 나머지는 서로 멀다.
  const lexRank = rankBy((a, b) => {
    const d = lexScores[b]! - lexScores[a]!;
    return d > 0 ? 1 : d < 0 ? -1 : 0;
  }, n);
  // 유사도는 백분율 정수로 견준다.
  const vecPct = data.docs.map((d) => Math.round(d.similarity * 100));
  const vecRank = rankBy((a, b) => vecPct[b]! - vecPct[a]!, n);
  return {
    queryTokens,
    tokenCounts,
    avgdl,
    lexScores,
    lexRank,
    vecRank,
    relevant: data.docs.map((d) => d.relevant),
    noShared: lexScores.map((s) => s === 0),
  };
}

export type HybridSearchFusion = {
  /** 문서마다 통분한 분자 · 분모. */
  fused: { num: number; den: number }[];
  /** 합친 줄의 차례 (문서 색인). */
  order: number[];
  relevantTop: number;
  noSharedTop: number;
  /**
   * 문서마다 낱말 쪽 · 뜻 쪽에서 받는 몫 — w/(K+rl) 과 (parts−w)/(K+rv) 를 한쪽이 받을 수 있는
   * 가장 큰 몫 parts/(K+1) 로 나눈 0..1. 화면의 띠 굵기다 (셈은 여기 한 곳).
   */
  lexShare: number[];
  vecShare: number[];
  /** 섞은 점수가 정확히 같은 문서 쌍 (문서 색인, 앞 번호가 먼저). */
  ties: [number, number][];
};

/** 몫 w 로 두 등수를 섞는다. 분수로 정확히 견주고 동률은 번호 오름차순. */
export function fuse(base: HybridSearchBase, w: number, data: HybridSearchData): HybridSearchFusion {
  const K = data.rrfK;
  const parts = data.parts;
  const fused = base.lexRank.map((rl, i) => {
    const rv = base.vecRank[i]!;
    return { num: w * (K + rv) + (parts - w) * (K + rl), den: (K + rl) * (K + rv) };
  });
  const ties: [number, number][] = [];
  for (let i = 0; i < fused.length; i += 1) {
    for (let j = i + 1; j < fused.length; j += 1) {
      if (fused[i]!.num * fused[j]!.den === fused[j]!.num * fused[i]!.den) ties.push([i, j]);
    }
  }
  const order = fused.map((_, i) => i);
  order.sort((a, b) => {
    const left = fused[b]!.num * fused[a]!.den;
    const right = fused[a]!.num * fused[b]!.den;
    return left - right || a - b;
  });
  const topDocs = order.slice(0, data.top);
  const full = parts / (K + 1);
  return {
    fused,
    order,
    lexShare: base.lexRank.map((rl) => w / (K + rl) / full),
    vecShare: base.vecRank.map((rv) => (parts - w) / (K + rv) / full),
    relevantTop: topDocs.filter((d) => base.relevant[d]).length,
    noSharedTop: topDocs.filter((d) => base.noShared[d]).length,
    ties,
  };
}

function isData(v: unknown): v is HybridSearchData {
  if (!v || typeof v !== 'object') return false;
  const d = v as Record<string, unknown>;
  return (
    d.type === 'hybrid-search' &&
    typeof d.query === 'string' &&
    Array.isArray(d.docs) &&
    Array.isArray(d.stopwords) &&
    Array.isArray(d.ladder) &&
    typeof d.weight === 'number'
  );
}

export async function hybridSearchAlgorithm(rawCtx: FacetContext<HybridSearchData>): Promise<void> {
  const ctx = rawCtx as ReactiveContext<HybridSearchData>;
  const data = ctx.data;
  if (!isData(data)) return;
  const stepMs = typeof data.stepMs === 'number' ? data.stepMs : 900;
  const base = computeBase(data);

  const phase = (name: string) => ctx.emit({ type: 'phase', payload: { phase: name }, silent: true });

  /** 계기에 지금 보일 값을 둔다 — 차이만 보낸다. 처음 한 번은 0 이어도 보낸다. */
  const shown = new Map<string, number>();
  const gauge = (name: string, value: number): void => {
    const prev = shown.get(name);
    if (prev !== undefined && prev === value) return;
    ctx.metric(name, value - (prev ?? 0));
    shown.set(name, value);
  };

  let w = data.ladder.includes(data.weight) ? data.weight : data.ladder[0]!;

  try {
    await ctx.emit({
      type: 'ladders',
      payload: {
        top: data.top,
        docs: base.lexRank.map((lexRank, i) => ({
          lexScore: base.lexScores[i]!,
          lexRank,
          vecRank: base.vecRank[i]!,
          tokens: base.tokenCounts[i]!,
          relevant: base.relevant[i]!,
          noShared: base.noShared[i]!,
        })),
      },
    });

    for (;;) {
      if (ctx.cancelled) return;
      const fusion = fuse(base, w, data);

      // 몫을 매긴다 — 판이 바뀌므로 계기를 0 으로 되돌린다.
      await phase('weigh');
      await ctx.emit({
        type: 'weigh',
        payload: {
          weight: w,
          parts: data.parts,
          fused: fusion.fused,
          order: fusion.order,
          lexShare: fusion.lexShare,
          vecShare: fusion.vecShare,
        },
      });
      gauge('relevant-top-count', 0);
      gauge('no-shared-word-count', 0);
      if (!(await ctx.sleep(stepMs))) return;

      let hits = 0;
      let none = 0;
      for (let place = 0; place < fusion.order.length; place += 1) {
        if (ctx.cancelled) return;
        const doc = fusion.order[place]!;
        const inTop = place < data.top;
        const counted = inTop && base.relevant[doc]!;
        if (counted) await phase('count');
        else await phase('seat');
        await ctx.emit({ type: 'seat', payload: { doc, place, counted } });
        if (counted) hits += 1;
        if (inTop && base.noShared[doc]) none += 1;
        gauge('relevant-top-count', hits);
        gauge('no-shared-word-count', none);
        if (!(await ctx.sleep(stepMs))) return;
      }

      await phase('done');
      await ctx.emit({
        type: 'settle',
        payload: { relevantTop: hits, noSharedTop: none, top: data.top },
      });
      if (!(await ctx.sleep(stepMs))) return;

      // 손잡이를 기다린다. 우리 것이 아닌 입력은 흘린다.
      let next: number | null = null;
      for (;;) {
        if (ctx.cancelled) return;
        const input = await ctx.waitForInput();
        if (ctx.cancelled) return;
        if (input.type !== 'lexical') continue;
        const p = input.payload;
        const v = p && typeof p === 'object' ? (p as Record<string, unknown>).value : undefined;
        if (typeof v !== 'number' || !data.ladder.includes(v)) continue;
        next = v;
        break;
      }
      w = next;
    }
  } catch (err) {
    if (!ctx.cancelled) throw err;
  }
}
