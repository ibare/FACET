/**
 * bisectHalving 개념 선언.
 *
 * canonical facet 은 `facet:bisectHalving` — c1(정상) · c16(깨짐) 사이 후보 15. 가운데를 꺼내 시험하고(4 분) 판정에 따라
 * 앞쪽이나 뒤쪽 이력을 버린다: c8 good(후보 8) → c12 bad(4) → c10 good(2) → c11 bad(1). 처음 깨진 커밋 c11,
 * 시험 4 번 · 16 분. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 한 질문 — "어디서 깨졌는지, 몇 번 시험하면 아는가". 한 동사 — **시험 한 번의 값이 쌓이고 후보가 반씩 떨어져 나간다**.
 * 같은 묶음의 완제품 `historyBisect` 는 이 되풀이를 전제로 두고 빌드 안 되는 커밋이 답을 흐리는 것을 쥔다. 그래서
 * definition 은 midpoint · test verdict · discard half · suspect commits · number of tests 를 쥐고,
 * cannot be built · range answer 를 쓰지 않는다. 이웃 `halveTheRange` · `binarySearch` 는 정렬된 값을 견주고,
 * 여기서는 커밋을 꺼내 **시험해서** 판정을 받는다.
 *
 * 전제 (설명 글 `bisectHalving.md`): 단조 — 한 번 깨지면 뒤도 깨져 있다. 가운데는 두 끝 번호 평균의 내림
 * (git 은 닿는 후보 수로 고르며 한 줄기에서는 같다). 시험 4 분은 예로 정한 값. 빌드 안 되는 커밋(`git bisect skip`)은 없다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const bisectHalvingConcept: FacetConceptSource = {
  id: 'bisectHalving',
  label: 'Bisecting for the First Bad Commit',
  canonicalFacet: 'facet:bisectHalving',

  surface: {
    definition:
      'To find the commit that first broke a test, check out the midpoint of the suspect commits, run the test, and discard the half its verdict clears; each costly test halves the suspects, so fifteen need four tests.',
    exemplarKeywords: [
      'git bisect',
      'git bisect good bad',
      'git bisect run',
      'find which commit introduced a bug',
      'regression search',
      'first bad commit',
      'how many tests does bisect need',
      'log2 of the number of commits',
    ],
  },

  briefing: {
    observable: [
      'Sixteen commits c1..c16 in a row: "Known ends — good: c1 · bad: c16 · Candidates: 15". A ledger underneath shows "Tests: 0 · Minutes: 0". The screen does not know the answer in advance; a commit\'s verdict appears only when it is tested.',
      'Each test takes two steps. First the midpoint lifts out onto a test stand — "Take out c8, build, run the tests → good" — and a "+4 min" entry is added to the ledger. Then the ruled-out history sinks and the candidate band shrinks — "c8 is good — it and everything before it leave: c2..c8 · Candidates: 8".',
      'The sequence is c8 good (8 left) → c12 bad (4 left, "everything after it leaves: c13..c16") → c10 good (2 left) → c11 bad (1 left).',
      '"One candidate left — first broken commit: c11". The ledger ends at "Tests: 4 · Minutes: 16". Ten steps in all, counting the opening one.',
      'The model assumes that once broken, every later commit stays broken. The midpoint is the average of the two ends rounded down; real git picks the commit that splits the remaining candidates most evenly by counting reachable commits, which matches the midpoint on a single line of history. The 4 minutes per test is a chosen figure, and every commit here builds. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the four tests by itself, two steps each, and stops at the answer.',
        'A Replay button and a playback strip sit below it. Dragging the strip back and forth over a drop step shows the candidate count halving 15 → 8 → 4 → 2 → 1.',
        'The history, the hidden culprit c11 and the 4-minute test are fixed, so an article can quote every test and minute count exactly.',
      ],
    },

    useWhen: [
      'A test that passed yesterday fails today with many commits in between, and the article needs to show that four timed tests find the culprit among fifteen where checking one by one would have taken ten.',
      'The article introduces `git bisect` and wants the good/bad verdict on a checked-out midpoint, and the half of the history it rules out, shown one test at a time.',
    ],

    avoidWhen: [
      'Some commits in the history do not build or cannot be tested. Every commit here is testable.',
      'The regression is flaky or was fixed and broken again. The model assumes a single switch from good to bad.',
      'The topic is binary search over a sorted array as an algorithm. The middle here is judged by running a test, not by comparing values.',
    ],

    contrastWith: [
      {
        concept: 'historyBisect',
        note: 'Halving with one test at a time assumes every commit can be tested. When some cannot, the same procedure may stop with several suspects instead of one.',
      },
      {
        concept: 'halveTheRange',
        note: 'Both drop half the candidates per probe. There a probe is a comparison with a sorted value; here it is a slow build-and-test run, which is why the number of probes is what matters.',
      },
      {
        concept: 'shrinkToSmallest',
        note: 'Both cut a failing case down step by step: bisecting narrows which commit introduced the failure, shrinking narrows how small the failing input can be.',
      },
    ],
  },
};
