/**
 * selectorRightToLeft 개념 선언.
 *
 * canonical facet 은 `facet:selectorRightToLeft` — 조각. 후보 하나와 선택자 하나만 두고,
 * "판정"이 아니라 "판정에 이르는 걸음 하나하나의 방향"만 확대한다. 선택자 안의 읽는 자리는
 * 오른쪽 끝 단순 선택자에서 시작해 맞을 때만 한 칸 왼쪽으로 옮기고, 문서 안의 보는 자리는
 * 맞든 아니든 매번 한 칸 위(조상)로 옮긴다. 두 자리가 함께, 그러나 다른 조건으로 움직이는
 * 것이 이 조각의 전부다 — 규칙끼리 견주는 무게는 등장하지 않는다.
 *
 * cascadePriority(완제품)의 "판정" 단계 하나를 떼어 확대한 것이고, cascadeConflict(조각)
 * 가 다루는 "규칙끼리 무게 다툼"의 앞 단계에 해당한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const selectorRightToLeftConcept: FacetConceptSource = {
  id: 'selectorRightToLeft',
  label: 'Selector Matching, Right to Left',
  canonicalFacet: 'facet:selectorRightToLeft',

  surface: {
    definition:
      'The single check of whether one compound selector matches one candidate element: the browser reads the selector from its rightmost compound and walks the document upward from the candidate through its ancestors, one compound and one ancestor at a time, advancing the selector only on a hit until the leftmost compound is found or the root is passed.',
    exemplarKeywords: [
      'right-to-left selector matching',
      'selector matching algorithm',
      'selector matching direction',
      'key selector',
      'rightmost compound selector',
      'compound selector',
      'descendant combinator',
      'ancestor chain walk',
      'css selector engine',
      'walking up the dom tree',
    ],
  },

  briefing: {
    observable: [
      'A caption above names, for the candidate currently being tested, exactly which compound of the selector is being compared against which document node, and whether that single comparison hit or missed.',
      'The read position inside the selector (a highlighted token) sits on the rightmost compound at the start and steps one compound to the left only when a comparison hits; the watched position inside the document tree steps one level up on every comparison, hit or miss.',
      'A dashed line always connects the current selector token to the current document node\'s ring, so the reader can see which two things are being compared right now.',
      'When the ancestor chain runs out before the selector\'s leftmost compound is found, the watched ring jumps to an empty slot above the document tree\'s root labeled "No parent," and the candidate is marked "No match" without a further comparison.',
      'Small chips accumulate beside every document node the algorithm has touched for the current candidate, each showing the compound it was tested against and a check or cross mark, so the whole trail of comparisons for a finished candidate stays visible.',
      'A running comparison count is kept per candidate and a total is kept for the whole selector.',
    ],

    screen: {
      affordances: [
        'Playback controls step through the comparisons one at a time or scrub back through ones already made; there is no auto-advancing play beyond the scrub strip.',
        'The selector sits fixed above the document tree for the whole piece — there is no control to change the selector or the document, only to move through the comparisons that already exist between them.',
      ],
    },

    useWhen: [
      'The article claims a css selector is read starting from its rightmost part rather than left to right, and that the browser walks the candidate element upward through its ancestors rather than scanning the whole document downward. The two moving positions — one in the selector, one in the tree — are what makes that direction visible instead of merely asserted.',
      'The reader needs to see why a miss on an ancestor does not eliminate the candidate but a miss at the compound the candidate itself must satisfy does: the screen only reaches a "no match" verdict outright at the candidate\'s own compound, and otherwise keeps climbing past ancestor misses.',
      'The article distinguishes testing a candidate against a document node ("comparison") from concluding that a candidate does or does not match ("verdict") — a step here only carries a verdict once the selector\'s leftmost compound is satisfied or the root has been passed.',
    ],

    avoidWhen: [
      'The article compares several rules against each other or needs a specificity number. Every candidate here is checked in isolation against one fixed selector, and no weight is ever computed.',
      'The subject is a combinator other than a descendant space, an attribute selector, or a pseudo-class, or the general performance cost of selector matching in a real engine. Only tag/class/id compounds joined by descendant combinators appear.',
      'The article is really about candidate filtering itself — how a browser first narrows down which elements are even worth testing by an index on the selector\'s rightmost part. This piece assumes that narrowing already happened and just single-steps the walk for each candidate it was given.',
    ],

    contrastWith: [
      {
        concept: 'cascadePriority',
        note: 'This isolates the direction of a single candidate\'s matching walk; the whole procedure also filters candidates up front and, once several are matched, weighs them against each other — none of which this piece shows.',
      },
      {
        concept: 'cascadeConflict',
        note: 'This piece never compares two rules to each other — every candidate here is checked against one fixed selector on its own, and reaching a match is exactly the step that has to happen before cascadeConflict\'s weighing can start.',
      },
    ],
  },
};
