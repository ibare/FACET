/**
 * oneSideChanged 개념 선언.
 *
 * canonical facet 은 `facet:oneSideChanged` — base 여섯 줄에서 ours 는 2 · 6 줄을, theirs 는 4 줄을 고쳤다.
 * 병합 결과가 위에서부터 한 줄씩 채워진다: 아무도 안 고친 줄은 base 에서, 한쪽만 고친 줄은 고친 쪽에서.
 * 끝 "Merged lines: 6 · from base: 3 · from ours: 2 · from theirs: 1". 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 `ancestorAsReferee` 는 누가 고쳤는지 **알아내는** 장면이고, `bothTouchedSameLine` 은 고를 쪽이 없어
 * **멈추는** 장면이다. 이쪽은 판정이 이미 주어진 뒤 **옮겨 담는** 장면 — 결과가 한쪽의 사본이 아니라 세 쪽에서 온 줄이
 * 섞인 파일이라는 것. 그래서 definition 은 takes the edited side · untouched keep the ancestor · mixes lines from all
 * three · assembled 를 쥐고, who changed · cannot tell · conflict markers · unchanged line between 을 쓰지 않는다.
 *
 * 전제: 덩이와 판정은 git 병합을 단순화한 diff3 이다. 이 데이터의 덩이는 모두 한 줄이다. 파일 줄은 가상 표기다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const oneSideChangedConcept: FacetConceptSource = {
  id: 'oneSideChanged',
  label: 'Merge Takes the Side That Changed',
  canonicalFacet: 'facet:oneSideChanged',

  surface: {
    definition:
      'Where only one side edited a region, a merge takes that side\'s lines and keeps the base elsewhere, so the merged file mixes edits from both sides instead of copying either branch.',
    exemplarKeywords: [
      'automatic merge',
      'clean merge',
      'merge without conflicts',
      'non-conflicting changes combined',
      'merged file contains both changes',
      'git merge auto-merging',
      'take theirs where only they changed',
      'combining edits from two branches',
    ],
  },

  briefing: {
    observable: [
      'Three versions of one file stand side by side — ours, base and theirs, six lines each — beside an empty "merged" column: "Three versions of one file. The merged file is still empty."',
      'Ours changed line 2 to `let fee = 7` and line 6 to `show cost(4)`; theirs changed line 4 to `    let c = n + rate`.',
      'One line moves into the merged file per step, tagged with where it came from. Lines 1, 3 and 5: "nobody changed it. The base line moves in." Lines 2 and 6: "only ours changed it. The changed line moves in." Line 4: "only theirs changed it."',
      'The merged file ends as `let rate = 2`, `let fee = 7`, `function cost(n)`, `    let c = n + rate`, `    return c + fee`, `show cost(4)` — equal to neither ours nor theirs — with "Merged lines: 6 · from base: 3 · from ours: 2 · from theirs: 1". Seven steps counting the start.',
      'Each region here is a single line and every verdict is given as it arrives. The model is a simplified diff3, and the file lines are in a small language-neutral notation.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one line per step, and stops when the sixth line lands.',
        'A Replay button and a playback strip sit below. Stepping through shows the source tag switching between base, ours and theirs as the merged file grows.',
        'The files are fixed, so every line and its source can be quoted as shown.',
      ],
    },

    useWhen: [
      'The article explains what an automatic merge actually produces and needs to show a result that matches neither branch, carrying changes from both.',
      'A reader fears that merging will overwrite one person\'s work with the other\'s; watching base, ours and theirs each contribute lines to one file answers that.',
    ],

    avoidWhen: [
      'The article is about merge conflicts or conflict markers. Every line here has exactly one side to take.',
      'The subject is how the merge decides which side changed a line. Verdicts are given, not derived.',
      'The subject is merging commits or branch history. Only the lines of one file appear.',
    ],

    contrastWith: [
      {
        concept: 'ancestorAsReferee',
        note: 'Working out which side changed a line comes first; this takes that answer as given and is about the file that results from following it everywhere.',
      },
      {
        concept: 'bothTouchedSameLine',
        note: 'Both describe a merge region by region. Here each region has one side to take; there a region has no side to take, and the merge stops instead of choosing.',
      },
      {
        concept: 'threeWayMerge',
        note: 'Taking the changed side is the ordinary verdict. The broader claim concerns where that verdict stops being available, which happens even for edits on neighbouring lines.',
      },
    ],
  },
};
