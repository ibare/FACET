/**
 * sameWordVsSameMeaning 개념 선언.
 *
 * canonical facet 은 `facet:sameWordVsSameMeaning` — 조각이다. 질의 "cheap flights to paris"
 * 와 문서 다섯이 왼쪽 BM25 줄과 오른쪽 코사인 줄에 한 번씩 서고, 같은 문서의 두 자리를 끈이
 * 잇는다. 처음엔 둘 다 식별자 순이라 끈이 나란하다가, 한 줄씩 점수대로 다시 서며 끈이
 * 기울고 엇갈린다. 끝 걸음에 가장 많이 오른 d2 (4 위 → 1 위) 와 가장 많이 내린 d1
 * (2 위 → 4 위) 의 끈이 굵게 남는다. 스스로 한 바퀴 재생하고 그 뒤로는 한 걸음씩 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **두 잣대가 같은 문서를 다른 차례로 세운다 — 말을 바꿔 쓴 글이
 * 한쪽에서 가라앉고 다른 쪽에서 떠오른다** 는 한 장면이다. 섞지 않는다. definition 에
 * 몫 · 나눔 · 합침의 낱말(weight · split · balanced · merge · lists · units · rank)을 쓰지
 * 않았다 — 그것은 `hybridSearch` 와 `fuseTwoRankings` 의 것이다. 여기 가져간 것은
 * keyword · embedding · reworded · sinks · climbs · orders 다.
 *
 * ── 전제
 *
 * 뜻 쪽 벡터는 예로 정한 3차원 정수 벡터다 — 임베딩 모형이 낸 값이 아니고 축에 이름도
 * 없다. 문서가 다섯뿐이라 BM25 의 idf 가 거칠다. avoidWhen 과 observable 에 밝혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sameWordVsSameMeaningConcept: FacetConceptSource = {
  id: 'sameWordVsSameMeaning',
  label: 'Same Word vs. Same Meaning (Keyword and Embedding Orders Disagree)',
  canonicalFacet: 'facet:sameWordVsSameMeaning',

  surface: {
    definition:
      'Keyword scoring and embedding similarity put one set of documents in different orders: text reworded without any of the query\'s own words sinks to the bottom of one and climbs to the top of the other.',
    exemplarKeywords: [
      'keyword search vs semantic search',
      'BM25 vs embeddings',
      'lexical vs dense retrieval',
      'keyword search misses synonyms',
      'paraphrased documents are not found',
      'why semantic search finds things keyword search cannot',
      'exact word match',
      'cosine similarity of embeddings',
      'vocabulary mismatch problem',
      'full-text search compared with vector search',
    ],
  },

  briefing: {
    observable: [
      'The query "cheap flights to paris" and five documents appear twice: in a left line scored by BM25, where each box shows the document\'s full text with the words it shares with the query picked out, and in a right line scored by cosine, where each box shows only the id and a three-number vector.',
      'At the start both lines are in id order, so the strings joining each document\'s two boxes run level. Every later step re-lines one side, and the strings tilt and cross as the boxes move.',
      'When the left side is scored the caption counts two documents sharing no query word; when it lines up, d3 ("cheap flights to rome this spring") is on top and d2 and d5 sink to the bottom with 0 points, d2 above d5 only because ties go by id.',
      'When the right side lines up, d2 — "budget airline tickets from london to the french capital" — is on top, and the caption notes it contains 0 query words. The full right-hand order is d2, d4, d3, d1, d5.',
      'The last step leaves two strings drawn heavy and spells them out: d2 with 0 shared words goes from #4 on the word line to #1 on the meaning line, and d1, the Paris hotel text sharing two words, goes from #2 to #4.',
      'd3 also drops two places, #1 to #3; d1 is the one singled out because the tie in places moved is broken toward the document lower on the meaning line.',
      'The query vector (5, 4, 0) and the document vectors are invented small integers with unnamed axes, not the output of an embedding model; they borrow only the assumption that close in sense means close in direction. With five documents the BM25 weighting of rare words is coarse.',
    ],

    screen: {
      affordances: [
        'The screen plays through on its own — both lines in id order, the left scored and re-lined, then the right scored and re-lined, then the two heavy strings — and stops there.',
        'Beneath it are a Replay button and a playback strip; once the run is over, dragging the handle to one step holds it still, so the two lines can be compared before and after either one re-lines.',
        'The query, the five texts and the vectors are fixed and printed on screen, so an article can quote a document by its id and its words.',
      ],
    },

    useWhen: [
      'An article claims that search by embeddings "understands" a question, and the reader needs the concrete case: a text naming an airline and "the french capital" is found first by one scorer and ranked fourth of five by the other, with nothing between them but wording.',
      'The prose explains why a text-matching engine misses answers written in other words, and wants the mirror image in the same frame — a document sharing two of the query\'s words that the other scorer pushes down because it is about hotels, not flights.',
      'A reader assumes that two sensible scorers will broadly agree about the same handful of documents. Four of the five documents change place between the lines here, and the two that move most go in opposite directions.',
    ],

    avoidWhen: [
      'The subject is how an embedding model turns text into numbers, or what its dimensions mean. The vectors here are three invented integers with no named axes and no model behind them.',
      'The article is about combining the two orders into one result. Neither line is merged with the other; they only stand side by side.',
      'The point is the formula of BM25 itself — term frequency saturation, length normalisation, or tuning k1 and b. Scores are printed but the weighting is not taken apart.',
      'The discussion is about stemming, typos or spelling variants. There is no stemming here and every word is spelt as the query spells it or not at all.',
    ],

    contrastWith: [
      {
        concept: 'hybridSearch',
        note: 'This only shows that the two scorers disagree and where; the other accepts that disagreement and asks how far to lean on each when producing one answer.',
      },
      {
        concept: 'fuseTwoRankings',
        note: 'This ends with two orders standing apart; the other begins with two such orders and folds them into one, having already given up on comparing their scores.',
      },
      {
        concept: 'angleNotLength',
        note: 'One explains why direction, not size, is what the cosine compares; this uses the cosine as a given and sets it against a scorer that never looks at vectors at all.',
      },
      {
        concept: 'vectorSimilarity',
        note: 'Both show one set of candidates falling into different orders, but there the difference comes from choosing between measures of closeness among vectors, and here from whether the text is read for its literal words at all.',
      },
    ],
  },
};
