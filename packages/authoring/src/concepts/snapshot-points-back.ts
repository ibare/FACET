/**
 * snapshotPointsBack 개념 선언.
 *
 * canonical facet 은 `facet:snapshotPointsBack` — 커밋 넷(A 처음 · B 로그인 추가 · C 오타 고침 · D 테스트 추가)을
 * 차례로 만든다. 커밋마다 두 걸음: 부모의 해시가 새 커밋 안에 `parent` 로 적히고, 그다음 새 커밋의 해시가 셈해진다.
 * 부모의 해시는 한 글자도 바뀌지 않는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 한 질문 — "잇는 화살은 왜 새것에서 옛것으로만 나는가". 한 동사 — **적혀 들어간다**. 이름표도 거슬러 걷기도 없다.
 * 같은 묶음의 `replayOnNewBase` 도 해시와 부모를 보이지만, 거기서는 부모를 **바꿔서** 새 해시가 나오는 것이고
 * 여기서는 부모 해시가 **먼저 있어야** 자식 해시를 셈할 수 있다는 차례다. 그래서 definition 은 records ·
 * before its own hash is computed · points only backward · parent never changes 를 쥐고, rebase · copy ·
 * new parent 를 쓰지 않는다.
 *
 * 전제 (설명 글 `snapshotPointsBack.md`): 장난감 해시 — `tree <변경>` 과 `parent <부모 해시>` 줄을 FNV-1a 32 비트로
 * 셈한 앞 일곱 자리. git 은 SHA-1(또는 SHA-256)에 트리 객체 해시 · 저자 · 시각 · 메시지를 넣는다. 병합 커밋 없음.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const snapshotPointsBackConcept: FacetConceptSource = {
  id: 'snapshotPointsBack',
  label: 'A Commit Stores Its Parent\'s Hash',
  canonicalFacet: 'facet:snapshotPointsBack',

  surface: {
    definition:
      'A new commit writes its parent\'s hash inside itself before its own hash can be computed, so the parent is never modified and links in a commit history can only point from newer to older.',
    exemplarKeywords: [
      'git commit object',
      'parent hash in a commit',
      'content-addressed history',
      'why git history is immutable',
      'commit graph arrows point to parents',
      'directed acyclic graph of commits',
      'Merkle chain',
      'git cat-file -p',
      'changing an old commit changes every later hash',
    ],
  },

  briefing: {
    observable: [
      'The screen starts with commit A alone: "A has no parent. Its hash: 7a732fb". Each commit is a card showing its `tree` line (the change, such as `tree add-login`) and, once written, a `parent` line.',
      'For each new commit the first step writes the parent\'s hash into it — "Written into B: parent 7a732fb. A keeps 7a732fb." — and only the next step computes the new hash — "Hash of B, with parent 7a732fb inside: e3ad9ac". The new card has no hash until then.',
      'The pattern repeats for C (parent e3ad9ac → hash ffa0472) and D (parent ffa0472 → hash 78af80d). Seven steps in all, counting the opening one.',
      'At the end A records no parent, B, C and D record one each, and no commit records a child. The parent\'s hash never changes when a child is added.',
      'The hash is a toy: FNV-1a 32-bit over the `tree` and `parent` lines, first seven hex digits. Real git uses SHA-1 (or SHA-256) and its `tree` line holds the hash of the whole file tree, with author, time and message also included; that a changed parent changes the hash is the same. Had A\'s change been different, B\'s hash would have been a5f0511 instead — the screen does not show this. There are no branch names, HEAD or merge commits.',
    ],

    screen: {
      affordances: [
        'The screen plays the four commits by itself, two steps per commit, and stops after D\'s hash appears.',
        'A Replay button and a playback strip sit below it. Dragging the strip to a "Written into" step holds the moment the new commit already carries its parent\'s hash but has no hash of its own yet.',
        'The commits, changes and hashes are fixed, so an article can quote each hash exactly as shown.',
      ],
    },

    useWhen: [
      'The reader asks why commit arrows in every git diagram point backward, and the article needs the order of events that forces it: the parent\'s hash must exist before the child\'s can be computed.',
      'The article explains why editing an old commit changes every later hash, and wants the concrete moment a parent hash is copied into its child.',
    ],

    avoidWhen: [
      'The topic is branches, HEAD or what moves when you commit. No names appear here.',
      'The article is about hash function properties such as collisions or SHA-1 weakness. The hash here is only a commit\'s name, and a toy one.',
      'The subject is walking history backward, such as git log or finding a common ancestor. Nothing is traversed here.',
    ],

    contrastWith: [
      {
        concept: 'replayOnNewBase',
        note: 'Storing the parent\'s hash explains why arrows point back; giving an existing change a different parent is what then forces a new hash on every replayed commit.',
      },
      {
        concept: 'hashChain',
        note: 'A hash chain is used to detect tampering with a log. In a commit graph the same embedding is the identity of each commit and the reason links run one way.',
      },
      {
        concept: 'branchIsALabel',
        note: 'Commits and their parent links never move once written. What does move when work continues is a name pointing at one of them.',
      },
    ],
  },
};
