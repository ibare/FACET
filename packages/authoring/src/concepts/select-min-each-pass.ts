/**
 * selectMinEachPass 개념 선언.
 *
 * canonical facet 은 `facet:selectMinEachPass` — 조각(piece)이다. 화면이 세 켜다:
 * 위 레일에 훑는 눈길의 자국, 가운데에 값이 든 칸 넷, 아래 레일에 「지금까지
 * 가장 작았던 자리」 표식이 건너다니는 길. 다 훑고 나면 위에는 자국이 셋,
 * 아래에는 하나 남고, 값이 옮겨지는 것은 그 뒤 딱 한 번이다. 계기도 코드 패널도
 * 없고 컨트롤은 다시 보기 · 한 걸음 둘뿐이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `selectionSort` 는 바퀴 여섯을 다 돌아 두 셈(견줌 스물하나 · 이동 다섯)의
 * 비대칭과 그것이 입력에 흔들리지 않는다는 결과를 맡는다. 이 조각이 홀로 맡는
 * 것은 **한 바퀴 안에서 움직이는 것이 자리 하나의 기억뿐이라는 것** 이다 —
 * 견줌은 표식을 옮길지만 정하고, 값은 훑기가 끝난 뒤에야 한 번 움직인다.
 * definition 의 주어가 "한 바퀴 안의 표식" 이고, keywords 는 읽기와 쓰기를
 * 가르는 어휘만 갖는다 (완제품의 총비용 · 안정성 어휘와 겹치지 않게).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const selectMinEachPassConcept: FacetConceptSource = {
  id: 'selectMinEachPass',
  label: 'Selecting the Minimum (Only the Marker Moves)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:selectMinEachPass',

  surface: {
    definition:
      'Within one pass a marker for the smallest seen so far hops between positions while every value stays put, and a single exchange happens only once the scan has ended.',
    exemplarKeywords: [
      'tracking the smallest so far',
      'the index moves, not the data',
      'comparing is not the same as writing',
      'argmin',
      'a loop that only remembers a position',
      'deferred swap',
      'one write per pass',
      'reading cost versus writing cost',
      'find the minimum before touching anything',
      'the variable holding the best candidate',
    ],
  },

  briefing: {
    observable: [
      'The screen is drawn as three layers: a rail above where the scanning gaze leaves a mark at each comparison, the four value cells in the middle, and a rail below where the marker for the smallest so far travels.',
      'Three marks accumulate on the upper rail and only one hop appears on the lower one, so the two rails end the scan with visibly different tallies.',
      'Throughout the scan the middle row is untouched — the caption asks whether the value under the gaze is smaller, and on a yes says that the marker hops there, not the value.',
      'The end-of-scan caption states plainly that not one value has moved, before anything is allowed to move.',
      'Only then does a single exchange happen, bringing the marked value to the front of the row.',
      'The closing caption gives the pass in two numbers: three comparisons against one value move.',
    ],

    screen: {
      affordances: [
        'The screen plays one whole pass on its own and stops just after the single exchange.',
        'Two buttons: Replay, and a step control that rewinds and walks the same comparisons one at a time, which is how a reader can sit between a comparison and the marker hop it causes.',
        'The four values are fixed, so an article can name the value the marker ends on and the one position it hopped from.',
      ],
    },

    useWhen: [
      'The article writes the pass as "find the minimum, then swap" and the reader collapses the two into one motion. The marker crossing the lower rail while the middle row stands still is what separates remembering a position from moving data.',
      'A reader arriving from neighbour-swapping sorts expects every comparison to disturb the row, and here the row is undisturbed for the whole scan with the caption saying so at the end.',
      'The prose needs the reason writes stay rare: the single exchange is decided only after everything remaining has been read, so no comparison can cause one on its own.',
    ],

    avoidWhen: [
      'The subject is the whole sort, its total cost, or how many passes it takes. One pass over four values is all that runs here.',
      'The article only needs the smallest value as an answer — a minimum function, an aggregate, a reduction. Nothing here is about the answer; it is about which layer moved while the answer was being found.',
      'The point is what happens to values that compare equal once the exchange reaches across the row.',
      'The article uses selection for a highlighted range in an editor, a choice from a menu, or picking features for a model.',
    ],

    contrastWith: [
      {
        concept: 'selectionSort',
        note: 'This is one pass, in which remembering a position and moving a value come apart; that concept is every pass repeated to a sorted row at an unchanging comparison cost.',
      },
      {
        concept: 'compareAndSwap',
        note: 'Both separate the question from the write, but there the write follows immediately when the answer is yes, while here it is postponed until the scan is over.',
      },
      {
        concept: 'bubbleAdjacentSwap',
        note: 'Neighbour swapping lets each comparison move data a single seat; here comparisons move nothing and the one exchange crosses whatever distance it needs to.',
      },
      {
        concept: 'insertIntoSortedPart',
        note: 'Both settle one seat at a time, but inserting shifts a run of values to open a gap while this leaves everything in place and exchanges a single pair.',
      },
    ],
  },
};
