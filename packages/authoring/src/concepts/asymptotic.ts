/**
 * asymptotic 개념 선언.
 *
 * canonical facet 은 `facet:asymptotic` — **같은 길이의 자 둘**을 각각 작은 쪽의
 * 낱개로 나누는 화면이다. 나뉜 낱개의 수가 곧 비다. 손잡이(입력 크기 n, 4~1024)를
 * 밀면 위 자(다른 반, `n²` 대 `n log₂n`)는 2 에서 102 로 부서져 빗살이 되고, 아래
 * 자(같은 반, `2n²` 대 `n²`)는 끝까지 둘로만 나뉜다. n = 4 에서 두 비가 똑같이 2 라
 * 한 점만으로는 반을 못 가른다.
 *
 * 재생·한 걸음·일시정지·되돌리기·속도에 크기 손잡이가 붙고, 계기 셋과 코드 패널이
 * 딸린 완결형이다.
 *
 * ── 묶음 안에서의 자리
 *
 * 조각 `curvesCross` 가 **교차점 하나**를 맡는다. 이 개념이 더하는 것은 그 교차가
 * 한 점일 뿐이고 **등급은 끝까지의 성질**이라는 것이다. definition 의 주어를 "두
 * 함수가 같은 반인가" 로 잡아, 한 식을 한 항으로 줄이는 `bigO` 와 갈라 두었다 —
 * 이쪽은 분류이고 저쪽은 단순화다. 여기서는 어떤 식도 항으로 쪼개지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const asymptoticConcept: FacetConceptSource = {
  id: 'asymptotic',
  label: 'Growth Classes (Whether Two Functions Stay Within a Constant)',
  canonicalFacet: 'facet:asymptotic',

  surface: {
    definition:
      'Deciding whether two functions belong to the same growth class by what their ratio does as the input size rises: held within a constant means the same class, drifting without limit means different ones.',
    exemplarKeywords: [
      'asymptotic analysis',
      'order of growth',
      'growth class',
      'same complexity class',
      'within a constant factor',
      'big-Theta',
      'n log n versus n squared',
      'ratio of two cost functions',
      'comparing algorithms by growth rate',
      'grows faster than',
    ],
  },

  briefing: {
    observable: [
      'Two bars of the same length stand one above the other, named for the two pairings and marked with them — n² ÷ n log₂n above, 2n² ÷ n² below — and the length carries no meaning, only how finely each bar gets divided.',
      'Each bar fills from the left as a cover slides off it, and the count of whole divisions prints just to the right of the bar.',
      'The upper bar is cut into two at the smallest size and into a hundred and two at the largest, ending as a comb; the lower bar is cut into two at every size the run reaches.',
      'A leftover fraction is drawn as a shorter, paler division at the end of the bar — at n = 64 the upper bar holds ten whole ones and a remnant, because the ratio there is not a whole number.',
      'A record strip below keeps every size the run has walked, one column each for 4, 16, 64, 256 and 1,024, with the two counts stacked under each: one row reading 2, 4, 10, 32, 102 and the other reading 2, 2, 2, 2, 2.',
      'At the leftmost column both rows read 2, and the closing caption there says a single size cannot tell the two classes apart; at any other stopping size the caption reports one number still at two and the other far from it.',
      'The closing step draws a line left to right beneath each record row, out to the size the run stopped at, so the two rows are read as trajectories rather than as separate readings.',
      'Three counters run along the bar, and the third is the rounded binary length of the current size — 2, 4, 6, 8, 10 — which is the log factor the upper pairing turns on.',
      'No cost values appear anywhere on the screen; the only numbers shown are the two division counts and that binary length.',
    ],

    screen: {
      affordances: [
        'A first run plays on its own when the screen appears. The size slider starts at its far end, 1,024, so that run walks the whole ladder and stops with the two rows fully separated.',
        'The bar carries play, single step, pause, reset and a speed slider, and beside them a segmented slider for the input size over 4, 16, 64, 256 and 1,024.',
        'Pulling that slider down to 4 is the move that makes the two rows read the same number, and it replays from the smallest size each time it is changed, so the record strip only ever holds the sizes of the current run.',
        'The three functions are fixed and every size is a power of two, so an article can quote any of the counts and the reader will find it in the strip.',
        'The code panel starts empty with a "+ Add language" button; up to two of Python, JavaScript, TypeScript, Java, C++ and C# stand side by side, and what they compute is how many times one function fits inside the other rather than either function itself.',
      ],
    },

    useWhen: [
      'The article says two algorithms have the same complexity and the reader hears that they take about the same time. One pairing holding at exactly two while the other travels from two to a hundred is what the phrase is actually asserting.',
      'A reader has been shown that the asymptotically worse method really does less work below some size and concludes the classification must therefore be approximate. Pushing the handle to its smallest setting, where both pairings read the same, and then back out, separates a reading at one size from a property of the whole range.',
      'The prose is about to claim that doubling every step of an algorithm leaves it in the same class. The lower bar being divided in two at the smallest size and still in two at the largest is that claim in countable form.',
    ],

    avoidWhen: [
      'The subject is the terms inside one expression and which of them may be deleted. Nothing here is decomposed; the three functions are compared whole and only two at a time.',
      'The article is about the exact size at which one method overtakes another, or the threshold an implementation switches at. The two bars report ratios and neither is named as a method.',
      'The point is the formal definition with its constant and its threshold, or a proof that a bound holds. The ratio is shown behaving; nothing here quantifies over the constants the definition needs.',
      'The subject is measured running time. Every division on screen comes from evaluating the three shapes the screen was given.',
      'The article uses "asymptote" for a line a curve approaches in geometry.',
    ],

    contrastWith: [
      {
        concept: 'curvesCross',
        note: 'One locates the single input size at which two costs trade places; the other claims that membership in a growth class is a property of the whole range, so no single size — not even one where both sides come out equal — can settle it.',
      },
      {
        concept: 'bigO',
        note: 'One asks which term of a single expression is worth keeping; this one keeps two functions whole and asks whether a constant is able to bound the ratio between them.',
      },
      {
        concept: 'constantFades',
        note: 'Both deny a coefficient the power to change an outcome, but one measures how far a coefficient can push the point where two sides meet, while this one asks whether the ratio it creates stays bounded forever.',
      },
      {
        concept: 'growthOutpaces',
        note: 'That one is about parts of a single written cost outgrowing one another; this one never takes anything apart and compares two functions as they stand.',
      },
    ],
  },
};
