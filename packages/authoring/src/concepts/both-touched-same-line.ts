/**
 * bothTouchedSameLine 개념 선언.
 *
 * canonical facet 은 `facet:bothTouchedSameLine` — base 다섯 줄. ours 는 1 · 4 줄을, theirs 는 4 줄을 고쳤다.
 * 두 쪽이 손댄 base 줄이 차례로 표시되고 4 줄에서 겹친다. 겹친 줄은 세 판이 모두 달라 고를 쪽이 없고, 결과는
 * 그 자리에 두 쪽을 충돌 표식 사이에 넣은 채 한 번에 선다 — 결과 9 줄 · 충돌 1 · "stopped at line 4".
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 `threeWayMerge`(완제품)는 붙어 있는 줄까지 충돌하는 **경계**를 손잡이로 몰아 본다. 이쪽은 가장 좁은 경우 —
 * **같은 한 줄**을 둘이 다르게 고친 자리 — 하나와, 거기서 병합이 스스로 고르지 않고 두 판을 표식 사이에 넣은 채 멈춘다는 것.
 * `oneSideChanged` 는 결과를 한 줄씩 채우지만 이쪽은 겹침이 주인공이고 결과는 한 번에 선다. 그래서 definition 은
 * same line · different ways · both versions · conflict markers · stops 를 쥐고, adjacent · unchanged line between ·
 * takes the edited side 를 쓰지 않는다.
 *
 * 전제: 표식 꼴은 git 의 기본 merge 꼴이고 표식 뒤 `ours` · `theirs` 는 git 에서 브랜치 이름이다. 조상 줄을 함께 적는
 * diff3 꼴(`|||||||`)은 쓰지 않는다. 충돌을 푸는 일은 다루지 않는다. 파일 줄은 가상 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bothTouchedSameLineConcept: FacetConceptSource = {
  id: 'bothTouchedSameLine',
  label: 'Merge Conflict: Both Sides Changed the Same Line',
  canonicalFacet: 'facet:bothTouchedSameLine',

  surface: {
    definition:
      'When both sides change the same ancestor line in different ways, a merge has no version to pick, so it writes both into the file between conflict markers and stops for a person to decide.',
    exemplarKeywords: [
      'merge conflict',
      'conflict markers',
      '<<<<<<< ======= >>>>>>>',
      'CONFLICT (content): Merge conflict in',
      'both modified',
      'same line edited in two branches',
      'why git cannot merge automatically',
      'git status unmerged paths',
    ],
  },

  briefing: {
    observable: [
      'Three five-line files stand side by side — ours, base and theirs: "One base, two edited copies." Ours changed line 1 to `let limit = 20` and line 4 to `    return n * step`; theirs changed line 4 to `    return n - step`.',
      'The base lines each side touched are marked in turn: "Base lines ours touched: 1 · 4", then "Base lines theirs touched: 4".',
      'The two marks overlap on one line: "Base lines touched by both: 4 · different versions: 3" — base `return n + step`, ours `return n * step`, theirs `return n - step`, all different.',
      'The merged file appears in one step, nine lines: ours\' `let limit = 20` taken as is, then at line 4 `<<<<<<< ours`, `    return n * step`, `=======`, `    return n - step`, `>>>>>>> theirs`, then `show next(1)`. A "stopped" tag and "Result lines: 9 · conflicts: 1 · stopped at line 4" close the run, five steps counting the start.',
      'The markers are git\'s default style; in git the names after them are branch names, and the diff3 style that also shows the ancestor line is not used. How the conflict gets resolved is not shown. File lines are in a small language-neutral notation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself and stops on the merged file with its conflict markers.',
        'A Replay button and a playback strip sit below. Dragging the strip to the overlap step holds the single line both sides touched, with its three different versions.',
        'The files and the result are fixed, so the marker block can be quoted line for line.',
      ],
    },

    useWhen: [
      'The article introduces merge conflicts and needs the plainest case: one line, changed two different ways, and the file that git leaves behind with both versions inside markers.',
      'A reader opening a conflicted file wonders what `<<<<<<<`, `=======` and `>>>>>>>` enclose; this shows exactly which side\'s text sits in each half and that the rest of the file merged normally.',
    ],

    avoidWhen: [
      'The article is about conflicts between changes on different but neighbouring lines. The two changes here share one line.',
      'The subject is resolving conflicts, merge tools or ours/theirs strategies. The screen ends where the merge stops.',
      'The article uses the diff3 conflict style with the ancestor shown between `|||||||` and `=======`. Only the two-part style appears.',
    ],

    contrastWith: [
      {
        concept: 'threeWayMerge',
        note: 'Two different edits to the same line are the narrowest cause of a conflict. The general rule is wider: edits with no untouched line between them conflict even when they share no line.',
      },
      {
        concept: 'oneSideChanged',
        note: 'Where one side changed a region, the merge takes it; where both changed it differently, there is nothing to take, and the merge stops rather than guessing.',
      },
      {
        concept: 'ancestorAsReferee',
        note: 'The ancestor settles who changed a line when only one side did. When both changed it, the ancestor matches neither and can no longer settle anything.',
      },
    ],
  },
};
