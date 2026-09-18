/**
 * lookCloselyAtFew 개념 선언.
 *
 * canonical facet 은 `facet:lookCloselyAtFew` — 조각이다. 후보 여덟이 1차 점수
 * 차례로 아래 줄에 서고 가로선이 문턱이다. 앞 넷만 선을 넘어 위 줄로 오르고,
 * 하나씩 왼쪽 위 자리로 가 질의 곁에 서서 두 번째 막대를 채운다. 글이 뜨는 것도
 * 그때뿐이다. 넷이 다 다녀오면 위 줄 안에서 자리가 바뀐다 — c4 가 넷째에서 맨 앞,
 * c1 이 맨 앞에서 넷째. 스스로 한 바퀴 돌고 그 뒤로는 한 걸음씩 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **한 번 다시 읽을 때 무엇이 뒤집히는가** 다 — 질의의
 * 낱말을 둘 다 품은 후보가 가라앉고 그 낱말이 없는 후보가 답이라서 솟는다. 그리고
 * 앞 몇 개 밖은 끝까지 읽히지 않는다. definition 의 주어가 "빠른 첫 등수의 앞 몇 개를
 * 질의와 나란히 다시 읽는 일" 이다.
 *
 * 완제품 `reranking` 은 **몇 개를 넘길지 고르는 일**과 그 값(호출 · 위 셋의 정답 ·
 * 멎음)을 맡으므로 그쪽 낱말(shortlist · reranker · calls · relevant · top)을 이
 * definition 에 쓰지 않았다. 이쪽 낱말(query · words · unread)은 저쪽 definition 에
 * 없다 (어휘 배타). 층위도 다르다 — 이쪽은 넘길 수가 넷으로 고정된 한 장면이고,
 * 저쪽은 그 수를 옮기며 여러 판을 잇는다.
 *
 * ── 전제
 *
 * 1차 점수와 재순위 점수는 둘 다 예로 정한 값이다. 뒤바뀜이 보이도록 고른 수이지
 * 어떤 모형의 출력이 아니다. avoidWhen 과 observable 에 밝혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lookCloselyAtFewConcept: FacetConceptSource = {
  id: 'lookCloselyAtFew',
  label: 'Looking Closely at a Few (Rereading the Leaders Against the Query)',
  canonicalFacet: 'facet:lookCloselyAtFew',

  surface: {
    definition:
      'Rereading only the leading few items of a quick first ordering side by side with the query and reordering just those, so an item that merely shares the query\'s words sinks below one that answers it, while the rest stay unread.',
    exemplarKeywords: [
      'second-pass scoring',
      'read the query and passage together',
      'keyword match is not an answer',
      'lexical overlap misleads the first ranking',
      'the best passage was ranked fourth',
      'only the top few get a closer look',
      'candidates outside the cut are never scored',
      'coarse ranking then fine ranking',
      'semantic relevance versus word overlap',
    ],
  },

  briefing: {
    observable: [
      'Eight candidates, c1 to c8, stand in a lower row in order of first-pass score (91 down to 70) for the query "why is the sky blue". Both scores on screen are values chosen for the example, not the output of any real model.',
      'A horizontal line is the cut: only the first four cross it and lift to an upper row, while the other four stay in the lower row and never move again.',
      'Each of the four is pulled in turn to a spot at the upper left beside the query, its text appears there, and its second bar fills. Text is shown only while a candidate stands beside the query, so the four below the line never show their text at all.',
      'The second scores read 5, 41, 8 and 96 for c1 to c4. c1 opens with "Blue sky thinking" and holds both "sky" and "blue" yet scores 5; c4 has no "sky" in it and explains the scattering of sunlight, and scores 96.',
      'Once all four have been read they swap places within the upper row: c4 moves from fourth to the front and c1 drops from first to fourth, giving c4, c2, c3, c1, followed by c5 to c8 still in first-pass order.',
      'The last caption reports that four of the eight were looked at, and the bars for c5 to c8 remain empty to the end.',
    ],

    screen: {
      affordances: [
        'The screen plays through once on its own — first-pass order, the cut, four readings, the reorder — and stops on the final order.',
        'Beneath it are a Replay button and a playback strip; once the run is over, dragging the handle holds any single step still.',
        'The query, the eight candidate texts, both sets of scores and the cut at four are fixed, so an article can quote a candidate by its label and its two scores.',
      ],
    },

    useWhen: [
      'An article claims that a closer second reading catches what a fast first ordering got wrong, and the reader needs one case where it plainly does: the candidate ranked first on shared words drops to fourth and the one ranked fourth takes the lead.',
      'A reader assumes the second reading goes over the whole collection; here half the candidates never have their text read at all, which is the point to make before any talk of tuning.',
      'The prose needs the difference between matching the words of a question and answering it, shown with real sentences rather than stated.',
    ],

    avoidWhen: [
      'The subject is how many candidates to pass on or what passing more would cost; the cut is fixed at four here and there is nothing to vary it with.',
      'The article is about how the second scorer works internally or how it is trained. Both sets of numbers are fixed values chosen so the swap is visible, and the screen does not claim a real model would give them.',
      'The subject is how the first ordering is produced — embeddings, keyword indexes or their mix. Here the first-pass scores are simply given.',
      'The article uses "rank" for ordering by date, popularity or price, or for placement in web search results.',
    ],

    contrastWith: [
      {
        concept: 'reranking',
        note: 'One is about sizing the handoff and the price of a longer one; this is about what a single close reading overturns among the few it is given, and what it leaves unread.',
      },
      {
        concept: 'sameWordVsSameMeaning',
        note: 'Both separate sharing a question\'s words from sharing its meaning, but one sets two ways of finding candidates against each other, while this corrects an order already made by reading its leaders again.',
      },
      {
        concept: 'fuseTwoRankings',
        note: 'Fusion gives two orderings a say over every item; here the second judgement overrides the first, but only for the handful it reads.',
      },
      {
        concept: 'vectorSimilarity',
        note: 'One is about how the choice of a closeness measure alone reorders the same candidates; this adds a second, slower judgement on top of the first order rather than swapping the measure.',
      },
      {
        concept: 'probeAFewCells',
        note: 'Both spend the costly comparison on a small part and skip the rest, but one picks the part by region and compares vectors inside it, while this picks it by an earlier score and reads the text itself.',
      },
    ],
  },
};
