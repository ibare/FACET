/**
 * branchTakeOnePath 개념 선언.
 *
 * canonical facet 은 `facet:branchTakeOnePath` — 여덟 줄 프로그램이 갈림길 모양으로 서고,
 * 흐름(점)이 `if temp > 25:` 에서 참인 왼 갈래로 꺾인다. 오른 갈래 두 줄은 끝까지 밟히지
 * 않아 `heater` 가 끝내 생기지 않는다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 서브도메인의 `conditionalStatement`(완제품)는 값을 움직여 갈래가 바뀌는 전체를 보이고,
 * `multiwayBranch` 는 조건 여럿의 차례를 말한다. 이쪽은 조건이 하나뿐이라 차례가 없다 —
 * 주장은 "가지 않은 쪽은 한 줄도 실행되지 않는다" 하나다. 그래서 definition 에 순서 · 처음 ·
 * 위에서부터 같은 말을 넣지 않고, 건너뛴 쪽의 대입이 일어나지 않는다는 쪽 낱말을 독점한다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const branchTakeOnePathConcept: FacetConceptSource = {
  id: 'branchTakeOnePath',
  label: 'If-Else Runs Only One Side',
  canonicalFacet: 'facet:branchTakeOnePath',

  surface: {
    definition:
      'In an if-else, execution enters only the side whose test holds; every statement on the other side is skipped, so a variable assigned only there is never created.',
    exemplarKeywords: [
      'if-else',
      'does the else block run too',
      'both branches execute misconception',
      'skipped block',
      'dead branch for this input',
      'variable defined only in one branch',
      'unbound variable after if',
      'tracing an if statement line by line',
      'beginner control flow',
    ],
  },

  briefing: {
    observable: [
      'The program stands as a fork: the outer lines on a central trunk, the if body on the left branch, the else body on the right branch.',
      'A dot walks the path one line per step and leaves a trail behind it. At `if temp > 25:` the tag reads `31 > 25 → true` and the dot turns into the left branch.',
      'The dot steps on `wear = "shorts"` and `fan = "on"`; each assignment drops its value into a variables box below as it happens.',
      'The two lines of the right branch stay where they are for the whole run, labelled "branch not taken · lines run: 0".',
      'At `print(wear)` the two branches meet again and the output shows `shorts`. The variables box then notes "never created: heater" — a name written in the code that no step ever made.',
      'The `else:` line itself is never stepped on; once the test is decided, the flow goes straight to the first line of the chosen body. The whole run is six steps after the start.',
      'The code is a small subset of Python notation, and the value of `temp` is fixed at 31.',
    ],

    screen: {
      affordances: [
        'The screen plays the program by itself, one line per step, and stops after the print.',
        'A Replay button and a playback strip sit below it. Once the run has finished, dragging the strip back to the condition step holds the moment the dot turns left while the right branch stays untouched.',
        'The program and the value 31 are fixed, so an article can quote every line, tag and count exactly as it appears.',
      ],
    },

    useWhen: [
      'The reader believes that because both bodies are written out, both somehow run. Watching the right-hand lines finish with zero steps and `heater` never appear settles it.',
      'The article warns that a variable assigned in only one branch may not exist afterwards, and needs a concrete case where the name is in the code but was never made.',
    ],

    avoidWhen: [
      'The article is about several conditions in a row and which one wins. There is a single test here, so no order among tests is on display.',
      'The subject is branch prediction or pipeline flushes in a processor. The fork here is in the source program, not in hardware guessing.',
      'The reader is meant to change the input and see the other side taken. The value is fixed and only one run is shown.',
    ],

    contrastWith: [
      {
        concept: 'conditionalStatement',
        note: 'Both hold that one side of a fork runs. The conditional covers the whole construct, including else-if chains and how the outcome moves as the value moves; this isolates only the fact that the untaken side does nothing at all.',
      },
      {
        concept: 'multiwayBranch',
        note: 'One test with two sides has no ordering question; several tests in a chain do. This claim is about what the losing side does, that one about which test gets to decide.',
      },
      {
        concept: 'exceptionPropagate',
        note: 'Both leave written lines unexecuted, but for different reasons: here a test chose the other side, while an exception abandons lines that were already on the path.',
      },
    ],
  },
};
