/**
 * branchIsALabel 개념 선언.
 *
 * canonical facet 은 `facet:branchIsALabel` — `A ← B ← C` 에 `main` → C · HEAD → main 으로 시작해, 이름 feature 를
 * 만들고 · HEAD 를 옮기고 · 커밋 D 를 하고 · HEAD 를 되돌리고 · 커밋 E 를 한다. 커밋 수는 3 · 3 · 3 · 4 · 4 · 5.
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 한 질문 — "브랜치를 만들고 커밋하면 커밋이 가지에 담기는가, 이름이 옮겨 붙는가". 한 동사 — **떼어져 옮겨 붙는다**.
 * 해시는 없다. 같은 묶음의 `fastForward` 도 이름표가 옮기지만 커밋 없이 여러 칸이고, 여기서는 새 커밋이 생겨 한 칸,
 * 그것도 HEAD 가 가리키는 이름 하나만이다. 그래서 definition 은 name · HEAD · no commits copied ·
 * only the checked-out name moves 를 쥐고, ancestor · several commits at once · hash 를 쓰지 않는다.
 *
 * 전제 (설명 글 `branchIsALabel.md`): 커밋은 해시 대신 글자. 병합 커밋 없음. detached HEAD 는 다루지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const branchIsALabelConcept: FacetConceptSource = {
  id: 'branchIsALabel',
  label: 'A Branch Is a Movable Name',
  canonicalFacet: 'facet:branchIsALabel',

  surface: {
    definition:
      'A git branch is a movable name pointing at one commit, not a container of commits: creating a branch copies nothing, and a new commit moves only the name HEAD is attached to.',
    exemplarKeywords: [
      'what is a git branch',
      'branches are cheap',
      'git branch and git switch',
      'git checkout -b',
      'HEAD points to a branch',
      'branch pointer',
      'refs/heads',
      'which branch does a commit belong to',
      'creating a branch does not copy files',
    ],
  },

  briefing: {
    observable: [
      'Three commits A, B, C in a row with arrows pointing back to parents. "Start: main → C, HEAD → main · Commits: 3". The names `main` and `HEAD` are tags attached to C.',
      '"New name feature → C · Commits: 3" — a second tag lands on the same commit and the commit count stays at 3. Then "HEAD: main → feature": only the HEAD tag changes place.',
      '"New commit D, parent C · feature: C → D · Commits: 4" — the feature tag moves up to D while main stays on C.',
      '"HEAD: feature → main", then "New commit E, parent C · main: C → E · Commits: 5" — this time main moves to E and feature stays on D. Six steps in all, counting the opening one.',
      'The end shows two names and five commits. A, B and C are reachable from both names; which commits "belong" to a branch is only which ones can be reached from its name by following parents.',
      'Commits are called by letters rather than hashes. There are no merge commits, and HEAD always points at a name — detached HEAD is not covered. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the five actions by itself and stops after commit E.',
        'A Replay button and a playback strip sit below it. Dragging the strip back to the "New name feature" step holds the moment a branch exists while the commit count is still 3.',
        'The commits and names are fixed, so an article can quote every caption and count as it appears.',
      ],
    },

    useWhen: [
      'The reader pictures a branch as a folder holding its own copy of commits, and the article needs to show that making a branch adds only a name while the commit count stays at 3.',
      'The article explains why committing on one branch leaves the other where it was, and needs the rule that only the name HEAD is attached to moves.',
    ],

    avoidWhen: [
      'The subject is merging two branches or joining their work. Nothing is joined here; the branches only diverge.',
      'The article is about detached HEAD, tags or remote-tracking branches. HEAD here always sits on a local branch name.',
      'The topic is deleting a branch and what happens to its commits. No name is removed here.',
    ],

    contrastWith: [
      {
        concept: 'fastForward',
        note: 'A name moving one commit because a commit was just made on it is ordinary committing. A name jumping several commits with no commit made is what a merge does when there is nothing to combine.',
      },
      {
        concept: 'unreachableSnapshot',
        note: 'Since a branch is only a name, removing it cannot remove commits; that consequence is about what survives cleanup, while this is about what a branch is and what moves on commit.',
      },
      {
        concept: 'snapshotPointsBack',
        note: 'Parent links are written into commits and never change. Branch names are the only part of the graph that moves as work continues.',
      },
    ],
  },
};
