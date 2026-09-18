/**
 * hybridSearch 개념 선언.
 *
 * canonical facet 은 `facet:hybridSearch` — 완제품이다. 질의 하나와 문서 여덟이 있고,
 * 왼쪽 가장자리에 BM25 등수 줄, 오른쪽 가장자리에 뜻 쪽 등수 줄이 선다. 문서마다 두 줄에서
 * 띠가 나와 가운데 합친 줄에 닿고, 띠의 굵기가 그쪽에서 받는 몫이다. 손잡이 "Share for
 * words" 를 0 · 25 · 50 · 75 · 100 % 로 옮기면 합친 줄이 한 칸씩 다시 서고, 두 계기가
 * 위 3 의 정답 수(2 · 3 · 3 · 1 · 1)와 낱말이 하나도 안 겹친 수(3 · 2 · 2 · 0 · 0)를 센다.
 * 코드 패널은 비어서 시작하고, 펴면 섞는 자리만 보인다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **몫을 어떻게 나누느냐가 위에 오는 것을 정하고, 양 끝이 둘 다
 * 진다** 는 것이다 — 손잡이로 여러 판을 잇는 전체다. definition 의 주어가 "나눈 몫(weight
 * split)" 이고 꼬리가 "양 끝은 가운데가 지키는 정답을 잃는다" 다.
 *
 * 어휘는 형제와 나눴다 (주어 층위 가르기 + 어휘 배타).
 *  - `sameWordVsSameMeaning` 은 두 잣대가 **한 판에서** 줄을 다르게 세운다는 장면을 맡는다.
 *    그쪽 낱말(keyword · embedding · reworded · sinks · climbs)은 여기 definition 에 쓰지 않았다.
 *  - `fuseTwoRankings` 는 단위가 다른 점수를 버리고 등수로 합치는 셈을 맡는다. 그쪽 낱말
 *    (lists · units · rank · 1/(k + r) · discarding)도 쓰지 않았다.
 *  여기 남은 것은 weight · split · term · meaning · passages · balanced 다.
 *
 * ── 전제
 *
 * 뜻 쪽 유사도(d1 0.60 · d2 0.86 …)는 예로 정한 값이고 정답 표시도 사람이 매긴 자료다.
 * BM25 는 실제로 셈한다 (k1 1.2 · b 0.75 · 어간 처리 없음). avoidWhen 에 밝혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const hybridSearchConcept: FacetConceptSource = {
  id: 'hybridSearch',
  label: 'Hybrid Search (Splitting the Weight Between Terms and Meaning)',
  canonicalFacet: 'facet:hybridSearch',

  surface: {
    definition:
      'How the weight split between exact term matching and closeness of meaning decides which passages reach the top of a retrieval, where leaning fully either way loses correct answers that a balanced split keeps.',
    exemplarKeywords: [
      'hybrid search',
      'hybrid retrieval',
      'sparse plus dense retrieval',
      'alpha parameter for hybrid search',
      'how much weight to give BM25 versus vectors',
      'weighted reciprocal rank fusion',
      'tuning retrieval for RAG',
      'error codes and product numbers in search',
      'vector search misses exact identifiers',
      'balance between lexical and semantic retrieval',
    ],
  },

  briefing: {
    observable: [
      'The query is "update fails with error 0x80070005" against eight documents, three of which are marked relevant: d1 quotes the code and explains it, while d2 and d5 describe a patch install stopped by missing permission without using any of the query\'s words. A trap sits among them — d6 quotes the same code but is about a printer.',
      'The left edge holds the order by words, each entry showing its BM25 score to four decimals; the right edge holds the order by meaning, each entry showing its similarity to two decimals. Four documents (d2, d5, d7, d8) score exactly 0 on the left, carry a ∅ mark, and take places 5 to 8 by document number.',
      'From each document a ribbon leaves both edges and meets in the fused column in the middle, and the thickness of a ribbon is the share that side contributes. Moving the handle toward words thickens every left ribbon and thins every right one before any document moves.',
      'Documents then take their new places one per step, passing the ones not yet seated and crossing the line that marks the top 3, and each seating is captioned with the place number and the full text of the document.',
      'At 0 % for words the fused order is d2 d5 d7 d8 d1 d4 d3 d6: d1, the document quoting the code, sits fifth under two unrelated ones. At 100 % it is d1 d6 d4 d3 d2 d5 d7 d8: the printer document rises to second and both reworded answers fall out of the top 3.',
      'The gauge for relevant documents in the top 3 reads 2, 3, 3, 1, 1 from 0 % to 100 % — it rises and then falls — while the gauge for top-3 documents sharing no word with the query reads 3, 2, 2, 0, 0 and only ever falls.',
      'At 50 % d1 and d2 are exactly level, their fused scores matching to four decimals, and d1 is placed first because ties go to the lower document number; both are relevant, so the top 3 count is unaffected.',
      'The similarity figures on the right are example values chosen by hand so that documents close in sense sit higher, not the output of an embedding model, and the relevant marks are a human judgement in the data. The BM25 scores are actually computed, with k1 = 1.2, b = 0.75 and no stemming.',
    ],

    screen: {
      affordances: [
        'The screen plays one full round at the opening setting and then waits, holding the fused column until the handle moves; each new setting replays the round from the reweighting onward.',
        'A five-position handle labelled "Share for words" with stops at 0 %, 25 %, 50 %, 75 % and 100 %, opening at 0 % — pure meaning — so the first thing seen is the code-quoting document stuck in fifth place.',
        'Playback controls for running, stepping, pausing, resetting and changing speed, beside two live gauges: relevant documents in the top 3, and top-3 documents that share no word with the query.',
        'A code panel titled "Fusing the two ranks" starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#, at most two side by side. It holds only the mixing and the top-3 count; the BM25 scoring and both orders are computed outside it and passed in as integer arrays.',
      ],
    },

    useWhen: [
      'An article recommends combining two retrievers and the reader wants to know which setting to pick. The relevant count going 2, 3, 3, 1, 1 across the handle shows there is no safe extreme to default to — the good settings are in the middle and both ends lose something different.',
      'The prose argues that exact identifiers such as error codes or part numbers need literal matching, and needs the counter-case alongside: the same literal match that lifts the right document also lifts a wrong one quoting the identical code in another context.',
      'A reader who has just switched a pipeline to pure vector retrieval wonders why an answer that quotes the query verbatim no longer appears first. At 0 % for words that document sits fifth, under two that only sound related.',
    ],

    avoidWhen: [
      'The subject is how the two underlying scorers work — how BM25 weighs rare terms, or how embeddings are produced. Both are taken as given here, and the side scored by meaning uses invented figures rather than any model.',
      'The article is about a second pass that reads each candidate closely with a heavier model. Nothing here is rescored after the mix; the fused column is the final order.',
      'The point concerns learning the weight automatically, or tuning it on a labelled set. Five fixed settings over one query and eight documents cannot stand in for that, and the relevance marks are hand-set data.',
      '"Hybrid" in the article means combining cloud and on-premise systems, or a hybrid model architecture. The word matches and the subject does not.',
    ],

    contrastWith: [
      {
        concept: 'sameWordVsSameMeaning',
        note: 'One establishes that matching words and matching sense disagree about the same documents; this takes that disagreement as given and asks how much of each to trust at once.',
      },
      {
        concept: 'fuseTwoRankings',
        note: 'One is the arithmetic that lets two incomparable orders be added at all, with both counted equally; this puts a dial on how much each order counts and shows the answer turning on that dial.',
      },
      {
        concept: 'reranking',
        note: 'Both aim to put the right passage first, but one spends a slower, closer judgement on a handful of candidates, while this only blends two cheap orders that already exist and never looks at a candidate again.',
      },
      {
        concept: 'vectorSimilarity',
        note: 'One is about which measure of closeness decides order among vectors; this treats closeness as a single finished order and weighs it against a second order that comes from literal words.',
      },
      {
        concept: 'contextAssembly',
        note: 'This decides which passages come first out of retrieval; the other takes retrieved passages as given and decides which of them fit into the prompt and where they go.',
      },
    ],
  },
};
