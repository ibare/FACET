/**
 * angleNotLength 개념 선언.
 *
 * canonical facet 은 `facet:angleNotLength` — 조각(piece)이다. 원점에서 화살 넷이
 * 자라고, 화살 곁에 길이 자가 붙었다가 물러난 뒤, 질의의 방향에서 후보의 방향까지
 * 부채꼴이 실제로 벌어진다. 이어서 끝점끼리 줄을 이어 순위가 뒤집히는 것을 보인다.
 * 계기도 코드 패널도 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `vectorSimilarity` 는 잣대가 고르는 것이라는 사실과 세 차례의 어긋남을
 * 맡는다. 이 조각이 홀로 맡는 것은 **한 잣대의 시야** 다 — 방향만 읽고 크기를
 * 나눠 없애므로, 멀어도 같은 쪽을 보는 것이 가까우면서 다른 쪽을 보는 것보다
 * 앞선다는 것. definition 의 주어가 "각만 읽는 견줌" 이고, keywords 는 코사인의
 * 정의 · 정규화 · 문서 길이 어휘만 갖는다 (완제품의 잣대 고르기 어휘와 겹치지 않게).
 *
 * ── 묶음 사이는 어떻게 갈랐나
 *
 * 비용 묶음(곱셈 · 훑기 · 차원 수)과 축약 묶음(토막 · 번호 · 바이트)의 어휘를
 * definition 과 keywords 에서 쓰지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const angleNotLengthConcept: FacetConceptSource = {
  id: 'angleNotLength',
  label: 'Angle, Not Length (Direction Compared, Size Left Out)',
  canonicalFacet: 'facet:angleNotLength',

  surface: {
    definition:
      'Comparing two vectors by the angle between their directions alone, with magnitude divided out, so a far-off vector aimed the same way scores higher than a near one aimed elsewhere.',
    exemplarKeywords: [
      'cosine similarity',
      'the angle between two vectors',
      'length is divided out',
      'magnitude plays no part',
      'a long document and a short one on the same topic',
      'unit vectors',
      'normalising before comparing',
      'direction rather than size',
      'the value is one when two arrows are parallel',
      'why not simply use distance',
    ],
  },

  briefing: {
    observable: [
      'Every arrow keeps growing past its tip as a dotted extension, so what is being compared reads as a direction continuing rather than a point sitting somewhere.',
      'Rulers appear alongside the arrows first, writing their lengths as 1.41, 7.07 and 9.43, and the moment the first fan opens all three fade back — the demotion of length is its own beat rather than something the caption asserts.',
      'The fan really sweeps from the query direction round to the candidate direction, and the degrees and the value settle at its mouth only once it has finished opening.',
      'Fan radii differ between candidates with the shortest arrow given the widest one, purely so the readings do not overlap, so the size of a fan carries nothing and only its opening does.',
      'Each point ends up carrying two badges side by side, a round one for the angle order and a diamond for the distance order, so both verdicts sit on the same point at the same time.',
      'The longest arrow of the three, at 9.43, opens the narrowest fan at 13.6 degrees and takes first place by angle, then comes last by the straight-line ruler and is pulsed at the close.',
      'That reversal is decided by 6.40 against 6.32 — eight hundredths — so the flip is real but the margin is thin, and an article claiming the two rulers "strongly disagree" would be overstating this data.',
      'Both directions share one unit on the grid of dots, which is what makes the opening of a fan the actual angle rather than a drawing of one.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole comparison on its own and stops with both sets of badges standing and the reversed candidate still pulsing.',
        'Two buttons: Replay, and a step control that rewinds and walks the same beats one at a time, which is how a reader can hold the screen at the moment the length rulers are still at full strength.',
        'The query and the three candidates are fixed at whole-number coordinates, so an article can name the arrow that is longest and quote the two readings that disagree about it.',
      ],
    },

    useWhen: [
      'An article reaches for the word "similar" and the reader pictures nearness on a map. One arrow that is plainly the farthest away and plainly the most alike is the picture that has to replace it.',
      'The prose argues that a long document should not be penalised for being long against a short one on the same subject. Length is written on screen, then set aside, and the order is produced without it.',
      'A reader has met the formula with its division by two magnitudes and read the division as bookkeeping. Watching the ranking come out of the opening of a fan alone is where the division acquires a job.',
    ],

    avoidWhen: [
      'The reader is meant to try other instruments and watch the answer move. Nothing here is adjustable; one comparison is made and one reversal is shown.',
      'The article means the Euclidean algorithm for greatest common divisors. Only the word is shared.',
      'The subject is finding the best match among many quickly, or any index that avoids measuring everything. Three candidates are measured and that is all.',
      'The point is geometry in hundreds of dimensions, or how angles behave when there are many. Two dimensions are what make the opening visible here.',
      'The article uses "angle" for rotation, camera framing, or a shape in a drawing.',
    ],

    contrastWith: [
      {
        concept: 'vectorSimilarity',
        note: 'One holds the rule fixed and is about what the rule admits and discards; the other lets the rule vary and is about how much of the answer was resting on it.',
      },
      {
        concept: 'projectAndLose',
        note: 'Both set part of a vector aside, but one drops the component perpendicular to a line and cannot recover it, while this keeps the vector intact and merely refuses to let magnitude into the score.',
      },
      {
        concept: 'voteByNeighbors',
        note: 'Both order examples by a measured quantity, but one spends the order on a label decided by counting, while this stops at the order and asks which quantity produced it.',
      },
    ],
  },
};
