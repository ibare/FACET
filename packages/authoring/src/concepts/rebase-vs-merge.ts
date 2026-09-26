/**
 * rebaseVsMerge 개념 선언.
 *
 * canonical facet 은 `facet:rebaseVsMerge` — B 에서 갈라진 feature(X · Y)를 main 에 들이는 두 길을
 * 한 판에 세운다. 손잡이 "How to join"(병합 · 리베이스 뒤 병합, 처음은 리베이스 뒤 병합)과
 * "New commits on main"(0 · 1 · 2, 처음 1)을 돌리면 계기 다섯(새 커밋 · 병합 커밋 · 해시가 바뀐 복제 ·
 * 이름 없이 남은 옛 커밋 · main 이름표가 건넌 칸)이 갈린다. 코드 패널은 없다(IR 을 두지 않았다).
 *
 * ── 묶음 안에서의 자리 (완제품 둘 + 조각 여덟, history-graph)
 *
 * 조각 일곱이 각각 한 장면이다 — 부모 해시를 품기(`snapshotPointsBack`) · 이름표(`branchIsALabel`) ·
 * 닿지 않는 커밋 치우기(`unreachableSnapshot`) · 빨리 감기(`fastForward`) · 갈라진 자리 찾기
 * (`whereTheyParted`) · 새 바닥 위 다시 만들기(`replayOnNewBase`) · 한 커밋의 줄만 가져오기(`pickOneOut`).
 * 이쪽은 그 장면들을 한 판에 잇고 **두 길을 견주는 것**을 맡는다. 그래서 definition 은
 * merge commit · two parents · rewrites · same files · history differs · how far main moved 를 쥐고,
 * 조각들이 독점한 낱말(records parent hash · movable name · garbage collection · ancestor 판정 ·
 * walking back · lines changed)을 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `rebaseVsMerge.md` 가 밝힌 것):
 *  - 장난감 해시: 변경 식별자와 부모 해시만 FNV-1a 32 비트로 셈한 앞 일곱 자리. git 은 SHA-1(또는 SHA-256)에
 *    트리 · 저자 · 시각 · 메시지까지 넣지만 "부모가 바뀌면 해시가 바뀐다" 는 같다.
 *  - 고침은 늘 충돌 없이 얹힌다. 이름 없이 남은 커밋을 reflog 가 붙잡는 유예와 gc 는 그리지 않는다.
 *  - 병합 · m=0 은 git merge 의 기본(빨리 감기)을 따른다 — `--no-ff` 면 병합 커밋이 생긴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const rebaseVsMergeConcept: FacetConceptSource = {
  id: 'rebaseVsMerge',
  label: 'Merge vs Rebase (Same Files, Different History)',
  canonicalFacet: 'facet:rebaseVsMerge',

  surface: {
    definition:
      'Merging and rebasing a feature branch reach the same files but leave different history: a merge adds one two-parent commit and keeps every hash, a rebase rewrites the branch into new commits and linear history.',
    exemplarKeywords: [
      'git merge vs git rebase',
      'merge or rebase',
      'merge commit vs linear history',
      'rebase then merge workflow',
      'should I rebase before merging',
      'rebase rewrites history',
      'squash, rebase and merge strategies',
      'pull request merge strategy',
      'rebase changes commit hashes',
      'golden rule of rebasing',
    ],
  },

  briefing: {
    observable: [
      'A commit graph: A ("first commit") and B ("add login") at the root, feature\'s X ("add button") and Y ("fix color") branching from B, and main\'s new commits C ("add DB") and D ("add cache") depending on the handle. Each commit shows a seven-character hash under its letter; the labels `main` and `feature` sit on commits.',
      'The round opens with "Start · commits: 5" (at one new main commit) and then "Parted at B · main side: 1 · feature side: 2", with "to replay: X Y" on the rebase path. The parting point is always B here.',
      'Merge path: a commit M ("join feature") rises with two parents — "New commit M · parents: C, Y" — every older commit keeps its hash, and main moves up one onto M. M\'s hash is 560f75a with one new main commit and 41f6470 with two, because its first parent changed.',
      'Rebase path: "X → X\' · parent: B → C", then "Y → Y\' · parent: X → X\'". A small "Hash input" box shows `tree add-button` with the old `parent e3ad9ac` struck through and the new `parent ca78789` beneath; X\' gets 7c3d66c and Y\' b95abd3 (82eb697 and 07535eb with two new main commits).',
      'Then "feature: Y → Y\' · left without a name: X Y" — the old X and Y fade but stay where they are — and finally "main: C → Y\' · no new commit": main jumps two commits forward without a merge commit.',
      'Five readouts count each round from zero: New commits, Merge commits, Copies with a new hash, Old commits left unnamed, Steps the main label jumped. Merge gives 1 · 1 · 0 · 0 · 0; rebase then merge gives 2 · 0 · 2 · 2 · 2. With no new commits on main both paths give 0 · 0 · 0 · 0 · 2 — main simply jumps from B to Y.',
      'Hashes are a toy: FNV-1a 32-bit over the change name and parent hashes, first seven hex digits. Real git hashes tree, author, time and message with SHA-1 or SHA-256, but a changed parent changes the hash in both. Replays always apply cleanly, and unnamed commits are only counted — the reflog grace period and garbage collection are not shown. The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "How to join" (Merge / Rebase, then merge — starts on rebase) and "New commits on main" (0 / 1 / 2 — starts at 1). Each round plays to its end and waits for a handle.',
        'The move that makes the idea land is flipping "How to join" with main one commit ahead: the readouts swap from one merge commit and no rewritten hashes to two rewritten copies, two unnamed originals and a two-commit jump.',
        'Setting "New commits on main" to 0 makes both paths identical, since there is nothing to join or replay; moving from 1 to 2 changes only the parting distance and the new hash values.',
      ],
    },

    useWhen: [
      'A team is choosing a merge strategy for pull requests and the article needs the trade-off laid out in counts: a merge commit that keeps every original hash against a straight line of rewritten commits.',
      'The reader has been told "rebase rewrites history" and needs to see precisely what is rewritten and what survives, with the final files identical either way.',
    ],

    avoidWhen: [
      'The article is about resolving merge conflicts or conflict markers. Every change here applies cleanly on both paths.',
      'The subject is interactive rebase — squashing, reordering or editing commits. The replay here keeps both commits as they were, in order.',
      'The topic is recovering lost commits through the reflog or how long git keeps them. Unnamed commits are only counted here.',
    ],

    contrastWith: [
      {
        concept: 'replayOnNewBase',
        note: 'Why a replayed commit is a different commit is one mechanism: a new parent means a new hash. The comparison with merging asks what that costs and what the alternative keeps.',
      },
      {
        concept: 'fastForward',
        note: 'Advancing a name with no new commit is what both joins end in when main has not moved, and what rebasing then merging always ends in. Weighing merge against rebase is about the case where main has moved.',
      },
      {
        concept: 'whereTheyParted',
        note: 'Finding the common ancestor is the first step both ways of joining share; choosing between them starts after that point is known.',
      },
      {
        concept: 'unreachableSnapshot',
        note: 'Commits left without a name are one consequence of rebasing; whether and when they are deleted is a separate question about reachability and cleanup.',
      },
      {
        concept: 'threeWayMerge',
        note: 'Combining two versions of a file line by line against their ancestor decides the contents of a merge. Merge versus rebase is about the shape of the commit history once the contents are settled.',
      },
    ],
  },
};
