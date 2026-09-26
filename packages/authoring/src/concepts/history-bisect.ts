/**
 * historyBisect 개념 선언.
 *
 * canonical facet 은 `facet:historyBisect` — c1(good) · c16(bad) 사이 열여섯 커밋에서 처음 깨진 커밋(숨은 값 c11)을
 * 반씩 좁혀 찾는데, 빌드조차 안 되는 커밋이 섞여 있다. 손잡이 "Broken builds"(0~3, 처음 2)와 "Where they sit"
 * (범인 바로 앞 · 앞쪽 멀리 · 범인 뒤, 처음 범인 바로 앞)을 돌리면 시험 수 · 쌓인 분 · 남은 후보가 갈린다.
 * 코드 패널은 IR 하나를 여섯 언어로 옮긴다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 조각 `bisectHalving` 은 모든 커밋이 시험되는 깨끗한 경우 — 가운데를 시험해 반을 버리고, 시험 넷에
 * 16 분 — 한 장면이다. 이쪽은 그 되풀이를 전제로 두고 **시험할 수 없는 커밋이 어디 몇 개 있느냐에 따라 답이
 * 한 커밋에서 범위로 흐려지는 것**을 맡는다. 그래서 definition 은 cannot be built · untestable · answer widens
 * to a range · near the culprit / far away 를 쥐고, 조각이 독점한 midpoint · verdict · halves · timed test 를
 * 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `historyBisect.md` 가 밝힌 것):
 *  - 단조: 한 번 깨지면 뒤도 깨져 있다. 판정기는 "번호가 c11 이상이면 bad".
 *  - 가운데는 (good + bad) 를 2 로 나눈 몫. 비켜 서기는 거리 1, 2, … 마다 아래 먼저, 다음 위 — 지어낸 결정론 규칙이다.
 *    `git bisect skip` 은 치우친 난수로 고르므로 실제 시험 수는 다를 수 있다.
 *  - 시험 한 번 4 분은 예로 정한 값. 한 줄기(first parent 만) 이력이라 git 의 "닿는 커밋 수로 가르기" 와 가운데가 같다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const historyBisectConcept: FacetConceptSource = {
  id: 'historyBisect',
  label: 'Git Bisect with Untestable Commits',
  canonicalFacet: 'facet:historyBisect',

  surface: {
    definition:
      'Bisecting history when some commits cannot be built: untestable commits right beside the culprit widen the answer from one commit to a range, while untestable commits far from it only shift which commit gets tested.',
    exemplarKeywords: [
      'git bisect skip',
      'git bisect run exit code 125',
      'commit does not build during bisect',
      'only skipped commits left to test',
      'broken builds in history',
      'bisectable history',
      'keep every commit buildable',
      'why bisect returned several commits',
      'regression hunting',
      'atomic commits',
    ],
  },

  briefing: {
    observable: [
      'Sixteen commits c1..c16 in one line. c1 is marked good and c16 bad; the round opens with "Only the two ends are judged: c1 good · c16 bad". Commits that cannot be built carry a dashed "Does not build" fence.',
      'Each test first picks a commit — "Test the midpoint: c8" — and then shows its verdict and the part of the history it rules out — "c8: good → drop c2..c8", "c12: bad → drop c13..c16".',
      'When the midpoint is fenced off the pick moves aside: "Midpoint c10 does not build → step aside to c11". When nothing testable is left among the candidates the round stops — "Midpoint c9 does not build · none of c9..c10 builds" — and the answer is the whole remaining span: "First bad commit is one of c9..c11".',
      'At the start (two broken builds just before the culprit) the round takes 3 tests and 12 minutes and leaves 3 candidates. Readouts under the controls: Tests, Minutes, Candidates left.',
      'Raising the broken count just before the culprit from 0 to 3 widens the answer c11 → c10..c11 → c9..c11 → c8..c11 while tests go 4 → 4 → 3 → 2 — fewer, because the search stops early where it cannot narrow. Moved far back (from c3) the fence never meets a midpoint and the answer is c11 alone; placed after the culprit (from c12) one test steps aside to c11 and the answer is still c11 in 4 tests.',
      'The rules are a model: once broken, every later commit is broken; the midpoint is (good + bad) divided by 2, rounded down; stepping aside tries distance 1, 2, … below first, then above; a test costs 4 minutes as a chosen figure. Real `git bisect skip` picks a replacement with a biased random choice, so its test count can differ. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Broken builds" (0 / 1 / 2 / 3 — starts at 2) and "Where they sit" (Just before the culprit / Far back / After the culprit — starts just before). Each round plays to its answer and waits for a handle.',
        'The move that makes the idea land is stepping "Broken builds" upward with them just before the culprit: the fence grows toward c11 and the answer bracket widens while the test count drops. Switching "Where they sit" to Far back with the same count brings the answer back to one commit.',
        'The code panel, labelled "Bisect, stepping around broken builds", starts empty with a "+ Add language" button; the chosen language shows the whole search, including the step-aside loop, and highlights the line of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article argues that every commit should build on its own, and needs the concrete cost: broken commits next to a regression leave bisect unable to name a single culprit.',
      'A reader got several candidate commits back from bisect instead of one and wants to understand why, and why broken builds elsewhere in history did not matter.',
    ],

    avoidWhen: [
      'The point is the basic halving itself — how many tests a clean history needs. Here that is the starting assumption, and the handle mostly shows its failure cases.',
      'The history has merges or several branches. The line here is a single first-parent chain.',
      'The article is about flaky tests or a regression that comes and goes. The model assumes that once broken, every later commit stays broken.',
    ],

    contrastWith: [
      {
        concept: 'bisectHalving',
        note: 'Halving the suspect range with one test at a time is the procedure; untestable commits are what stops it from reaching a single commit, and where they sit decides by how much.',
      },
      {
        concept: 'binarySearch',
        note: 'A binary search can always compare the middle element. Bisecting commits depends on the middle being testable at all, and the answer degrades to a range when it is not.',
      },
      {
        concept: 'shrinkToSmallest',
        note: 'Both narrow a failure step by step, but bisect narrows a position in history while shrinking narrows the size of a failing input.',
      },
    ],
  },
};
