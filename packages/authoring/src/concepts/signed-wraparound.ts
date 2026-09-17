/**
 * signedWraparound 개념 선언.
 *
 * canonical facet 은 `facet:signedWraparound` — 8비트 부호 있는 범위의 양 끝
 * 세 칸씩만 두고 가운데를 점선과 생략 표식으로 접은 조각이다. 125 에서 1 씩
 * 더해 오른쪽 끝에 닿고, 한 번 더 더하면 표식이 오른쪽 끝을 지나 아래로 도는
 * 길을 따라 왼쪽 끝으로 들어온다. 그 길은 미리 그려져 있지 않고 표식이
 * 지나가면서 비로소 그어진다.
 *
 * 스스로 재생하고 멈춘다. 다시 보기와 한 걸음씩만 딸려 있다 — 폭도 시작값도
 * 고를 수 없다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * `integerOverflow` 가 세 자리를 갈라 두었고 이 파일은 그 분배를 받는다.
 *
 *   integerOverflow  셈이 폭을 넘어서는 일. 어디서 넘는지가 폭에 달렸다.
 *                    **과정** 이다 — 수열이 자라다 벽에 닿기까지.
 *   이 개념          **값의 집합이 닫힌 고리라는 사실**. 가장 큰 수 다음이 가장
 *                    작은 수이고, 그 까닭은 자리올림이 부호 자리까지 번지는
 *                    것이다. 셈의 과정이 아니라 범위의 짜임이 주어다.
 *   silentTruncation 좁은 그릇으로 옮기는 일. 연산이 아니라 대입·변환이다.
 *
 * 앞의 둘이 가장 붙으므로 definition 의 주어를 특히 벌려 두었다 — 저쪽은
 * "a computed value passing the largest integer", 이쪽은 "the representable
 * values ... form a closed ring". 그래서 keywords 는 **이웃 관계 어휘**(127 + 1 이
 * -128 · 최대 다음이 최소 · 고리 · 이음매 · 어느 쪽으로 돌든) 를 가져가고, 폭
 * 고르기 · 자료형 넓히기 어휘는 integerOverflow 에 넘긴다.
 *
 * avoidWhen 이 막아야 하는 것: 스택 오버플로 · 버퍼 오버플로는 definition 에
 * overflow 가 없어도 이웃 어휘로 걸리고, "wrap" 은 원형 버퍼 · 텍스트 줄바꿈 ·
 * 함수 감싸기까지 끌어온다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const signedWraparoundConcept: FacetConceptSource = {
  id: 'signedWraparound',
  label: 'Wraparound (The Largest Value Is Followed by the Smallest)',
  canonicalFacet: 'facet:signedWraparound',

  surface: {
    definition:
      'The values a fixed-width signed type can hold form a closed ring rather than a line: adding one to the largest gives the smallest, because the carry reaches the sign position.',
    exemplarKeywords: [
      '127 plus 1 becomes -128',
      'the largest value is followed by the smallest',
      'wraparound',
      'the number range is a ring, not a line',
      'the carry running into the sign bit',
      'modular arithmetic over a fixed width',
      'INT_MIN right after INT_MAX',
      'unsigned 255 plus 1 is 0',
      'a score or health counter that flips to the worst value',
      'the midpoint bug in binary search, low plus high turning negative',
      'a timer counter that returns to the past',
      'subtracting one from the smallest value',
      'where the range is seamed',
      'odometer rollover',
    ],
  },

  briefing: {
    observable: [
      'Only six cells are drawn — the three lowest values and the three highest — with a dashed rail and an elision mark standing in for everything between them, so the two ends of the range sit in one view at readable size.',
      'The end cells are named on screen as "smallest" and "largest", and the numbers under the cells are the values themselves, so the claim can be quoted with the actual bounds rather than in the abstract.',
      'The marker carries two things as it travels: the value inside it, and the full two\'s complement pattern of that value riding just above it.',
      'In every step the bits that differ turn over one at a time from the right, so a carry is visible as a run along the pattern rather than as a result appearing at the end.',
      'On reaching the highest value the end cell and its name are emphasised, and the caption states the bound with the width that produced it: "The right end — the largest signed value 8 bits hold is 127".',
      'The next addition is the same addition, and the run of flipping bits simply keeps going until it reaches the leading position: 01111111 becomes 10000000 and the value shown changes to the smallest partway through the move.',
      'That move is the only one that does not go straight: the marker leaves the right end, follows a curve that drops below the row, and enters at the left end — and the curve is drawn only as the marker travels it, so the connection appears by being used rather than by having been there all along.',
      'After the wrap the marker steps right again from the smallest value to the next one, and that step looks exactly like the steps before the wrap.',
      'At the end the whole rail, including the elided middle, takes on one colour and both ends are emphasised at once, with the closing caption stating the conclusion: "Not a line but a ring — the largest value is followed by the smallest".',
    ],

    screen: {
      affordances: [
        'The screen plays the whole walk on its own and stops with the ring closed and both ends emphasised.',
        'Under it sit a Replay button and a playback strip. Once the walk has finished, dragging the strip handle back to the move that crosses the end holds it still, and dragging across it in either direction shows it looks like any other move.',
        'The width is fixed at eight bits and the walk always starts three below the largest value, so an article can quote the exact values and bit patterns on screen.',
      ],
    },

    useWhen: [
      'The article says a value that grows too large "wraps" and the reader pictures it stopping at the maximum or being clipped. The successor of the largest value being the smallest — a distance of one, not of the whole range — is the thing that has to be seen.',
      'The prose has to explain a bug in which a quantity flips from its best state to its worst in a single step: a sum of two large values turning negative, a score at its peak becoming the lowest possible, a counter reaching a time before it started.',
      'The reader treats the sign flip as a special rule the machine applies when it detects a problem, and the screen instead shows one ordinary addition whose carry happens to reach the last position, with nothing detecting anything.',
      'The argument needs the range to be symmetric in the other direction too: because the ends are neighbours, stepping down from the smallest value lands on the largest, and one join in the ring accounts for both.',
      'An article about a fixed-width counter needs the reader to accept that its values recur rather than accumulate, before anything is claimed about how long it can run.',
    ],

    avoidWhen: [
      'The subject is stack overflow — unbounded recursion, an exhausted call stack, StackOverflowError. Nothing here concerns calls or memory, and nothing is reported when the end is crossed.',
      'The subject is a buffer overflow or overrun — writing past the end of an array, smashing a stack, the exploit class built on it. The only end crossed here is the end of a range of values.',
      'The subject is floating point, where a value past the format range becomes infinity and never returns to the other end. Nothing on this screen is a float, and the ring does not exist there.',
      'The subject is an index deliberately folded back to the first slot of a fixed row of cells, so that positions can be reused. That is a container being cycled on purpose; this is a type having no value beyond its last one.',
      'The article uses "wrap" for text wrapping in a layout, for a function or object wrapping another, or for a value being boxed.',
      'The question is how many steps a growing computation survives, or whether a wider type would help. Nothing grows here — one value is stepped along by one, and the width never changes.',
      'The subject is a value being moved into a narrower container by a cast or an assignment. The container here is fixed throughout and nothing is converted.',
      'The subject is how a negative pattern is produced from a positive one, or which reading applies to a pattern already written. The patterns here change only as a side effect of adding one.',
    ],

    contrastWith: [
      {
        concept: 'integerOverflow',
        note: 'That one is the crossing as an event a computation runs into, and it stops at the first term that does not fit; this one takes the crossing apart — it is a join between two adjacent values, and stepping over it is neither slower nor different from any other step.',
      },
      {
        concept: 'twosComplement',
        note: 'That one reads each pattern on its own and concludes what it denotes; this one lines the patterns up in order and finds that the ordering closes on itself, which is what the one negative weight costs.',
      },
      {
        concept: 'silentTruncation',
        note: 'Both leave a value congruent to the true one modulo a power of two, but here nothing is discarded — the bits stay in place and only the reading of the leading position changes — while there the leading positions are gone.',
      },
      {
        concept: 'circularBufferWrap',
        note: 'Two rings that must not be confused: there an index is folded back by an explicit remainder so that slots can be reused, here the folding is a property of the type itself and no code asks for it.',
      },
      {
        concept: 'negateAndAddOne',
        note: 'Both hinge on a carry reaching the end of the row. There it is driven all the way on purpose and confirms the result; here it arrives at the sign position unbidden and turns the largest value into the smallest.',
      },
    ],
  },
};
