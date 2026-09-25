/**
 * loopBack 개념 선언.
 *
 * canonical facet 은 `facet:loopBack` — 여섯 줄 프로그램에서 `while i <= 3` 의 몸을 끝낸
 * 흐름이 조건 줄로 거슬러 올라가 같은 줄을 되밟는다. 줄마다 발자국 점이 쌓이고, 되돌이 호가
 * 한 겹씩 바깥에 쌓이며, 조건이 거짓인 한 번에만 빠짐 길로 내려간다.
 *
 * ── 묶음 안에서의 자리
 *
 * `loopTermination` 은 "끝나는가" 를, 이쪽은 흐름의 **모양**(되돌아가 같은 줄을 다시 밟음)을
 * 말한다. 그래서 definition 에 무한 · 멈춤 · 끝나지 않음 같은 말을 넣지 않고, 되돌아감 ·
 * 같은 줄 다시 실행 · 머리줄이 몸보다 한 번 더 같은 낱말을 독점한다. 재귀(`recursionSelfCall`)
 * 도 "앞 줄로 돌아간다" 이므로 호출 · 새 인자 같은 말도 쓰지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const loopBackConcept: FacetConceptSource = {
  id: 'loopBack',
  label: 'A Loop Jumps Back (while Repeats Its Lines)',
  canonicalFacet: 'facet:loopBack',

  surface: {
    definition:
      'At the end of a while body, control jumps back up to the condition line and re-executes lines already run, so the header runs exactly once more than the body.',
    exemplarKeywords: [
      'while loop',
      'iteration',
      'how a loop repeats',
      'loop body',
      'loop header checked every pass',
      'jump back to the top of the loop',
      'counting loop iterations',
      'off-by-one in loop counts',
      'sum from 1 to n with a loop',
    ],
  },

  briefing: {
    observable: [
      'Six numbered lines sit beside a rail; a marker moves down the rail one line per step, and a footprint dot is added to a line each time it is stepped on.',
      'Whenever the next line is above the current one, the marker rides a return arc on the left of the rail back up to line 3. The arc stays, and each later return adds a new arc one layer further out.',
      'The captions count it: "Back up to line 3 — stepped on 2 times now", then 3, then 4.',
      'By the end, lines 1, 2 and 6 carry one dot each, lines 4 and 5 (the body) carry three, and line 3 (the condition) carries four, because the condition is evaluated before every entry into the body and once more to leave.',
      'On the fourth evaluation `i <= 3` is false and the marker takes the exit path on the right of the rail, past the body, down to `show total`. The output is 6; the variables end at total 6 and i 4.',
      'The whole run is thirteen steps. The code is written in a small language-neutral notation — `let`, `while`, `show`, indentation for the body — rather than in any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays the program by itself and stops after `show total`.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back through the run shows the arcs and footprint dots building up one return at a time.',
        'The six lines and the starting values are fixed, so the counts 1, 3 and 4 can be quoted from the finished screen.',
      ],
    },

    useWhen: [
      'The reader reads code strictly top to bottom and needs to see that a loop reverses that direction at one point and walks the same lines again.',
      'The article counts iterations and needs the fact that the condition line runs one more time than the body, with the footprints to point at.',
    ],

    avoidWhen: [
      'The subject is a loop that never ends. This loop leaves after three passes; nothing here is about failure to halt.',
      'The article is about `for` loops over collections or iterators. Only a counting `while` is drawn.',
      'The topic is branch prediction for backward jumps in a processor. The jump here is in source lines, not machine addresses.',
    ],

    contrastWith: [
      {
        concept: 'loopTermination',
        note: 'Repetition and halting are separate questions: this one is about the path control takes on each pass, that one about whether the pass count is finite at all.',
      },
      {
        concept: 'recursionSelfCall',
        note: 'Both return control to an earlier line of the same code. A loop re-runs those lines with the same variables, while a self-call enters them as a new invocation holding its own argument.',
      },
      {
        concept: 'backwardTaken',
        note: 'The same backward jump, seen at two levels: in the source it is how a loop repeats, and in the processor it is a branch whose target lies at a lower address that a predictor can guess taken.',
      },
    ],
  },
};
