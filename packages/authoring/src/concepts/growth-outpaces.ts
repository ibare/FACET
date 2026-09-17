/**
 * growthOutpaces 개념 선언.
 *
 * canonical facet 은 `facet:growthOutpaces` — 한 식 `n² + 10n + 100` 을 항 셋으로
 * 쪼개 한 막대를 몫으로 나눠 갖게 하고, n 을 1 · 5 · 10 · 50 · 100 · 1000 으로
 * 올리며 경계가 오른쪽으로 미끄러지는 것을 보이는 화면이다. n = 10 에서 세 항이
 * 100 · 100 · 100 으로 같아지고, 끝에 작은 항 둘이 접혀 사라지며 O(n²) 만 남는다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서의 자리
 *
 * 성장을 말하는 셋 가운데 이것만 **한 식의 내부**를 다룬다. 두 번째 식도, 두
 * 알고리즘도 화면에 없고 축도 곡선도 없다. definition 의 주어를 "최고차항의 몫" 으로
 * 잡아 상수의 무력함(constantFades) · 두 방법의 교차(curvesCross) 와 어긋나게 두었다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const growthOutpacesConcept: FacetConceptSource = {
  id: 'growthOutpaces',
  label: 'The Highest-Degree Term Takes Over the Total',
  canonicalFacet: 'facet:growthOutpaces',

  surface: {
    definition:
      'Within one cost expression the highest-degree term takes a larger share of the total as n rises, until the lower-degree terms hold almost none of it and only that term is kept.',
    exemplarKeywords: [
      'dominant term',
      'leading term',
      'highest-order term',
      'drop the lower-order terms',
      'n squared plus 10n plus 100',
      'simplifying a polynomial cost',
      'which term matters as n grows',
      'degree of a polynomial',
      'why the cost is written as O(n^2)',
      'the point where the terms are equal',
    ],
  },

  briefing: {
    observable: [
      'One bar stands for the whole value of the formula and the three terms divide it between them as shares, so the bar keeps its length at every step and only the boundaries inside it move.',
      'A reading above the bar gives the current n on the left and the total f(n) on the right, so the absolute size stays legible while the bar itself reports proportion.',
      'Each term carries its own label above its share, tied to it by a leader line, and only the largest term of the moment is drawn in full ink — for the first rungs that is the constant, not the square.',
      'The share of the highest term prints its own percentage inside itself once it is wide enough to hold the text, ending at 99.0% on the last rung.',
      'At the end of each rung the boundary of the highest term drops a tick onto a ruler below, labelled with that n, so the rungs already walked stay on screen as a trail.',
      'One rung is singled out as the tipping point: at n = 10 the three terms are exactly equal at 100 each, and that is where the largest of the three stops being the constant.',
      'The run closes by collapsing the two smaller shares — their labels slide downward and fade — until the bar is one colour and reads O(n²).',
    ],

    screen: {
      affordances: [
        'The screen climbs the whole ladder of input sizes on its own and stops with the bar collapsed onto a single term.',
        'Two buttons: Replay, and a step control for taking one rung at a time, which is how a reader can stop on the rung where the three terms come out equal.',
        'The coefficients and the six sizes are fixed — 1, 5, 10, 50, 100 and 1000 — so an article can quote the percentages and the reader will meet the same ones.',
      ],
    },

    useWhen: [
      'The article writes a cost as n² + 10n + 100 and then calls it O(n²), and the reader takes the deletion for carelessness. Seeing the constant hold nearly the whole bar at small n and then be squeezed to a sliver moves the reason for dropping it from "it is small" to "it gets outgrown".',
      'The reader needs a place where the ranking of the terms actually changes hands: below n = 10 the constant is the biggest of the three and above it the square is, while the formula itself never changed.',
    ],

    avoidWhen: [
      'The subject is two different algorithms, or two different formulas, held against each other. One expression is on screen the whole time, split into its own terms.',
      'The point is that a coefficient in front of a term cannot rescue it. The three coefficients here stay at 1, 10 and 100 for the whole run.',
      'The article is about growth outside polynomials — logarithmic, exponential or factorial. The three shares are a square, a linear term and a constant.',
      'The subject is measured running time on real hardware. Every number shown comes from evaluating the formula.',
    ],

    contrastWith: [
      {
        concept: 'bigO',
        note: 'One claim is that the highest-degree term ends up holding almost the whole of a single total; the wider concept is that the order those terms settle into is what a complexity notation records, and that naming the survivor is the operation itself.',
      },
      {
        concept: 'constantFades',
        note: 'Both explain a deletion in asymptotic notation, but one drops terms that a rival term inside the same expression outgrows, and the other drops a multiplier whose only power is to move where two sides meet.',
      },
      {
        concept: 'curvesCross',
        note: 'One is about the parts of a single written cost; the other is about two separate methods whose counted costs swap places at a particular input size.',
      },
      {
        concept: 'depthDoublesCount',
        note: 'That one counts positions in an actual structure and finds a logarithm in the count; this one takes a cost already written down and asks which of its terms survives.',
      },
    ],
  },
};
