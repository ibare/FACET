/**
 * pickOneOut 개념 선언.
 *
 * canonical facet 은 `facet:pickOneOut` — 파일 하나를 두고 커밋 다섯: 바탕 B, main 의 M(`let port = 80` 넣음),
 * feature 의 X(`let retry = 3`) · Y(`let timeout = 10` → `let timeout = 30`) · Z(`show name`). HEAD 는 main.
 * Y 하나만 가져온다 — Y 를 부모 X 와 줄 단위로 견줘 바뀐 한 뭉치(지운 줄 1 · 넣은 줄 1)만 떼어 main 의 파일로 옮겨
 * 얹고, 새 커밋 Y'(부모 M)를 만들어 main 을 옮긴다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 한 질문 — "커밋 하나만 가져오면 무엇이 오는가". 한 동사 — **줄 한 뭉치가 떼어져 다른 파일로 건너가 얹힌다**.
 * 해시는 보이지 않는다. `replayOnNewBase` 는 복제된 커밋이 얻는 새 해시를 쥔다. 그래서 definition 은 cherry-pick ·
 * lines it changed against its parent · not the whole snapshot · earlier and later commits stay behind 를 쥐고,
 * hash · new parent 를 쓰지 않는다.
 *
 * 전제 (설명 글 `pickOneOut.md`): 충돌 없는 얹기 — 지울 줄이 대상 파일에 글자 그대로 딱 한 번 있어야 얹힌다
 * (git 은 3-way 병합으로 자리를 찾고 맞지 않으면 충돌로 멈춘다). 줄 차이는 LCS(git 기본 Myers 와 이 데이터에서 같다).
 * 파일 줄은 어느 언어도 아닌 가상 표기. 커밋은 글자로만.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pickOneOutConcept: FacetConceptSource = {
  id: 'pickOneOut',
  label: 'Cherry-Pick Carries a Change, Not a Snapshot',
  canonicalFacet: 'facet:pickOneOut',

  surface: {
    definition:
      'Cherry-picking a commit applies only the lines it changed against its parent to the current branch file, not its whole snapshot, so lines added by earlier or later commits on that branch do not come along.',
    exemplarKeywords: [
      'git cherry-pick',
      'cherry-pick a single commit',
      'backport a fix to a release branch',
      'hotfix onto main',
      'commit as a patch',
      'diff against the parent',
      'snapshot vs changeset',
      'apply one change from another branch',
    ],
  },

  briefing: {
    observable: [
      'A small history on top — B, M on main, X · Y · Z on feature, HEAD on main — and two files below: "File of Y" (`let name = "app"`, `let retry = 3`, `let timeout = 30`) and "File on main" (`let name = "app"`, `let timeout = 10`, `let port = 80`). "Picked: Y · Lines on main: 3".',
      'The diff step compares Y with its parent X — "Change of Y against X": the shared lines `let name = "app"` and `let retry = 3` fade, and one changed block −`let timeout = 10` +`let timeout = 30` is outlined. "Changed block · Removed: 1 · Added: 1".',
      'The landing step: only that block crosses to main\'s file, finds the identical line `let timeout = 10` and replaces it. The file on main becomes `let name = "app"` / `let timeout = 30` / `let port = 80` — "Landed on main · Moved: −1 +1 · Lines in file: 3". The block stays behind as a dotted outline, since Y itself is unchanged.',
      '"New commit Y\' · Parent: M · main → Y\'". The final file on main has no `let retry = 3` (from X) and no `show name` (from Z), and keeps `let port = 80`. Four steps in all, counting the opening one.',
      'File lines are written in a language-neutral notation, not any real language. The block lands only if the removed line appears in the target file exactly once, character for character; real git locates it with a three-way merge using surrounding context and stops on a conflict when it cannot. The diff is computed as a longest common subsequence of lines, which matches git\'s default Myers diff on this data. Commits are called by letters and no hashes are shown. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the diff, the landing and the new commit by itself and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip to the diff step holds the one outlined block beside the faded lines that will not travel.',
        'The files and commits are fixed, so an article can quote every line before and after exactly.',
      ],
    },

    useWhen: [
      'The reader expects cherry-picking a commit to bring that commit\'s whole file, and the article needs the final file on main that lacks the line added one commit earlier and keeps its own line.',
      'The article is about backporting a single fix and needs to show that the fix travels as a change against its parent, independent of what surrounds it on the source branch.',
    ],

    avoidWhen: [
      'The topic is cherry-pick conflicts or how git resolves a change that does not apply. The block here lands cleanly.',
      'The article is about the new commit\'s hash or identity after copying. No hashes are shown.',
      'The subject is picking a range of commits or a merge commit. Exactly one ordinary commit is picked.',
    ],

    contrastWith: [
      {
        concept: 'replayOnNewBase',
        note: 'Copying a commit carries its change and gives the copy a new parent. Which lines come along is this claim; that the copy is therefore a different commit with a new hash is that one.',
      },
      {
        concept: 'threeWayMerge',
        note: 'A real cherry-pick is carried out as a three-way merge with the picked commit\'s parent as the base. The point here is narrower: what is carried is a difference, not a file.',
      },
      {
        concept: 'snapshotPointsBack',
        note: 'A commit records a full snapshot plus its parent. Carrying one commit elsewhere therefore means computing its difference from that parent first.',
      },
    ],
  },
};
