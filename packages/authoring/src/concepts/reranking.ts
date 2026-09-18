/**
 * reranking 개념 선언.
 *
 * canonical facet 은 `facet:reranking` — 완제품이다. 왼쪽에 첫 단계가 세운 문서
 * 열둘이 번호 원으로 서고, 사람이 매긴 정답 다섯은 초록 테를 두른다. 위쪽 음영
 * 구역이 재순위기에 넘기는 몫이고 그 아래 끝이 문턱이다. 손잡이 3 · 6 · 9 · 12 로
 * 문턱을 옮기면 넘긴 문서에만 점수 막대가 자라고, 그것들이 솟거나 가라앉는다.
 * 오른쪽은 맥락에 넣을 위 셋의 글. 코드 패널이 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **몇 개를 넘기는가** 다 — 넘긴 수를 3 → 6 → 9 → 12 로
 * 늘리면 위 셋의 정답은 1 → 2 → 3 → 3 으로 오르다 멎고 호출은 끝까지 는다.
 * definition 의 주어가 "넘길 목록의 길이를 고르는 일" 이고, 꼬리가 "평평해지는데
 * 호출은 계속 는다" 로 닫힌다.
 *
 * 조각 `lookCloselyAtFew` 는 **한 번의 재순위가 무엇을 하는가** — 질의와 나란히
 * 다시 읽고, 낱말만 겹친 후보가 가라앉는다 — 를 맡는다. 그래서 그쪽 어휘(질의 ·
 * 낱말 · 읽지 않은 채 남음)를 이 definition 에 쓰지 않았고, 저쪽은 이쪽 어휘
 * (shortlist · 호출 · 위 셋 · 정답)를 쓰지 않는다 (어휘 배타 · 주어 층위 가르기).
 *
 * ── 전제
 *
 * 첫 단계 점수와 재순위 점수는 예로 정한 값이다. 정답 여부는 사람이 매긴 것이다.
 * avoidWhen 과 observable 에 밝혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rerankingConcept: FacetConceptSource = {
  id: 'reranking',
  label: 'Reranking (How Long a Shortlist to Pay For)',
  canonicalFacet: 'facet:reranking',

  surface: {
    definition:
      'Choosing how long a shortlist a fast retrieval stage passes to an expensive reranker: relevant hits in the top results climb with the shortlist length and then level off, while the calls paid keep growing.',
    exemplarKeywords: [
      'two-stage retrieval',
      'retrieve then rerank',
      'cross-encoder reranker',
      'how many candidates to rerank',
      'rerank top-k',
      'shortlist size',
      'reranker latency and cost',
      'RAG retrieval pipeline',
      'precision at 3',
      'diminishing returns from reranking more',
    ],
  },

  briefing: {
    observable: [
      'Twelve documents stand in a column in first-stage order, each a numbered disc; the five a person marked as relevant wear a green ring. Both scores on screen are values chosen for the example, not the output of any real retriever or reranker.',
      'A shaded zone at the top is the share handed to the reranker, and its lower edge is a line. Moving the handle lowers or raises that line, so the zone swallows or gives back documents before anything is scored.',
      'The reranker reads the documents inside the zone one at a time from the top, and a score bar grows only on those. Documents below the line keep no bar at all, even though the example data holds a score for them.',
      'After every document in the zone has been read, only those documents change places by reranker score, each linked by an arc from where it left to where it lands. Everything below the line stays exactly in first-stage order.',
      'Handing over three leaves four relevant documents (5, 7, 9 and 11) below the line, and the top three contains one relevant document. At six, document 5 climbs from fifth to second; at nine, document 7 climbs from seventh to third.',
      'Relevant documents in the top three read 1, 2, 3, 3 as the handle goes 3, 6, 9, 12, while reranker calls read 3, 6, 9, 12 and documents moved read 2, 5, 8, 11. From nine to twelve the relevant count holds still and only the calls rise.',
      'A panel on the right shows the text of the top three — what would go into the context — and the closing caption names any relevant documents left below the line as ones the reranker never saw.',
    ],

    screen: {
      affordances: [
        'The screen plays one round by itself with three documents handed over, then holds the finished picture until the handle moves.',
        'A handle labelled "Rerank how many" with four positions, 3, 6, 9 and 12, opening at 3. Each move plays a fresh round from the first-stage order.',
        'Playback controls for running, stepping, pausing, resetting and changing speed, next to three live counts: reranker calls, relevant in top 3, and documents moved.',
        'A code panel titled "Reorder only the shortlist" starts empty; the reader adds up to two languages, and the highlighted line follows the round — the outer loop\'s bound is the line on screen.',
        'The query, the twelve document texts, the relevance marks and both scores are fixed, so an article can name a document by its number and quote its climb.',
      ],
    },

    useWhen: [
      'A reader has been told that a stronger reranker fixes retrieval, and needs to see that it cannot lift what it was never handed: at three, four relevant documents sit below the line for good.',
      'The article is sizing the candidate list for a reranking step and wants the point where more candidates stop buying anything — nine here, where relevant hits reach three and only the call count keeps climbing.',
      'The prose needs the cost side made concrete: one reranker call per document handed over, with the count of calls and the count of relevant hits shown side by side as the handle moves.',
    ],

    avoidWhen: [
      'The subject is how a reranker scores a pair internally — attention across the joined text, or how such a model is trained. Every score here is a fixed number chosen for the example.',
      'The article is about evaluating retrieval with a real metric over many queries; there is one query here, twelve documents, and relevance marked by hand.',
      'The subject is merging the rankings of two different retrievers into one list. Here a single first-stage order is partly reordered by one second scorer, and nothing is merged.',
      'The article uses "ranking" for search-engine optimisation or for ordering results by popularity, clicks or date.',
    ],

    contrastWith: [
      {
        concept: 'lookCloselyAtFew',
        note: 'One is a single pass of close rereading and what it overturns among the leaders; this treats the number handed over as the thing to tune, and weighs the relevant hits it buys against the calls it costs.',
      },
      {
        concept: 'fuseTwoRankings',
        note: 'Fusion combines two orderings of equal standing into one; reranking trusts a second, costlier judgement over the first but only for the part of the list it pays to hand over.',
      },
      {
        concept: 'hybridSearch',
        note: 'Hybrid search widens what the first stage can find by searching two ways at once; reranking leaves what was found untouched and only reorders the head of it.',
      },
      {
        concept: 'recallSpeedTradeoff',
        note: 'Both trade work for quality, but one loses true neighbours as less of the index is examined, while here a document the first stage ranked low is lost because the second stage was never paid to look at it.',
      },
      {
        concept: 'contextAssembly',
        note: 'Reranking decides which few results come first; assembling a context decides how the chosen results are packed into a limited window and in what order they are placed there.',
      },
      {
        concept: 'probeAFewCells',
        note: 'Both confine expensive comparison to a small part of the collection, but one picks the part by region before scoring anything, and this picks it by the rank a cheaper score already gave.',
      },
    ],
  },
};
