/**
 * fastPower 개념 선언.
 *
 * canonical facet 은 `facet:fastPower` — 왼쪽에 제곱의 사다리, 오른쪽에 답 상자,
 * 아래에 **같은 눈금으로 그린 곱셈 자 둘**이 있는 화면이다. 손잡이는 지수 하나이고
 * 8 · 13 · 20 · 50 · 100 · 1000 으로 민다. 빠른 쪽은 4 → 15 로 거의 안 움직이는데
 * 단순한 쪽이 7 → 999 로 늘어, 절약이 3 → 984 가 된다.
 *
 * ── 조각과 어떻게 갈랐나
 *
 * 조각 `squareAndHalve` 는 **접는 방법**을 말하고 멈춘다 — 칸의 가로가 지수 폭이라
 * 접을 때마다 칸 수는 반, 폭은 두 배이고, 빈 자리 하나가 곧 1101 의 0 이다.
 * 이 완제품이 더하는 것은 **그래서 얼마나 아끼는가** 하나다. 그래서 definition 의
 * 주어를 「거듭제곱을 셈하는 일」이 아니라 **「아낌의 크기와 그것이 벌어지는 결」**
 * 로 두었고, keywords 도 방법 어휘가 아니라 비용·견줌 어휘를 갖는다.
 *
 * 조각의 definition 이 꼬리에 「비용이 지수의 자릿수를 따른다」를 달고 있다. 그
 * 문장을 이쪽이 되풀이하면 두 점이 붙으므로, **자릿수를 definition 에서 아예 빼고**
 * 사다리와 자릿수 이야기는 observable 로만 내려 보냈다.
 *
 * ── 옆 개념과 어떻게 갈랐나
 *
 * `halveTheRange` 는 **찾을 범위**를 반으로 줄이고 이쪽은 **지수**를 접는다.
 * `matrixMul` 과는 아낌의 모양이 다르다 — 저쪽은 한 겹의 차이 하나가 고정인 채
 * 재귀로 증폭되고, 이쪽은 한쪽이 아예 자라지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fastPowerConcept: FacetConceptSource = {
  id: 'fastPower',
  label: 'Fast Power (What Squaring Saves as the Exponent Grows)',
  canonicalFacet: 'facet:fastPower',

  surface: {
    definition:
      'How much is saved by reaching a power through squaring rather than multiplying one factor at a time, and how far that saving widens as the exponent grows.',
    exemplarKeywords: [
      'how many multiplications a power costs',
      'logarithmic versus linear number of operations',
      'repeated multiplication compared with repeated squaring',
      'why pow is not a loop that runs n times',
      'raising a number to a very large exponent',
      'x to the thousandth power',
      'cost of modular exponentiation in cryptography',
      'exponent size and running time',
      'O(log n) instead of O(n) multiplications',
      'the saving grows as the exponent grows',
      'two exponents that cost the same',
    ],
  },

  briefing: {
    observable: [
      'A ladder of squares stands on the left, one rung per binary digit of the exponent, each rung labelled with the power it holds and with the span it covers printed beside it as 1, 2, 4, 8 and so on.',
      'A new rung descends from the position of the rung above it, so a square is visibly made out of the value that came before rather than from the base.',
      'A digit column beside the ladder fills in with a 1 or a 0 per rung. On a 1 the rung sends its power flying into an answer box on the right, and on a 0 the rung slides aside and dims.',
      'The answer box never shows the value, only the power reached so far, and its exponent grows by the spans that have been taken: 1, then 5, then 13.',
      'Two bars at the bottom share one scale, one multiplication per unit of length. The simple bar is drawn to full length at the start because its length is known before anything is computed; the fast bar grows a unit at a time as the run proceeds.',
      'At the end a bracket is drawn across the gap between the two bar ends and labelled with the saving, so the difference is a length before it is a number.',
      'Four counters run underneath: fast, simple, saved, and how many of the fast multiplications were squarings.',
      'Pushing the handle from 8 to 1000 moves the simple count from 7 to 999 while the fast count moves from 4 to 15, and the saving climbs 3, 6, 13, 41, 90, 984.',
      'Exponents 13 and 20 both settle at six fast multiplications even though one is half again the other, and the digit column shows why they differ in shape but not in cost.',
    ],

    screen: {
      affordances: [
        'Playback controls sit under the drawing: play, single step, pause, reset and a speed slider. The screen plays one exponent through on its own and then holds.',
        'One handle beside them, a segmented slider over six exponents: 8, 13, 20, 50, 100 and 1000. Once a run has finished, play and step go quiet and only reset and this handle stay live.',
        'Reading the saving means moving the handle rather than watching one run, since a single exponent gives one pair of bars and the claim is about how the pair changes.',
        'Stepping holds the screen on the moment a digit is read, which is where a rung is either sent to the answer or left behind.',
        'The code panel starts empty. The reader clicks "+ Add language" and picks from Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side. It counts multiplications rather than computing the value, so the six languages agree on every setting of the handle.',
      ],
    },

    useWhen: [
      'The article asserts a logarithmic cost and the reader has no feel for the size of that claim. Fifteen multiplications sit beside nine hundred and ninety-nine on one scale, and moving the handle walks the gap from three up to nine hundred and eighty-four.',
      'A reader expects cost to track the exponent, so two different exponents costing the same reads as a mistake. Thirteen and twenty both land on six, and the binary digits standing beside the ladder are what decides that rather than the size of either number.',
      'The prose warns that a large exponent is expensive and a reader is about to design around avoiding one. Across a hundred and twenty-five fold rise in the exponent the fast count does not quite quadruple.',
    ],

    avoidWhen: [
      'The point is how the folding itself works — which squares end up in the answer and why those are the ones the binary digits name. That correspondence is taken as settled here and only the cost of the two routes is weighed.',
      'The subject is arithmetic under a modulus, where reducing after every multiplication is what keeps the numbers workable. Nothing is reduced here and the result is only ever written as a power.',
      'The article raises a matrix, a permutation, or a repeated transformation to a power. The same accounting applies, but every rung here holds one plain number.',
      'The point is what a single multiplication costs once the operands have thousands of digits. Every multiplication counts as one here regardless of what is being multiplied.',
      'The word "power" refers to computing capacity, to electrical power, or to a power set.',
    ],

    contrastWith: [
      {
        concept: 'squareAndHalve',
        note: 'The same scheme approached from two sides: one settles how the folding works and why the odd steps are exactly the ones taken into the answer, while this takes that as given and asks what the whole thing costs against multiplying one at a time.',
      },
      {
        concept: 'halveTheRange',
        note: 'Both are arguments that a logarithm stands in for a linear count, and what is being counted differs: there it is candidates a comparison can eliminate, here it is multiplications two routes to the same value actually perform.',
      },
      {
        concept: 'matrixMul',
        note: 'Both weigh what a restructuring saves rather than how it works, and the savings have opposite shapes: one route here simply stops growing, while there a single fixed difference is made large only by being repeated.',
      },
    ],
  },
};
