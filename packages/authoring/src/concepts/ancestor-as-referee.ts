/**
 * ancestorAsReferee 개념 선언.
 *
 * canonical facet 은 `facet:ancestorAsReferee` — ours 와 theirs 두 파일만 견주면 다른 자리 셋이 "?" 로 남는다.
 * 조상(ancestor) 다섯 줄이 들어오고, 자리마다 조상과 같은 쪽이 손대지 않은 쪽으로 판정된다 — 자리 1 은 우리 쪽이 바꿈,
 * 자리 2 는 그쪽이 지움, 자리 3 은 그쪽이 넣음. 끝 "Ours changed: 1 · Theirs changed: 2 · Undecided: 0".
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 `threeWayMerge`(완제품)는 충돌의 경계를 손잡이로 몰아 보고, `oneSideChanged` 는 판정이 주어진 뒤 결과
 * 파일을 채우며, `bothTouchedSameLine` 은 판정이 서지 않는 자리에서 멈춘다. 이쪽은 **판정이 서는 순간** 하나다 —
 * 두 쪽만으로는 "우리가 넣었다" 도 "그쪽이 지웠다" 도 되던 자리가 조상 한 벌로 갈린다. 결과 파일은 없다.
 * 그래서 definition 은 two copies alone · cannot tell who changed · common ancestor · matches the ancestor 를 쥐고,
 * chunk · conflict · merged file 을 쓰지 않는다.
 *
 * 전제: 조상은 파일 한 벌로 주어진다 — 커밋 그래프에서 그것을 찾는 일은 다루지 않는다. 줄은 글자 그대로 견준다.
 * 자리 나누기는 git 병합을 단순화한 diff3 이다. 파일 줄은 가상 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const ancestorAsRefereeConcept: FacetConceptSource = {
  id: 'ancestorAsReferee',
  label: 'Common Ancestor Tells Who Changed a Line',
  canonicalFacet: 'facet:ancestorAsReferee',

  surface: {
    definition:
      'Comparing two edited copies alone cannot tell which side changed a differing line; their common ancestor decides it, since the copy still matching the ancestor left that line alone and the other copy made the change.',
    exemplarKeywords: [
      'why three-way merge needs a base',
      'two-way merge vs three-way merge',
      'common ancestor version',
      'merge base file',
      'was it added or deleted',
      'who changed this line',
      'BASE LOCAL REMOTE',
      'diff against the ancestor',
    ],
  },

  briefing: {
    observable: [
      'Two five-line files, ours and theirs, start side by side: "Ours and theirs: one file, edited apart."',
      'Comparing only the two marks three differing spots with "?": ours `let h = 5` against theirs `let h = 2`, ours `show w` with nothing opposite, and theirs `show h` with nothing opposite. The caption reads "differing spots: 3. Who changed each: unknown." with counters Ours changed 0 · Theirs changed 0 · Undecided 3.',
      'Then "The common ancestor comes in: the file before the split." — a third file, ancestor, with `let w = 4`, `let h = 2`, `let area = w * h`, `show w`, `show area`.',
      'Each spot is decided in turn by an `=` link to the side that matches the ancestor: "Spot 1 of 3: the ancestor matches theirs, so ours changed it — changed."; spot 2, where the ancestor has `show w`, is theirs deleting it; spot 3, where the ancestor has nothing, is theirs adding `show h`.',
      'The run ends with Ours changed 1 · Theirs changed 2 · Undecided 0, six steps counting the start. No merged file is produced; the screen only assigns each change to a side.',
      'The ancestor is given as a file; finding it in a commit history is not part of the screen. Lines are compared as exact text, and the file lines are in a small language-neutral notation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself: the two-way comparison, the arrival of the ancestor, then one verdict per step, and stops.',
        'A Replay button and a playback strip sit below. Dragging the strip back to the second step holds all three spots at "?" just before the ancestor arrives.',
        'The three files are fixed, so every spot, verdict and counter can be quoted as shown.',
      ],
    },

    useWhen: [
      'The article must explain why a merge needs the base version at all, and wants a moment where a line present on one side and missing on the other is truly ambiguous until the ancestor is consulted.',
      'A reader asks how a merge tool knows whether a line was added by one person or deleted by the other; the two opposite verdicts at spots 2 and 3 answer exactly that.',
    ],

    avoidWhen: [
      'The article is about conflicts. No spot here was changed by both sides.',
      'The subject is locating the merge base in a commit graph. The ancestor is simply handed in as a file.',
      'The reader needs to see the merged output. The screen ends at the verdicts.',
    ],

    contrastWith: [
      {
        concept: 'threeWayMerge',
        note: 'Deciding who changed each line is the first ingredient of a merge; the merge as a whole turns on what happens when changes from both sides sit close together.',
      },
      {
        concept: 'oneSideChanged',
        note: 'This settles which side changed a region; taking that side\'s lines into the merged file is the step that follows once the verdict is known.',
      },
      {
        concept: 'whereTheyParted',
        note: 'Finding where two branches split is a question about commit history. Using that split point as a referee is a question about lines of a file, and assumes the ancestor has already been found.',
      },
    ],
  },
};
