/**
 * negateAndAddOne 개념 선언.
 *
 * canonical facet 은 `facet:negateAndAddOne` — 8비트 자리표에 적은 +45 를 모두
 * 뒤집고 1 을 더해 -45 로 만든 뒤, 원래 수를 도로 더해 여덟 자리가 전부 0 이
 * 되는 것을 보이는 조각이다. 볼거리는 자리올림이 어디서 멎는가 — `+1` 에서는 한
 * 칸에서 끝나고, 검산에서는 폭 전체를 타고 밖으로 나간다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩만 딸려 있다 — 수도 폭도 고를 수
 * 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 `twosComplement` 가 세 자리를 갈라 두었고 이 파일은 그 분배를 받는다.
 *
 *   twosComplement   읽는 약속. 폭이 약속의 일부라 같은 비트열이 두 수다.
 *   positionalValue  한 수를 자리값의 합으로 쪼개고 밑을 바꿔 다시 적는 일.
 *   이 개념          **음수를 만드는 절차**. 뒤집고 하나 더해, 더해서 0 이 되는
 *                    짝을 얻는다. 읽는 약속이 아니라 셈이므로 검산으로 확인된다.
 *
 * 그래서 keywords 는 **절차 어휘**(뒤집는다 · 1 을 더한다 · 자리올림 · 뺄셈이
 * 덧셈이 되는 일)를 가져간다. 폭 · 형 변환 · 부호 확장은 형제가, 진법 변환
 * 어휘는 positionalValue 가 갖는다.
 *
 * avoidWhen 이 막아야 하는 것: definition 에 "complement" 계열 어휘가 있는 한
 * 집합의 여집합 · 보색 글이 걸린다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const negateAndAddOneConcept: FacetConceptSource = {
  id: 'negateAndAddOne',
  label: 'Negate by Flipping and Adding One',
  canonicalFacet: 'facet:negateAndAddOne',

  surface: {
    definition:
      'The procedure that turns a positive pattern into its negative — invert every position, then add one — producing the pattern that adds back to the original as zero.',
    exemplarKeywords: [
      'flip the bits and add one',
      'invert every bit then add 1',
      'the ~x + 1 idiom',
      'negating in two\'s complement',
      'how a machine subtracts without a subtract circuit',
      'a - b becomes a + (-b)',
      'the additive inverse of a number',
      'a carry rippling from the right',
      'carry out of the top position',
      'what makes a pattern the negative of another',
      'producing -x from x',
      'inverting first, then the plus one',
    ],
  },

  briefing: {
    observable: [
      'Eight tiles drop into place from below one after another, left to right, and a line underneath reads the row plainly as "unsigned: 45".',
      'Before anything is inverted a smaller, fainter copy of the row rises out from behind the working tiles and settles above them under the word "original", so the starting pattern stays on screen for the rest of the run.',
      'All eight tiles then turn at once about their own vertical axis — each flattens to a line and comes back showing the opposite value — and the reading beneath becomes "unsigned: 210", a number that is not yet negative.',
      'The carry is a single pellet with a 1 on it that enters from the right along a dotted rail, runs to the last position, rises into the tile and is absorbed as that tile turns; because that position held 0, the pellet is spent there and the caption says so: "Add 1. The carry lands on the last position and stops."',
      'The reading now says "unsigned: 211" while the pattern on screen has not been declared negative yet.',
      'In the check the tiles of the remembered original fall one at a time, passing behind the working row, and land on a lower row as the sum at that position, while a pellet travels left along the rail in step with them.',
      'Every one of the eight sums lands as 0, and this time the pellet is still alive at the leftmost position: it continues past the edge of the row and shrinks away, which is the same addition rule as before running the full width instead of stopping after one place.',
      'Only at that point does the reading switch from unsigned to "two\'s complement: -45", and the row of zeros collapses flat and vanishes — the caption tying the two together as "The sum is 0, so this pattern is the negative: -45."',
      'A caption above the row narrates each move, and the working row is the one thing that persists from the first frame to the last, with the original above it and the sums below.',
    ],

    screen: {
      affordances: [
        'The screen runs the whole negation and its check on its own and stops with the finished pattern and its signed reading.',
        'Two buttons: Replay, and a step control that rewinds and retakes the same five moments one press at a time, which is how a reader can stop on the carry.',
        'The starting value is fixed at +45 in eight positions, so an article can quote the three patterns and both readings by name.',
      ],
    },

    useWhen: [
      'The article states the rule — invert, then add one — and the reader files it away as a recipe with no reason attached. Adding the original back and watching all eight positions fall to zero turns the recipe into a derivation.',
      'The reader believes a value is made negative by setting something aside to mark it, and the screen instead touches every position and arrives at a pattern that shares nothing obvious with the one it came from.',
      'The prose needs the working definition of a negative to be "the thing that adds to zero" rather than "the thing written with a minus", because the argument that follows depends on the arithmetic rather than on the notation.',
      'The article needs a carry to be a thing with an extent rather than a footnote: the same addition stops dead after one position in the first sum and travels the entire width in the second, and the two run on the same rail one after the other.',
    ],

    avoidWhen: [
      'The article uses "complement" for the complement of a set, or for the complement of an event in probability.',
      'The article uses "complement" for complementary colours, or in its ordinary sense of two things completing each other.',
      'The subject is what a pattern already on the page means — which reading applies, what the top position weighs, how many positions were declared. Here the width never changes and the question is how the pattern was produced.',
      'The subject is a result that is wrong because it left its container. A carry does leave the width here, and it is the proof that the sum is zero rather than a loss.',
      'The article is about the other ways a sign has been encoded — a leading sign position, or inverting alone without the added one. Only the one route appears, carried through to its check.',
      'The point is per-bit operations as a family — AND, OR, XOR, masks, shifts. Inversion appears here as one step of a two-step procedure, not as an operator being demonstrated.',
      'The article is about how an adder is built — gates, full adders, carry lookahead. The addition here is performed, not constructed.',
      'The subject is writing a value in another base or reading hexadecimal. Both readings on screen are decimal.',
      'The article is about negating a fractional value, where the sign is a field of its own rather than something the whole pattern participates in.',
    ],

    contrastWith: [
      {
        concept: 'twosComplement',
        note: 'This one derives a pattern and can prove it by arithmetic — the two patterns add to zero, which is checkable without agreeing on anything first. That one is the agreement itself, which decides what a pattern already written denotes.',
      },
      {
        concept: 'positionalValue',
        note: 'Both act on one row of positions, but here every position is changed to produce a different number, whereas that one leaves the row untouched and only re-cuts it to write the same number another way.',
      },
      {
        concept: 'integerOverflow',
        note: 'Both end with a carry leaving the width. Here that departure is the expected outcome of a negation working correctly; there it is the moment a computation stops answering the question that was asked.',
      },
    ],
  },
};
