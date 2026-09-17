/**
 * vectorSimilarity 개념 선언.
 *
 * canonical facet 은 `facet:vectorSimilarity` — 완결형이다. 왼쪽 정사각 평면에
 * 질의 하나와 후보 다섯이 서고, 재는 법을 고르는 손잡이(코사인 · 유클리드 · 내적)를
 * 옮기면 재는 도구의 그림 자체가 갈리고 오른쪽 순위 기둥의 다섯 칸이 서로 지나치며
 * 자리를 맞바꾼다. 계기 둘(잰 후보 · 자리 바뀜)이 붙어 있고 코드 패널은 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **잣대가 고르는 것이라는 사실** 이다 — 무엇이 닮았는지는
 * 자료에 붙어 오지 않고 손에 쥔 자가 정하며, 같은 다섯이 세 자 아래에서 세 차례로
 * 갈린다는 것. 조각 `angleNotLength` 는 그중 한 자가 무엇을 보고 무엇을 안 보는지만
 * 말한다. definition 의 주어가 "고른 자" 이고, keywords 는 잣대 고르기 · 순위
 * 어긋남 · 색인의 metric 설정 어휘를 갖는다.
 *
 * ── 묶음 사이는 어떻게 갈랐나
 *
 * 이 묶음은 **무엇으로 재는가** 다. 몇 번 재는가(`exhaustiveSearch` ·
 * `compareWithAll`)와 얼마나 줄여 두고 재는가(`productQuantization` ·
 * `splitAndNumber`)의 어휘 — 곱셈 · 훑기 · 차원 수 · 토막 · 번호 · 바이트 — 를
 * definition 과 keywords 에서 쓰지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const vectorSimilarityConcept: FacetConceptSource = {
  id: 'vectorSimilarity',
  label: 'Vector Similarity (The Ruler Decides the Ranking)',
  canonicalFacet: 'facet:vectorSimilarity',

  surface: {
    definition:
      'Which vector counts as the closest is settled by the ruler picked for the job — angle, straight-line gap, or projected magnitude — and one unchanged set of candidates comes out in three different orders.',
    exemplarKeywords: [
      'cosine or euclidean, which one',
      'choosing a similarity metric',
      'the metric changes the top result',
      'inner product as a score',
      'metric parameter of a vector index',
      'why cosine is the usual choice for text embeddings',
      'normalised embeddings',
      'ranking disagreement between two measures',
      'the measure is a design decision',
      'sorting results by score',
    ],
  },

  briefing: {
    observable: [
      'The measuring instrument is redrawn for each ruler rather than recoloured: an arc opening at the origin between two directions, a bar stretching from the query point out to a candidate, or a shadow growing along the query direction — so which quantity is being read is legible from the drawing alone.',
      'The five rows of the ranking column physically slide past one another into the new order, so a reversal is an event rather than a set of numbers that changed.',
      'Q sits at exactly twice the query, so its angle reading is 1.0000 and it takes first place, while under the straight-line ruler it is the farthest of the five and takes last — one point travelling the whole column.',
      'Values print to four decimal places for two of the rulers and as whole numbers for the projected one, which is a reminder on screen that the three quantities are not on one scale.',
      'The grid is square and both directions share one unit, so a right angle is a right angle and the bar lengths can be compared by eye.',
      'The "Moved" counter and the closing caption are both measured against the first ruler rather than the one just left, so returning to that first ruler slides all five rows back and yet reports that nobody moved.',
      'The "Measured" counter reads five at every setting, so the amount of measuring never changes — only the quantity measured does.',
      'Every candidate keeps its own colour across the plane and the column, so a row that has moved can be traced back to a point.',
    ],

    screen: {
      affordances: [
        'Playback runs on its own: play, single step, pause, reset and a speed slider. One ruler plays through on mount and the screen then waits.',
        'A segmented slider beside the playback controls carries the three rulers, starting on the angle one; picking another measures the same five again from the beginning.',
        'The argument is something the reader performs — the disagreement only exists across two slider positions, so it is assembled by moving the handle rather than read off one picture.',
        'The query and the five candidates are fixed at whole-number coordinates, so an article can name a candidate and quote the place it takes under each setting.',
      ],
    },

    useWhen: [
      'The prose names a measure in passing — "we use cosine similarity" — as though the data came with one attached. Three orders over one unchanged set of candidates is what turns that mention back into a decision somebody made.',
      'A reader treats a similarity score as a property two vectors have. Watching the same pair swap from first to last when the handle moves puts the score in the instrument rather than in the pair.',
      'Someone is about to fill in the metric field of a vector index by habit, and needs to see that the field decides which document comes back at the top, not merely how the number is spelled.',
    ],

    avoidWhen: [
      'The article means the Euclidean algorithm — trading the larger number for a remainder until a greatest common divisor falls out. Only the name is shared.',
      'The subject is finding the top match quickly among millions: an index, a proximity graph, hashing, or any approximate method. Every candidate here is measured, and there are five of them.',
      'The question is where the vectors came from — how a model produces them, or what a dimension of one means. They arrive as coordinates already placed.',
      'The point is what happens to distance in hundreds of dimensions. This plane has two, and the rulers are drawn as geometry.',
      'The article uses "similarity" for string comparison, fuzzy matching or edit distance between words.',
    ],

    contrastWith: [
      {
        concept: 'angleNotLength',
        note: 'One holds a single rule and shows what it takes in and what it refuses to look at; this treats the rule itself as an open choice and asks what depends on it.',
      },
      {
        concept: 'compareWithAll',
        note: 'One asks which quantity the score ought to be, the other asks what producing every score costs — the first is a choice with no arithmetic attached and the second is arithmetic with the choice already made.',
      },
      {
        concept: 'knn',
        note: 'Both order stored examples by a measured quantity, but there the order is spent on giving a query a label, while here the order is the answer and the question is whether it survives a change of instrument.',
      },
      {
        concept: 'voteByNeighbors',
        note: 'Both turn a measurement into a ranking, but one takes the ranking as settled and argues about who inside it may speak, while this asks whether the ranking itself was ever singular.',
      },
    ],
  },
};
