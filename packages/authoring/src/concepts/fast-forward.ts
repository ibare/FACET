/**
 * fastForward 개념 선언.
 *
 * canonical facet 은 `facet:fastForward` — 한 줄기 A ← B ← C ← D ← E, main → B · feature → E · HEAD → main.
 * feature 를 main 에 합친다. 판정(E 에서 거슬러 B 를 만나 merge base 가 B 자신) · 건너감(main 이름표가 B 에서 E 로
 * 한 번에, 지나간 C D E 칠해짐) · 셈(새 커밋 0 · 옮긴 이름 1 · 커밋 5 → 5 · 새로 닿는 커밋 3). 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 한 질문 — "합칠 것이 앞서 있기만 할 때 병합은 무엇을 만드는가". 한 동사 — **여러 칸 건너가는 이름표**. 조상 판정은
 * 한 걸음의 결과로만 보인다(한 커밋씩 내려가는 것은 `whereTheyParted` 의 말). `branchIsALabel` 의 이름표는 새 커밋이
 * 생겨 한 칸이다. 그래서 definition 은 ancestor · no new commit · several commits in one move 를 쥐고,
 * walking back step by step · HEAD attached · hash 를 쓰지 않는다.
 *
 * 전제 (설명 글 `fastForward.md`): 거슬러 가기는 첫 부모만(병합 커밋 없음). 커밋은 글자, 해시 없음.
 * git merge 는 기본으로 빨리 감기, `--no-ff` 는 병합 커밋을 만들고 `--ff-only` 는 빨리 감기가 안 되면 거절한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fastForwardConcept: FacetConceptSource = {
  id: 'fastForward',
  label: 'Fast-Forward Merge',
  canonicalFacet: 'facet:fastForward',

  surface: {
    definition:
      'When the receiving branch tip is an ancestor of the branch being merged, there is nothing to combine: the merge creates no commit and simply advances the name several commits forward in one move.',
    exemplarKeywords: [
      'fast-forward merge',
      'git merge --ff-only',
      'git merge --no-ff',
      'no merge commit created',
      'Fast-forward in git output',
      'branch is ahead, not diverged',
      'not possible to fast-forward',
      'git pull fast-forward',
    ],
  },

  briefing: {
    observable: [
      'Five commits A · B · C · D · E in one line, each pointing to the one before. Tags: main → B, feature → E, HEAD → main. "Commits: 5".',
      'The judging step draws the path back from feature in one go — "Back from feature: E D C B · On the path: the commit of main — merge base: B". main is an ancestor of feature and the merge base is main\'s own commit.',
      'The jump: "main: B → E, in one move · Commits passed over: C D E". The main tag leaves B and lands on E without stopping, HEAD riding along; C, D and E are coloured as they become reachable from main.',
      'The tally: "New commits: 0 · Names moved: 1 · Commits: 5 → 5 · Newly reachable from main: 3". Four steps in all, counting the opening one.',
      'Walking back follows first parents only; the data has no merge commits. Commits are called by letters and no hashes are shown. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the judgement, the jump and the tally by itself and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip between the judging step and the jump shows the main tag on B and then on E with the commit count unchanged.',
        'The history is fixed, so an article can quote the captions and the counts 0, 1, 5 → 5 and 3 exactly.',
      ],
    },

    useWhen: [
      'The reader ran a merge and saw "Fast-forward" with no merge commit in the log, and the article needs to show that nothing was combined because main had not moved since the branch started.',
      'The article explains `--ff-only` or `--no-ff` and needs the case where a merge can be done by moving a name alone.',
    ],

    avoidWhen: [
      'Both branches have new commits since they split. That case needs a real merge commit, which never appears here.',
      'The topic is how the merge base is found step by step. The path back is drawn as one result here.',
      'The article is about conflicts or combining file contents. No file contents are shown.',
    ],

    contrastWith: [
      {
        concept: 'branchIsALabel',
        note: 'A name advancing by one because a commit was made on it is ordinary committing; advancing by several with no commit at all is what a merge reduces to when one side is an ancestor of the other.',
      },
      {
        concept: 'whereTheyParted',
        note: 'Finding where two branches split is the general question; a fast-forward is the special answer where the split point is the receiving branch tip itself.',
      },
      {
        concept: 'rebaseVsMerge',
        note: 'A fast-forward happens when there is nothing to join. Choosing between a merge commit and rewritten commits only arises once both sides have moved.',
      },
    ],
  },
};
