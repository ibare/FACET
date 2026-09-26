/**
 * unreachableSnapshot 개념 선언.
 *
 * canonical facet 은 `facet:unreachableSnapshot` — 커밋 일곱(A ← B ← C ← D · B ← E ← F · E ← G)과 이름 셋
 * (main → D · exp → F · fix → G). 이름 exp 를 지우고, main 을 D 에서 C 로 되돌린다 — 두 걸음 모두 커밋은 일곱.
 * 치우기 때 남은 이름 main · fix 에서 거슬러 가며 표시 다섯(C B A · G E, B 에서 멈춤)을 붙이고, 표시 없는 D · F 를
 * 한 번에 치운다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 한 질문 — "브랜치를 지우면 커밋도 지워지는가". 한 동사 — **이름에서 번지는 표시, 표시 없이 사라지는 커밋**.
 * 요점은 이름이 떠나는 걸음에는 아무것도 사라지지 않는다는 것이다. 같은 묶음의 `whereTheyParted` 도 표시가
 * 번지지만 목적이 겹치는 곳이고, 여기는 남는 것이다. 그래서 definition 은 deleting or moving a branch name ·
 * garbage collection · reachable from any remaining name · discarded 를 쥐고, common ancestor · two tips 를
 * 쓰지 않는다.
 *
 * 전제 (설명 글 `unreachableSnapshot.md`): reflog 유예(기본 90 일 · 닿지 않는 항목 30 일)와 gc prune 의 2 주 유예를
 * 모두 지났다고 둔다. 표시의 출발점은 브랜치 이름뿐(git 은 태그 · 원격 추적 이름 · HEAD · reflog · 인덱스도).
 * 병합 커밋 없음. 이름 차례 main → fix.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const unreachableSnapshotConcept: FacetConceptSource = {
  id: 'unreachableSnapshot',
  label: 'Git Cleanup Removes Only Unreachable Commits',
  canonicalFacet: 'facet:unreachableSnapshot',

  surface: {
    definition:
      'Deleting or moving a git branch name removes no commits; cleanup later marks every commit reachable from the remaining names and discards only the commits that none of them reach.',
    exemplarKeywords: [
      'git gc',
      'git prune',
      'dangling commit',
      'unreachable objects',
      'does deleting a branch delete its commits',
      'git branch -D',
      'git reset --hard lost commits',
      'recover a deleted branch',
      'orphaned commits',
    ],
  },

  briefing: {
    observable: [
      'Seven commits A to G and three names: main on D, exp on F, fix on G. E sits on the line that exp and fix share. "Names point at commits. Commits: 7".',
      '"Deleted name exp. Commits: 7" — the exp tag disappears and F stays on screen. "Moved main back: D → C. Commits: 7" — D is left without a tag and also stays.',
      'Cleanup walks back from each remaining name, one mark per step: "Cleanup: walking back from main. Marked: C", then B, then A. From fix: G, then E — "Next parent B is already marked. This path stops."',
      '"Swept the unmarked: D F. Commits: 5 · Marked: 5 · Swept: 2". E survives although it was on exp\'s line, because fix reaches it. Nine steps in all, counting the opening one.',
      'The model skips every grace period: real git keeps name-less commits alive through the reflog (entries expire after 90 days by default, 30 for unreachable ones) and `git gc` prune also spares loose objects younger than two weeks. Marking starts from branch names only, where git also starts from tags, remote-tracking names, HEAD, the reflog and the index. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the two name changes and the cleanup by itself and stops after the sweep.',
        'A Replay button and a playback strip sit below it. Dragging the strip to the "Moved main back" step holds the moment D and F have no name yet are still there with seven commits counted.',
        'The commits and names are fixed, so an article can quote the marking order and the counts 7 and 5 exactly.',
      ],
    },

    useWhen: [
      'The reader fears that deleting a branch or running `git reset --hard` destroys commits on the spot, and the article needs to show the commit count unchanged until cleanup runs.',
      'The article explains what `git gc` actually removes and why a commit on a deleted branch can survive because another name still reaches it.',
    ],

    avoidWhen: [
      'The article is a step-by-step recovery guide using `git reflog`. The reflog is not on screen; the model treats its grace period as already expired.',
      'The topic is garbage collection in a programming language runtime. The same mark-and-sweep shape appears, but the objects here are commits and the roots are branch names.',
      'The subject is rewriting history with rebase or amend. Names here are only deleted or moved back.',
    ],

    contrastWith: [
      {
        concept: 'gcReachableFromRoot',
        note: 'Both keep exactly what can be reached from a set of roots. In a runtime the roots are variables and the stack; in a repository they are branch names, and deleting a name is the usual way a commit stops being reachable.',
      },
      {
        concept: 'branchIsALabel',
        note: 'That a branch is only a name is the premise; this follows it one step further to when the commits a name used to reach are actually gone.',
      },
      {
        concept: 'whereTheyParted',
        note: 'Both spread marks backward through parents. Finding a common ancestor stops where marks from two tips first meet; cleanup marks everything any name reaches and removes the rest.',
      },
    ],
  },
};
