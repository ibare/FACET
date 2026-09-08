/**
 * pushPopTop 개념 선언.
 *
 * canonical facet 은 `facet:pushPopTop` — 위만 열린 통 하나에 기록줄(IN/OUT) 과
 * top 눈금을 붙인 한 장면짜리 화면이다.
 *
 * 화면 성격: mount 하면 스스로 아홉 걸음을 재생하고 (stepMs 460, 막힘과 그 뒤
 * 열리는 걸음에서만 holdMs 900) 결론 캡션에서 멈춘다. 독자가 아무것도 누르지
 * 않아도 할 말을 마친다. 컨트롤은 다시 보기와 한 걸음 둘뿐이고, 값을 넣는 자리는
 * 없다 — 쌓는 값 3 · 7 · 1 은 선언에서 온다.
 *
 * 실제로 코드를 보고 고친 것:
 *   - 마지막 활은 서로 엇갈려 그려지지 않는다. `markDone` 이 peak 을 10 + k*6 으로
 *     키우며 그리므로 **포개진(nested)** 활 셋이다.
 *   - 오른쪽 기록줄의 빈 칸에는 값이 미리 적혀 있지 않다. 왼쪽 칸에만 흐린 숫자가
 *     있다 (push-pop-top-stage.ts 의 ghost text).
 *   - 막힌 탐침은 사라지지 않고 위로 되돌아 나간다.
 *
 * id 에 변별어를 붙인 이유: 이 화면이 다루는 것은 스택 전반이 아니라 "문이 하나면
 * 무엇이 따라 나오는가" 한 대목이라, 일반명사로 부르면 자료구조 전체를 자칭하게
 * 된다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const pushPopTopConcept: FacetConceptSource = {
  id: 'pushPopTop',
  label: 'One Opening: Push, Pop, and Top',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:pushPopTop',

  surface: {
    definition:
      'A container with a single opening through which values both enter and leave, so the value added most recently is the only one within reach and the first to leave.',
    exemplarKeywords: [
      'LIFO',
      'last-in first-out',
      'push and pop',
      'top of the stack',
      'why you cannot reach the middle',
      'call stack unwinding',
      'undo',
      'balanced parentheses',
      'backtracking',
    ],
  },

  briefing: {
    observable: [
      'The container is drawn with three closed sides and one open one. The two chevrons at that opening dip once at the start, one inward and one outward, so both directions are seen using the same gap.',
      'Values fly in from the left record row, pause above the opening, and drop straight down; leaving values rise back out through that same gap and are filed into the right record row.',
      'A reach for the buried value is a probe that comes down and stops dead on the value above it. The stopped point is drawn as a bar, the buried value gets a dashed outline, and the probe backs out without taking anything.',
      'A ruler numbered 0 to 3 stands beside the container and a marker labelled top slides up one notch per arrival and down one per departure, so the reachable position is a coordinate rather than a description.',
      'At the end three nested arcs join the entry row to the exit row: the first value in is tied to the last value out, and the pairing can be counted off arc by arc.',
    ],

    screen: {
      affordances: [
        'The screen plays itself from an empty container to the closing arcs and stops there. Nothing has to be pressed for it to finish its argument.',
        'Two buttons: Replay, and Step for walking the same beats one at a time. The blocked reach and the departure that frees it are the two moments the run lingers on, and they are the ones worth stepping through.',
        'The three values are fixed at 3, 7 and 1, and each keeps its own colour from the moment it appears in the left row until it lands in the right one, so one value can be followed across the whole run.',
        'A caption under the container names each moment as it happens, ending on the sentence that states the order reversal.',
      ],
    },

    useWhen: [
      'The prose has said that only the top may be touched and the reader hears a convention somebody picked; here a reach for a lower value is stopped by the value sitting on it, so the restriction is a consequence of the single opening.',
      'An argument is about to lean on departures being arrivals in reverse, and that reversal has to be countable first rather than recited.',
    ],

    avoidWhen: [
      'The article is about the stack as a region of memory — frames, allocation, stack versus heap. That is about where values live, and this shows only the order in which they may be reached.',
      'The subject is stack overflow as a crash from recursion depth. Nothing here runs out of room; what is on display is reachability.',
      'The article is about how a stack is built out of an array or a chain of nodes. The container here is a shape with one opening and shows nothing of its storage.',
      'The subject is a structure that opens at both ends. The single opening is the entire premise of this screen, so it argues against the subject rather than for it.',
    ],

    contrastWith: [
      {
        concept: 'stack',
        note: 'One settles why a single opening forces the order; the other is the structure in operation, with its own boundary behaviour to try.',
      },
      {
        concept: 'enqueueDequeueEnds',
        note: 'Count the openings and the order follows: one opening reverses the sequence, two opposite openings preserve it.',
      },
      {
        concept: 'array',
        note: 'The reach that gets blocked here is the ordinary move of an array — naming any position directly is precisely what one opening takes away.',
      },
    ],
  },
};
