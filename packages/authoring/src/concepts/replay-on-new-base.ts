/**
 * replayOnNewBase 개념 선언.
 *
 * canonical facet 은 `facet:replayOnNewBase` — A ← B ← C ← D(main) · B ← X ← Y(feature), 커밋마다 장난감 해시.
 * 다시 놓을 커밋을 고르고(feature 에서만 닿는 것, 오래된 것부터: X Y), X 를 D 위에 X' 로(8660ebd → 82eb697),
 * Y 를 X' 위에 Y' 로(6bd2bb2 → 07535eb) 다시 만든 뒤 feature 이름표를 Y' 로 옮긴다. 커밋 여덟, 새 커밋 둘,
 * 옛 해시와 같은 짝 0. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 한 질문 — "리베이스한 커밋은 왜 다른 커밋인가". 한 동사 — **새 부모 위에 새로 셈해진다**. 파일 줄은 보이지 않고,
 * 옛 커밋은 제자리에 남는다. `snapshotPointsBack` 은 부모 해시가 먼저 있어야 한다는 차례를, `pickOneOut` 은 무엇이
 * 건너오는가(줄 한 뭉치)를 쥔다. 그래서 definition 은 rebase · recreated not moved · new parent · every replayed
 * copy · originals stay 를 쥐고, lines · file · before its own hash is computed 를 쓰지 않는다.
 *
 * 전제 (설명 글 `replayOnNewBase.md`): 장난감 해시(변경 식별자 + 부모 해시, FNV-1a 32 비트 앞 일곱 자리). 고침은 늘
 * 깨끗이 얹힌다. 옛 커밋을 치우는 장면(reflog 유예 · gc)은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const replayOnNewBaseConcept: FacetConceptSource = {
  id: 'replayOnNewBase',
  label: 'Rebased Commits Get New Hashes',
  canonicalFacet: 'facet:replayOnNewBase',

  surface: {
    definition:
      'Rebasing recreates each branch commit on a new parent rather than moving it; since the parent is part of what is hashed, every replayed copy gets a new hash and the originals remain unchanged.',
    exemplarKeywords: [
      'git rebase',
      'rebase changes commit ids',
      'why do my commits have new hashes after rebase',
      'force push after rebase',
      'git push --force-with-lease',
      'rebasing a shared branch',
      'rebase onto main',
      'original commits after rebase',
    ],
  },

  briefing: {
    observable: [
      'Six commits with their hashes: A "First commit" 7a732fb, B "Add login" e3ad9ac, C "Add database" ca78789, D "Add cache" 26d49cf on main; X "Add button" 8660ebd and Y "Fix color" 6bd2bb2 on feature, branching from B. "Start · main → D · feature → Y".',
      '"Only on feature, oldest first: X Y" — the two commits to replay are numbered 1 and 2.',
      '"X → X\' · Parent: D (26d49cf) · Hash: 8660ebd → 82eb697" — a new card X\' with the same change "Add button" appears above D. Then "Y → Y\' · Parent: X\' (82eb697) · Hash: 6bd2bb2 → 07535eb": Y\'s own change does not involve X, yet its hash changes because its parent is now X\'.',
      '"Label feature: Y → Y\' · New commits: 2 · Same hash as before: 0 · Commits: 8". X and Y stay in place, no longer named. Five steps in all, counting the opening one.',
      'The hash is a toy: FNV-1a 32-bit over the change name and the parent hash, first seven hex digits. Real git also hashes tree, author, committer, time and message, but that a new parent gives a new hash is the same. Changes always apply cleanly; no file lines or conflicts are drawn, and the old commits are not cleaned up on screen. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the selection, the two replays and the label move by itself and stops.',
        'A Replay button and a playback strip sit below it. Dragging the strip to the second replay step holds Y\' beside Y with the old and new hash side by side.',
        'The commits and hashes are fixed, so an article can quote each old → new hash pair exactly.',
      ],
    },

    useWhen: [
      'The reader believes rebase moves commits and is surprised that a pushed branch now needs a force push; the article needs the old and new hashes side by side with the originals still present.',
      'The article explains why a replayed commit whose change is unrelated to the others still gets a new hash, and needs the second copy inheriting a new parent from the first.',
    ],

    avoidWhen: [
      'The topic is conflicts during a rebase or how the change is reapplied to file contents. No file lines appear here.',
      'The article is about interactive rebase — squash, fixup, reorder. Both commits are replayed as they were, in order.',
      'The subject is choosing between merge and rebase for a workflow. Only the rebase is carried out here.',
    ],

    contrastWith: [
      {
        concept: 'snapshotPointsBack',
        note: 'Each commit storing its parent\'s hash is the rule; replaying onto a new parent is where that rule forces new identities on commits whose own change did not change.',
      },
      {
        concept: 'pickOneOut',
        note: 'What travels when a commit is copied is its change against its parent, not a whole snapshot. This claim is about the identity the copy ends up with, not the lines it carries.',
      },
      {
        concept: 'rebaseVsMerge',
        note: 'New hashes are the price of rebasing. Weighing that price against a merge commit that keeps every original hash is a separate, larger judgement.',
      },
      {
        concept: 'unreachableSnapshot',
        note: 'The originals left behind by a rebase are not deleted by it; whether they are ever removed depends on whether any name still reaches them.',
      },
    ],
  },
};
