/**
 * matrixMul 개념 선언.
 *
 * canonical facet 은 `facet:matrixMul` — 위에 A × B = C 와 표준 · 스트라센 두 열을
 * 나란히 세우고, 가운데에 깊이별 곱셈을 로그 자로 그리는 화면이다. 손잡이는 재귀
 * 깊이 k (1~7) 하나이고, 아낀 곱셈이 1 → 1,273,609 로 간다.
 *
 * ── 조각과 어떻게 갈랐나
 *
 * 조각 `rowTimesColumn` 은 **한 칸의 맞물림**을 말하고 멈춘다 — 두 띠가 한 곳에서
 * 겹치고 거기가 C[i][j] 다. 이 완제품은 **그 맞물림을 한 번 덜 하면** 무엇이
 * 벌어지는가를 더한다. 그래서 definition 의 주어가 「한 칸이 어디서 오는가」가
 * 아니라 **비용**이다.
 *
 * ── 무엇이 주장인가
 *
 * 배율이 아니라 **증폭**이다. 한 겹에서 여덟을 일곱으로 줄인 차이 **하나가 고정**인
 * 채로 재귀를 타고 불어난다. 한 겹만 보면 덧셈이 4 대 18 이라 오히려 손해이고,
 * 그 손해가 화면에 직접 뜬다는 것이 이 개념이 말할 수 있는 것이다.
 *
 * ── 옆 개념과 어떻게 갈랐나
 *
 * `matrixTransform2d` 는 행렬이 점을 **어디로 옮기는가**(뜻)이고 이쪽은 곱셈을
 * **어떻게 덜 하는가**(비용)다. `divideConquerCombine` 은 답이 올라오는 길에서만
 * 생긴다는 결이고, 이쪽은 **가르면 조각이 몇이 되는가**가 전부다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const matrixMulConcept: FacetConceptSource = {
  id: 'matrixMul',
  label: 'Strassen Multiplication (One Fewer Product per Layer)',
  canonicalFacet: 'facet:matrixMul',

  surface: {
    definition:
      'The cost of multiplying matrices when a divided layer is done with seven block products instead of eight, so a fixed difference of one per layer compounds through the recursion.',
    exemplarKeywords: [
      'Strassen algorithm',
      'fast matrix multiplication',
      'matrix multiplication complexity',
      'n to the 2.807',
      'seven multiplications instead of eight',
      'block matrix multiplication',
      'divide and conquer on matrices',
      'why matrix multiplication need not be n cubed',
      'trading multiplications for additions',
      'the exponent of matrix multiplication',
      'cost of matmul',
    ],
  },

  briefing: {
    observable: [
      'One layer is worked at full size on the left as two 2x2 tables and their product, with the result cells standing as dashes until they are filled, so the same layer can be computed twice and compared.',
      'Two columns sit side by side to the right, each headed with its own count of multiplications and additions, so the trade is read across rather than remembered from one screen to the next.',
      'The standard column gives one line per result cell, each an explicit sum of products. The other column gives one line per product, and those lines visibly take sums and differences as their operands rather than single entries.',
      'Two of the seven products come out negative, which is where the subtractions in the operands show up as something other than bookkeeping.',
      'The standard lines are then replaced in place by the recombination, and those lines contain no multiplication at all — only the seven products added and subtracted back into the same four cells, reaching the same result.',
      'The head counts make the cost plain in the same breath: the multiplications fall from eight to seven while the additions rise from four to eighteen, so a single layer taken alone is worse rather than better.',
      'A chart below draws the two multiplication counts per depth on a logarithmic scale, which keeps the two as gently diverging lines while the saving printed under each depth jumps by whole digits: 1, 15, 169, 1695, 15961, 144495, 1273609.',
      'The depth axis is fixed to its full extent rather than redrawn for the chosen depth, so moving the handle fills columns further to the right instead of rescaling into the same picture.',
      'Four counters run at the bottom along with the matrix size: standard, the faster count, and the multiplications saved.',
      'Across the whole handle the ratio between the two counts reaches only about two and a half, while the saved count goes from one to over a million — the gentle drift of the bars and the jump in the printed number disagree on purpose.',
    ],

    screen: {
      affordances: [
        'Playback controls sit under the drawing: play, single step, pause, reset and a speed slider. One depth is worked through on its own and then the screen waits.',
        'One handle beside them, a segmented slider over recursion depths 1 through 7. Once a run has finished, play and step go quiet and only reset and this handle stay live.',
        'A run walks the layer first and the depths afterwards, so stepping is how a reader holds the seven products on screen before they are recombined and the cell values are checked against the standard ones.',
        'The claim is about what repetition does to a fixed difference, so it is read by moving the handle up the depths and watching the printed saving rather than the bars.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side. It carries the two ways of computing one layer and the recursion that counts the layers.',
      ],
    },

    useWhen: [
      'The article quotes an exponent below three and a reader cannot see where such a number could come from. Eight block products become seven and nothing else about the shape changes, so the exponent is simply what repeating that one trade amounts to.',
      'A reader is told the method is faster and then sees the additions rise from four to eighteen in the very same layer, which reads as a contradiction rather than a trade. One layer really is a loss, and the counts at each depth are where it is recovered.',
      'The prose gives a speedup figure and the modest size of it invites the reader to dismiss the whole idea. The ratio stops near two and a half while the multiplications avoided run past a million, so the two ways of stating the same result part company on screen.',
    ],

    avoidWhen: [
      'The point is what one entry of a product is, or which terms the subscripts in the formula pick out. Entries are computed here only far enough to show that two routes agree.',
      'The article is about what a matrix does to space — rotating, scaling, shearing, or where a vector is sent. Two tables of numbers produce a third and nothing is moved.',
      'The subject is real-world speed: cache behaviour, blocking, parallel hardware, or library benchmarks. Only multiplications are counted, and the additions only within a single layer.',
      'The point is numerical accuracy, or whether the subtractions make the method unsafe in floating point. Every value here is an exact small integer.',
      'The article is about the later record-holding methods or the theoretical limit of the exponent. A single trade of eight for seven is the whole of what is shown.',
      'The subject is multiplying matrices whose sides are not powers of two, or the padding that makes them so. Every size on the handle is a power of two by construction.',
    ],

    contrastWith: [
      {
        concept: 'rowTimesColumn',
        note: 'One accounts for a single entry of a product and says nothing about how many products there are; this asks how few products the whole thing can be done in, and one fewer per divided layer is the answer.',
      },
      {
        concept: 'divideConquerCombine',
        note: 'Both cut a problem apart and rebuild from the parts, and the interest falls elsewhere: one is about answers existing only on the way back up, while this is about how many parts the cut leaves and what that count does to the total.',
      },
      {
        concept: 'matrixTransform2d',
        note: 'Meaning against cost for the same object: one reads a matrix as a decision about where the points of a plane go, while this treats a product as arithmetic to be got through in as few multiplications as possible.',
      },
      {
        concept: 'fastPower',
        note: 'Both trade a dearer operation for cheaper ones and then count the difference, but there one route simply stops growing, while here a single layer is actually the worse bargain and only repetition turns it around.',
      },
    ],
  },
};
