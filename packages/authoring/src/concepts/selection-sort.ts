/**
 * selectionSort 개념 선언.
 *
 * canonical facet 은 `facet:selectionSort` — 완결형이다. 값 일곱 한 줄 아래에
 * 바퀴마다의 견줌과 이동을 두 열로 적는 장부가 있고, 누적 계기 셋(견줌 · 맞바꿈 ·
 * 바퀴)과 여섯 언어로 펼쳐지는 코드 패널이 딸려 있다. 자료는 `i=3` 바퀴의
 * 최솟값이 이미 제자리라 이동 자리가 하나 비도록 고른 것이다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념은 **정렬 전체와 그 셈** 을 맡는다 — 바퀴 여섯이 자리를 하나씩 확정하고,
 * 견줌은 6+5+4+3+2+1 로 입력과 무관하게 스물하나이며 이동은 다섯뿐이라는 것.
 * 무게중심이 「두 셈의 비대칭과 그것이 입력에 흔들리지 않는다는 사실」이다.
 * 조각 `selectMinEachPass` 는 한 바퀴 안에서 움직이는 것이 표식뿐이라는 것만
 * 말한다. keywords 도 이쪽은 전체 비용 · 안정성 · 언제 쓰는가 어휘를, 조각은
 * 견줌과 쓰기를 가르는 어휘를 갖는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const selectionSortConcept: FacetConceptSource = {
  id: 'selectionSort',
  label: 'Selection Sort (Many Comparisons, Few Moves)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:selectionSort',

  surface: {
    definition:
      'A sort that fills each seat from the left by scanning the whole unsorted remainder for its smallest value and moving that value once, always at the same comparison cost.',
    exemplarKeywords: [
      'selection sort',
      'n(n-1)/2 comparisons',
      'at most n-1 swaps',
      'best case equals worst case',
      'no early exit on sorted input',
      'in-place sorting',
      'unstable sort',
      'when writes are expensive',
      'minimising writes to flash',
      'quadratic sorting algorithm',
      'why the outer loop stops one short',
      'sorting large records by moving them rarely',
    ],
  },

  briefing: {
    observable: [
      'Seven values stand in a row; the seat being filled and the current minimum are picked out, and during a scan the cursor moves across the remaining cells while every value stays exactly where it is.',
      'A ledger below keeps two columns, comparisons and moves, and the comparison column falls one step shorter each pass — six, five, four, three, two, one — while the move column stands as a short single file beside it.',
      'The totals under the ledger read twenty-one comparisons against five moves, so the asymmetry is a pair of numbers rather than an impression.',
      'One pass leaves its move row empty, because that pass found its smallest value already sitting in the seat it was filling and nothing was exchanged.',
      'The caption during a scan asks whether the value under the cursor is smaller than the current minimum, and when it is, says that the mark moves while nothing else does.',
      'Each pass ends by settling one more seat from the left, and after the sixth pass the run stops with the last cell already correct and never scanned.',
      'Three counters run along the bottom: comparisons, swaps and passes.',
      'The code panel highlights the line matching the current step, and the guard around the exchange is a line of its own that the empty-move pass skips.',
    ],

    screen: {
      affordances: [
        'Nothing happens until Play is pressed. The bar carries play, single step, pause, reset and a speed slider.',
        'The code panel starts empty with a "+ Add language" button; up to two of Python, JavaScript, TypeScript, Java, C++ and C# stand side by side.',
        'The seven starting values are fixed and are not shuffled on reset, so an article can name the pass whose move row stays empty and rely on it being there.',
        'The ledger is the place to point when the argument is about cost, since the staircase and the single file of moves are the two counts drawn at the same scale.',
      ],
    },

    useWhen: [
      'The article claims this sort earns its place where writing is expensive, and a reader has only the quadratic label to go on. Twenty-one comparisons standing next to five moves in the same picture is the claim itself.',
      'The prose says the comparison count does not depend on the input, and the staircase is that sentence drawn: naming a smallest value requires looking at everything still unsorted, whatever order it happens to be in.',
      'A reader wants to know why the outer loop stops one short of the end. Six passes settle six seats and the seventh cell is left holding the only value that can be there, with nothing to compare it against.',
      'The article explains guarding the exchange with a test for the value already being in place, and it reads as a micro-optimisation until the pass with an empty move row shows what the guard is protecting.',
    ],

    avoidWhen: [
      'The article uses selection for choosing features for a model, a highlighted range in an editor, or a database query clause.',
      'The subject is selection in the statistical sense — finding the k-th smallest value while leaving the rest unordered.',
      'The point is a sort that finishes early on nearly ordered input, or one whose cost depends on how the data arrived. Every run of this one costs the same.',
      'The article needs records that compare equal to keep their original order. The exchange here reaches across the row and is precisely what breaks that.',
      'The subject is taking the smallest repeatedly from a structure that maintains it, rather than rescanning the remainder every time.',
    ],

    contrastWith: [
      {
        concept: 'selectMinEachPass',
        note: 'That screen slows one pass down until remembering a position and moving a value come apart; this runs every pass and adds them up.',
      },
      {
        concept: 'bubbleSort',
        note: 'Both compare about as often, but swapping neighbours writes on every comparison that finds a pair out of order, while this writes once per pass at most.',
      },
      {
        concept: 'insertionSort',
        note: 'Both build a sorted region from the left; insertion pays little on nearly ordered input and this pays the same on every input.',
      },
      {
        concept: 'heapSort',
        note: 'Both repeatedly take the smallest remaining value, but one pays to maintain a structure that knows where it is while this rescans the remainder each time.',
      },
      {
        concept: 'sortStability',
        note: 'The long-range exchange that keeps the move count low is the same thing that can reorder records comparing equal.',
      },
    ],
  },
};
