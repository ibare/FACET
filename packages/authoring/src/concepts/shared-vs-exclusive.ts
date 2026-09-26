/**
 * sharedVsExclusive 개념 선언.
 *
 * canonical facet 은 `facet:sharedVsExclusive` — 요청 일곱이 두 줄에 온다. x 에는 `S1(x)` · `S2(x)` · `S3(x)` 가 차례로 허락되어
 * 셋이 함께 쥐고, y 는 `X1(y)` 가 혼자 쥔다. `X2(y)` · `S3(y)` · `X4(x)` 는 막힌다. 끝: x 쥔 이 셋 · y 쥔 이 하나 · 막힌 요청 셋.
 * 일곱 걸음, 스스로 재생한다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `lockWait` 은 막힌 뒤 **기다렸다가 넘겨받는** 시간 축이다. 이쪽은 **허락되느냐 막히느냐** — 호환표 한 칸 — 만 쥐고,
 * 막힌 요청은 막힌 채 멈춘다. 그래서 definition 은 compatible · many readers at once · conflicts · every current holder 를
 * 독점하고, queue · commit releases · takes over 를 쓰지 않는다.
 *
 * 전제 (설명 글 `sharedVsExclusive.md`): 잠금 올리기 · 표 · 범위 잠금 없음. 두 줄과 요청 차례는 예로 정한 값.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sharedVsExclusiveConcept: FacetConceptSource = {
  id: 'sharedVsExclusive',
  label: 'Shared vs Exclusive Locks (Compatibility)',
  canonicalFacet: 'facet:sharedVsExclusive',

  surface: {
    definition:
      'Only shared locks are compatible with each other: many readers can hold one row together, while an exclusive request conflicts with any holder and any request conflicts with an exclusive holder, so a writer excludes even readers.',
    exemplarKeywords: [
      'shared lock',
      'exclusive lock',
      'S lock and X lock',
      'lock compatibility matrix',
      'read lock vs write lock',
      'readers-writer lock',
      'SELECT ... FOR SHARE',
      'SELECT ... FOR UPDATE',
      'row-level locking',
    ],
  },

  briefing: {
    observable: [
      'Two rows, x and y, each show their holders and a "Holders" and "Turned away" count. The start reads "No one holds a lock yet." `S1(x)` means T1 asks for a shared lock on x; `X1(y)` means T1 asks for an exclusive lock on y.',
      '"Granted: S1(x). Holders of x: 1", then S2(x) and S3(x) are granted the same way — three shared holders stack on x.',
      '"Granted: X1(y). Holders of y: 1."',
      '"Blocked: X2(y). Conflicts with: X1(y)", then "Blocked: S3(y). Conflicts with: X1(y)" — a read is refused because a writer holds the row.',
      '"Blocked: X4(x). Conflicts with: S1(x) · S2(x) · S3(x)" — an exclusive request must be compatible with every current holder. The end state: x has 3 holders, y has 1, and three requests were turned away.',
      'Blocked requests simply stop here; waiting and taking over the lock later are not shown. Lock upgrades and table or range locks are not in the model. The rows and request order are chosen for the example. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the seven requests by itself and stops after the last one is refused.',
        'A Replay button and a playback strip sit below it. Holding the step where `S3(y)` is refused shows a reader turned away by a single writer.',
      ],
    },

    useWhen: [
      'The article introduces the two lock modes and needs the compatibility rule shown on requests rather than as a matrix: readers pile up, writers stand alone.',
      'A reader assumes a read never has to wait; the shared request refused on a row held for writing corrects that.',
    ],

    avoidWhen: [
      'The article is about what happens to a blocked request over time — queuing and being granted later. Refused requests stay refused here.',
      'The subject is lock upgrades, intention locks or table-level locking. Only row locks in two modes appear.',
      'The point is deadlock. No request ever waits on another in a cycle.',
    ],

    contrastWith: [
      {
        concept: 'lockWait',
        note: 'Compatibility decides whether a request is granted at once; what a refused request then does — queue and inherit the lock at the holder\'s commit — is the waiting side.',
      },
      {
        concept: 'lockExcludes',
        note: 'A mutex has one mode and one owner; database row locks add a shared mode so that many readers can hold the same row together.',
      },
      {
        concept: 'isolation',
        note: 'The compatibility rule is fixed; isolation levels change which reads take shared locks and how long they keep them.',
      },
    ],
  },
};
