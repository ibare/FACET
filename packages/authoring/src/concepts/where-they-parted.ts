/**
 * whereTheyParted 개념 선언.
 *
 * canonical facet 은 `facet:whereTheyParted` — 커밋 아홉(시각 1~9): A ← B ← C ← D ← E(main) · C ← F ← G ← H ← I(feature).
 * 두 끝에 각자의 표시를 붙이고 줄에서 시각이 가장 늦은 커밋을 하나씩 꺼내 표시를 부모에게 넘긴다. I · H · G · E · F · D 를
 * 꺼낸 뒤 C 가 두 표시를 함께 가져 답이 난다 — main 에서 2, feature 에서 4, 꺼낸 커밋 7. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 한 질문 — "두 브랜치는 어디서 갈라졌는가". 한 동사 — **두 끝에서 내려오는 두 표시가 겹친다**. 이름표는 움직이지 않는다.
 * `fastForward` 는 조상 판정을 한 걸음의 결과로만 보이고, `unreachableSnapshot` 의 표시는 이름 여럿에서 번져 남는 것을
 * 가른다. 그래서 definition 은 merge base · both tips · latest first · first commit carrying both marks ·
 * nearest common ancestor 를 쥐고, name moves · discarded 를 쓰지 않는다.
 *
 * 전제 (설명 글 `whereTheyParted.md`): 부모가 하나인 커밋만. 시각은 정수 차례(git 은 커밋 그래프 파일이 있으면
 * 세대 번호를 먼저 본다). 처음 겹친 곳에서 멈춘다(git 은 후보를 더 걸러 낸다 — 이 데이터에서는 같다).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const whereTheyPartedConcept: FacetConceptSource = {
  id: 'whereTheyParted',
  label: 'Finding the Merge Base',
  canonicalFacet: 'facet:whereTheyParted',

  surface: {
    definition:
      'The merge base of two branches is found by walking back from both tips, always taking the latest commit next, until one commit carries marks from both; that nearest common ancestor is where they diverged.',
    exemplarKeywords: [
      'git merge-base',
      'merge base',
      'common ancestor of two branches',
      'lowest common ancestor in a commit graph',
      'where did my branch diverge',
      'fork point',
      'three-dot diff base',
      'commit date ordering',
    ],
  },

  briefing: {
    observable: [
      'Nine commits laid out along a time axis 1..9, later to the right: main\'s line A · B · C · D · E and feature\'s line F · G · H · I branching from C. "Each tip gets its own mark: main → E · feature → I". An "In line" box holds the commits waiting to be taken.',
      'Each step takes the latest commit in line, shown by a vertical dashed line at its time, and passes its mark to the parent: "Latest in line: I (time 9) — mark feature passes to H", then H, then G.',
      'Because the latest is always taken first, the walk switches sides: after G comes E ("mark main passes to D"), then F ("mark feature passes to C"), then D ("mark main passes to C"). The dashed line only ever moves left.',
      '"Latest in line: C (time 3) — it carries both marks · Split point: C · steps from main: 2 · from feature: 4 · commits taken: 7". A and B, also common ancestors, are never taken. Eight steps in all, counting the opening one.',
      'Every commit has one parent, times are small whole numbers with no ties, and the walk stops at the first commit holding both marks. Real git looks at generation numbers first when a commit-graph file exists, and keeps filtering candidates after the first meeting; with one-parent commits the answer is the same. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the walk by itself, one commit taken per step, and stops once C carries both marks.',
        'A Replay button and a playback strip sit below it. Dragging the strip across the steps after G shows the dashed time line crossing from the feature side to main and back.',
        'The history and times are fixed, so an article can quote the taking order I H G E F D C and the distances 2 and 4 exactly.',
      ],
    },

    useWhen: [
      'The article introduces `git merge-base` and needs to show how a common ancestor is found when commits know only their parents.',
      'The reader assumes the two branches are walked back the same number of steps, and the article needs the uneven distances 2 and 4 that come out of taking the latest commit first.',
    ],

    avoidWhen: [
      'The history has merge commits or several equally near common ancestors (criss-cross merges). Every commit here has one parent and there is one answer.',
      'The topic is what a merge or rebase does after the base is known. The walk ends at the base and nothing is joined.',
      'The article is about lowest common ancestor in rooted trees as an algorithm exercise with parent pointers and depths. The walk here is ordered by commit time.',
    ],

    contrastWith: [
      {
        concept: 'fastForward',
        note: 'Here the base is found and lies behind both tips. When it turns out to be one branch tip itself, joining needs no new commit at all.',
      },
      {
        concept: 'unreachableSnapshot',
        note: 'Both push marks backward through parents. Here marks come from two tips and the aim is the first commit they share; cleanup marks from every name and keeps whatever is marked.',
      },
      {
        concept: 'replayOnNewBase',
        note: 'The merge base decides which commits count as the branch\'s own; replaying those commits onto a new parent is the step that follows.',
      },
    ],
  },
};
