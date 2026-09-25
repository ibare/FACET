/**
 * multiwayBranch 개념 선언.
 *
 * canonical facet 은 `facet:multiwayBranch` — 점수 74 로 성적을 매기는 다섯 갈래 사슬.
 * 구슬이 조건 머리줄마다 선 문짝에 멈추고, 거짓이면 문짝이 열려 다음 조건으로 떨어지며,
 * `74 >= 70` 에서 옆문으로 빠져나간다. L9 `else if score >= 60` 은 참일 수 있는데도 묻지 않는다.
 * 코드는 어느 한 언어도 아닌 표기(`tasks/pseudo-notation.md`)다 — `else if` 는 두 낱말.
 *
 * ── 묶음 안에서의 자리
 *
 * `branchTakeOnePath` 는 가지 않은 쪽이 무엇도 하지 않음을, 이쪽은 조건들 사이의 **차례**를
 * 말한다. 기존 `conditionalStatement` 도 "first true wins" 를 담고 있어 가장 붙기 쉽다. 그래서
 * definition 을 겹치는 범위(좁은 조건을 위에 둔다)와 "아래 조건은 셈조차 되지 않는다" 쪽으로
 * 몰고, 합류 · 한쪽만 · 대입이 일어나지 않음 같은 말은 쓰지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const multiwayBranchConcept: FacetConceptSource = {
  id: 'multiwayBranch',
  label: 'Multiway Branch (else-if Chain Asked Top Down)',
  canonicalFacet: 'facet:multiwayBranch',

  surface: {
    definition:
      'An else-if chain tests its conditions downward one at a time and exits at the first true one, so with overlapping ranges the earlier test wins and later tests are never evaluated.',
    exemplarKeywords: [
      'else if',
      'elif',
      'else if ladder',
      'if-elif-else chain',
      'grading with score thresholds',
      'overlapping conditions',
      'order of else-if conditions matters',
      'put the narrow condition first',
      'fall through to the next condition',
      'conditions below are not checked',
    ],
  },

  briefing: {
    observable: [
      'Two `let` lines declare `score = 74` and `grade = ""`, then a five-way chain grades the score: `>= 90` → A, `>= 80` → B, `>= 70` → C, `>= 60` → D, else → F. The outer lines stand on the left, each branch body on the right.',
      'The flow is a marble falling down a track beside the chain, stopping at a door on every condition line.',
      'At `74 >= 90` and `74 >= 80` the tag reads false, the door swings down and the marble drops to the next condition.',
      'At `74 >= 70` the tag reads true; the door stays shut and the marble rolls out through a side door into `grade = "C"`.',
      'Leaving the body, the marble rides a rail on the right down to `show grade`, passing line 9, `else if score >= 60`, which is marked "not asked" even though 74 would satisfy it.',
      'The last caption reads "Conditions asked: 3 of 4. Passed without asking: 1." and the output is `C`. The run is eight steps after the start.',
      'The code is written in a small language-neutral notation — `let`, `if` / `else if` / `else`, `show`, indentation for bodies — rather than in any one real language. The score is fixed at 74.',
    ],

    screen: {
      affordances: [
        'The screen plays the chain by itself and stops on the shown grade.',
        'A Replay button and a playback strip sit below it. After the run, dragging the strip back to the `74 >= 70` step holds the marble at the side door with the door below still unopened.',
        'The score and the thresholds are fixed and never shuffled, since the point depends on 74 satisfying two conditions at once.',
      ],
    },

    useWhen: [
      'The article explains why the thresholds in a grading or pricing chain must go from strictest to loosest. Seeing `>= 60` marked "not asked" although it holds shows that position, not truth, decided the outcome.',
      'The reader assumes a chain checks every condition and picks the best match; the count of three asked out of four corrects that.',
    ],

    avoidWhen: [
      'The article is about `switch` or `match`, which jump by value rather than asking conditions down a list.',
      'The chain has only one test. The ordering claim needs at least two conditions that can both hold.',
      'The subject is short-circuit evaluation inside one boolean expression (`and` / `or`). Each test here is a single comparison.',
    ],

    contrastWith: [
      {
        concept: 'conditionalStatement',
        note: 'The conditional is the whole construct and how its outcome shifts with the input; this narrows to the ordering rule alone, where overlapping tests make position the deciding factor.',
      },
      {
        concept: 'branchTakeOnePath',
        note: 'That claim is about the side not chosen doing nothing; this one is about how the choice is reached when several tests line up, and why the ones below the winner go unasked.',
      },
    ],
  },
};
