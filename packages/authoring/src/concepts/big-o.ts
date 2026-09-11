/**
 * bigO 개념 선언.
 *
 * canonical facet 은 `facet:bigO` — 한 식 `n³ + 5n² + 100n + 1000` 의 항 넷이
 * **자리(순위)** 격자 위에서 자리를 바꾸는 화면이다. 손잡이(입력 크기 n, 1~100)를
 * 밀면 사다리를 그만큼 밟고, 상수항이 1 위에서 꼴찌로 최고차항이 꼴찌에서 1 위로
 * 간다. 마지막에 나머지 셋이 물러나고 `O(n³)` 하나가 남는다. 최고차항의 몫은
 * 0.1% 에서 94.3% 로 자란다.
 *
 * 재생·한 걸음·일시정지·되돌리기·속도에 크기 손잡이가 붙고, 계기 둘과 코드 패널이
 * 딸린 완결형이다.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 `growthOutpaces` 가 **한 항이 합에서 차지하는 몫**을, 조각 `constantFades` 가
 * **상수 배수의 무력함**을 각각 맡는다. 이 개념이 더하는 것은 그 둘이 한 표기로
 * 모이는 자리다 — 항이 죽는 **순서**가 곧 표기가 기록하는 것이고, 남는 이름 하나를
 * 고르는 일이 Big-O 라는 것. definition 의 주어를 "한 식을 한 항으로 줄이는 일" 로
 * 잡아 두 식을 견주는 `asymptotic` 과 갈라 두었다. 앞은 단순화, 뒤는 분류다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bigOConcept: FacetConceptSource = {
  id: 'bigO',
  label: 'Big-O Notation (Which Term Is Left to Write)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:bigO',

  surface: {
    definition:
      'Reducing a cost expression to one term by ranking its terms at each input size: the constant leads at small sizes, the highest-degree term ends up ahead of all of them, and only that term is written.',
    exemplarKeywords: [
      'big-O notation',
      'O(n^2)',
      'time complexity notation',
      'what does O(n log n) mean',
      'how to write the complexity of an algorithm',
      'worst-case notation',
      'order of a polynomial cost',
      'why lower-order terms are deleted',
      'reading a complexity expression',
      'complexity of an algorithm in one term',
    ],
  },

  briefing: {
    observable: [
      'The vertical direction is rank rather than value: four numbered lanes hold first to fourth place, and each of the four terms is a coloured token that moves into the lane its value earns at the current size.',
      'The header keeps the whole expression, f(n) = n³ + 5n² + 100n + 1000, and a reading of the current n beside it, so the expression itself is visibly never edited while the tokens move.',
      'At the first size the order is exactly reversed — the constant 1000 stands in first place and n³ in fourth.',
      'Ties share a lane instead of breaking: two tokens sit side by side at n = 5 where n³ and 5n² are both 125, three share the top lane at n = 10 where n³, 100n and 1000 are all 1000, and 5n² meets 100n at 2000 at n = 20.',
      'Every move leaves a thin trail line in the token colour back to where it came from, so the path each term took across the ladder stays on screen.',
      'Under the grid each term prints its value and its share of the sum on its own coloured key — n³ reads 0.1% at the first rung and 94.3% at the last, while 1000 stays 1000 throughout and only its share falls.',
      'The closing step slides the other three tokens downward until they fade, dims the trails, and leaves O(n³) standing in the middle of the grid.',
      'A run that stops at a small size still leaves O(n³) behind, and its caption says the notation is not describing that size — the ending is the same and the sentence beneath it is not.',
      'Two counters run along the bar: how many rungs have been walked, and how many terms have fallen behind the highest-degree term, the second reaching three.',
    ],

    screen: {
      affordances: [
        'A first run plays on its own when the screen appears and then waits for the reader.',
        'The bar carries play, single step, pause, reset and a speed slider, and beside them a segmented slider for the input size over 1, 5, 10, 20, 50 and 100.',
        'That slider is what the argument runs on — it sets how far up the ladder the run climbs, and it starts at 1, the size where the constant is still in first place, so the order only changes once the reader pushes it.',
        'The four coefficients and the six sizes are fixed, so an article can quote a value or a percentage and the reader will meet the same one.',
        'The code panel starts empty with a "+ Add language" button; up to two of Python, JavaScript, TypeScript, Java, C++ and C# stand side by side, and they evaluate the same expression the grid ranks.',
      ],
    },

    useWhen: [
      'The prose has just written a complexity like O(n³) and the reader takes the notation as shorthand for how many steps something takes. The run gives it its own meaning: the deleted terms are still on screen holding their values, and what they lost is their place in an order.',
      'A reader accepts the rule "keep the highest-degree term" but has never seen it fail. The opening rung, where the cubic term is last and the constant is first, is the case where the rule would give the wrong answer about actual size, inside the same run that carries it to where the order is settled.',
      'The article needs a notation and a measurement to read as two different claims. A climb that stops early still ends on O(n³), with the caption saying outright that the notation is not describing the size on screen.',
    ],

    avoidWhen: [
      'The subject is two algorithms, or two separate cost expressions, held against each other. One expression is on screen for the whole run and the four tokens are its own terms.',
      'The point is what a multiplier in front of a term can buy. The four coefficients stay at 1, 5, 100 and 1000 from the first rung to the last.',
      'The article is about tight and lower bounds, or about how Θ and Ω differ from O. One notation is written here and nothing is stated about the other two.',
      'The subject is growth that is not polynomial — logarithmic, exponential, factorial. The four terms are a cube, a square, a linear term and a constant.',
      'The article uses the notation for a figure obtained by profiling or benchmarking. Every number here comes from evaluating the expression at the chosen size.',
    ],

    contrastWith: [
      {
        concept: 'growthOutpaces',
        note: 'One claims that the highest-degree term ends up holding almost the whole total; this one claims that the order the terms settle into is what the notation records, and that choosing the surviving name is the whole of the operation.',
      },
      {
        concept: 'constantFades',
        note: 'That concept fixes what a constant multiplier is able to buy; this one takes the coefficients as given and asks which single term the cost gets written as.',
      },
      {
        concept: 'asymptotic',
        note: 'One reduces a single expression to the term worth naming; the other keeps two expressions whole and asks whether they belong to the same class at all. Simplifying against classifying.',
      },
      {
        concept: 'depthDoublesCount',
        note: 'That one derives a growth rate by counting positions in a structure; this one starts from a cost already written down and settles which of its terms gets to name it.',
      },
    ],
  },
};
