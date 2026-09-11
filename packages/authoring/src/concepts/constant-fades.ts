/**
 * constantFades 개념 선언.
 *
 * canonical facet 은 `facet:constantFades` — `100·n` 과 `n²` 를 견주되 값을 곡선으로
 * 그리지 않고 **n 의 수직선** 위에 경계 기둥 하나를 세우는 화면이다. 상수를 10 ·
 * 100 · 1000 으로 갈면 기둥이 n = 10 · 100 · 1000 으로 옮겨 앉고, 눈금 하나가 열 배라
 * "열 배로 키우면 한 눈금 오른쪽" 이 자로 잰 거리가 된다. 끝에 상수가 아래로 떨어져
 * 나가고 n 과 n² 만 남는다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩 짚어보기만 딸려 있다.
 *
 * ── 묶음 안에서의 자리
 *
 * 재는 것이 높이가 아니라 **자리**다. 그래서 definition 의 주어를 "상수 배수" 로 잡고,
 * 주장을 "만나는 자리를 미룰 뿐 순서를 못 바꾼다" 로 못박아 한 식의 내부를 보는
 * growthOutpaces · 두 알고리즘의 실제 비용을 재는 curvesCross 와 갈라 두었다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const constantFadesConcept: FacetConceptSource = {
  id: 'constantFades',
  label: 'What a Constant Multiplier Can and Cannot Do',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:constantFades',

  surface: {
    definition:
      'A constant multiplier only defers the input size at which a faster-growing term takes over: enlarging it pushes that meeting point further out and never changes which side ends up ahead.',
    exemplarKeywords: [
      'constant factor',
      'dropping the constants',
      '100n versus n squared',
      'coefficients do not change the complexity',
      'crossover point moves right',
      'why O(n) eventually beats O(n^2)',
      'a faster machine does not change the class',
      'growth rate versus constant multiplier',
      'asymptotic notation ignores constants',
      'constant factors still matter in practice',
    ],
  },

  briefing: {
    observable: [
      'The picture is a line of n rather than a pair of curves: what moves across it is a single boundary post, and the values are read from two number chips instead of from heights.',
      'The ticks on the line are 1, 10, 100, 1000 and 10000, one tick per tenfold step, so a tenfold change in the constant comes out as exactly one tick of distance.',
      'A dashed probe with an arrowhead walks the line carrying two chips, one reading 100·n and the other n²; the chips go blank while the probe is travelling and fill in only once it has landed.',
      'The leading chip is the filled one, and where the two sides are equal both take the same marked colour — at n = 100 both chips read 10000.',
      'A post is planted at that meeting point and two shaded bands spread out from it, the left one labelled 100·n and the right one labelled n² and running off the right edge as an arrow.',
      'When the constant is changed to 10 and then to 1000, the post slides to n = 10 and then to n = 1000, leaving a dashed ghost standing at each position it has left.',
      'The three meeting points are then marked beneath the line and joined by arrows labelled ×10, and the two gaps come out the same length.',
      'At the close the constants drop away downward from the labels and the chips lift off the top, leaving n against n².',
    ],

    screen: {
      affordances: [
        'The screen runs the whole argument on its own — probe, post, two moves of the post, the spacing between them, then the erasure — and stops with the constants gone.',
        'Two buttons: Replay, and a step control for taking one step at a time, which is how a reader can stop just after the post has moved and read the new meeting point off the line.',
        'The constant is fixed at 100 and the factor at 10, so an article can name n = 10, n = 100 and n = 1000 as the three meeting points the reader will see.',
      ],
    },

    useWhen: [
      'The article says constants are ignored and the reader hears "constants do not matter", which is not the claim being made. A hundredfold constant buying exactly two ticks of line and nothing else separates "cannot change the outcome" from "is unimportant".',
      'The reader is holding on to the idea that a large enough multiplier would keep the linear side in front forever. The post moving one tick per tenfold rise answers that in measured distance rather than by assertion.',
      'The prose is about to claim that a faster machine or a tighter inner loop does not move an algorithm into a better class, and the reader needs the multiplier itself to be varied before granting it.',
    ],

    avoidWhen: [
      'The subject is the terms of one expression competing with each other. Here the two sides are separate expressions and the multiplier in front of one of them is what varies.',
      'The article is about picking between two concrete implementations at a known input size, where the constants are exactly what decide. Nothing here is named as an implementation or measured.',
      'The point is constant time itself — work whose cost does not depend on n at all.',
      'The article uses "constant" for a fixed value declared in source code or a setting held steady in an experiment.',
    ],

    contrastWith: [
      {
        concept: 'bigO',
        note: 'One fixes what a constant multiplier is able to buy and what it cannot; the wider concept takes the coefficients as given and settles which single term a cost expression gets written as.',
      },
      {
        concept: 'growthOutpaces',
        note: 'The other keeps a single expression and asks which of its terms survives; this one keeps two expressions whole and varies the multiplier in front of one, to fix what a multiplier is able to buy.',
      },
      {
        concept: 'curvesCross',
        note: 'Both set two growth rates side by side, but one varies the constant to show the crossing can only be relocated, while the other fixes two named algorithms and reports where their crossing actually falls.',
      },
      {
        concept: 'depthDoublesCount',
        note: 'One derives a growth rate by counting a structure; this one takes two growth rates as given and tests whether a coefficient is able to overturn them.',
      },
    ],
  },
};
