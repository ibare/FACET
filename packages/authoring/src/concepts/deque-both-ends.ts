/**
 * dequeBothEnds 개념 선언.
 *
 * canonical facet 은 `facet:dequeBothEnds` — 좌우 마개 없이 양끝이 밖으로 벌어진
 * 통 하나. 두 입에 front / back 이름이 붙고, 입마다 IN 칩이 위에 OUT 칩이 아래에
 * 달려 칩 넷이 곧 조작 넷이다.
 *
 * 화면 성격: mount 하면 스스로 재생한다 (stepMs 660 · front 로 넣기 → back 으로
 * 넣기 → front 로 빼기 → back 으로 빼기 → 네 문 동시 열림). 컨트롤은 다시 보기와
 * 한 걸음 둘뿐이고, 자동 재생만 보고 지나가도 화면은 할 말을 마친다.
 *
 * 코드에서 확인한 것:
 *   - 자리(slot)가 고정이라 한쪽 끝에서 넣거나 빼도 이미 앉은 값은 한 픽셀도
 *     움직이지 않는다. 처음 값 둘은 가운데 자리에 앉는다.
 *   - 칩은 한 번 쓰이면 색이 채워진 채로 남는다. 마지막 걸음에서 넷이 한꺼번에
 *     켜지고 겹화살표 넷이 안팎으로 지나간다.
 *   - 화면에 새겨진 글자는 front / back / IN / OUT 뿐이며 locale 무관 상수다.
 *
 * avoidWhen 을 특히 두껍게 썼다. 이 개념은 자기를 부를 때 큐라는 말과 스택이라는
 * 말을 다 쓰는 자료구조라, 두 이름 어느 쪽으로 검색해도 걸린다. 한쪽 끝만 여는
 * 것이 요점인 글에 이 화면이 붙으면 본문을 정면으로 거스른다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dequeBothEndsConcept: FacetConceptSource = {
  id: 'dequeBothEnds',
  label: 'Both Ends Open: Two Doors, Four Operations',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:dequeBothEnds',

  surface: {
    definition:
      'A linear collection whose two ends each accept both insertion and removal, so a value can be added or taken at either end while the values between it stay put.',
    exemplarKeywords: [
      'deque',
      'double-ended queue',
      'push front and push back',
      'pop front and pop back',
      'addFirst and addLast',
      'insert at either end',
      'remove from either end',
      'front and back operations',
    ],
  },

  briefing: {
    observable: [
      'The container has no end caps: its walls flare outward at both ends, and values pass through those openings in both directions.',
      'Four chips sit around the two mouths, an IN above and an OUT below each, with the mouths named front and back. Each chip fills in as the operation it stands for is performed, so four operations are seen resolving onto two openings.',
      'An arriving value waits outside the mouth, slides in, and takes the position immediately beside the values already seated; those values do not shift by a pixel while it does.',
      'A departing value retraces the path it came in by, leaves through the same mouth it entered, and fades outside the container.',
      'At the close all four chips are lit at once and four arrows sweep together — one in and one out at each mouth.',
    ],

    screen: {
      affordances: [
        'The screen performs its four operations by itself, about 0.66s apart, and ends on all four openings shown working at the same time.',
        'Two buttons: Replay, and Step. The first press of Step restores the opening arrangement and each further press performs one operation.',
        'The mouths are labelled front and back, and the chips read IN and OUT; these four words stay in that form at every locale, so prose calling them head and tail should tie those names to these labels.',
        'Two values begin seated in the middle, one more arrives at each end and then leaves again from the end it arrived at, so the value that goes in at one mouth can be watched coming back out of that same mouth.',
      ],
    },

    useWhen: [
      'The prose has listed four operations and the reader is trying to hold them apart; watching each end take a value in and hand one back collapses the list into a single shape with two openings.',
      'An argument needs the newest value and the oldest value to be equally within reach, and the reader has to see that taking either one leaves everything between them exactly where it was.',
    ],

    avoidWhen: [
      'The article is about a line where values may only join at the back and leave from the front, and the asymmetry is the lesson. A container that accepts insertions at both ends contradicts that in its first frame.',
      'The subject is a structure with one active site, where the whole point is that only the most recent value is reachable. Two openings undo the constraint the article is establishing.',
      'The article is about how such a structure is stored — blocks of memory, doubly linked nodes, indices over a fixed array. Only the operations are on display, never the storage under them.',
      'The subject is an algorithm that chooses which end to use — sliding-window maxima, work stealing, monotonic sequences. What matters there is the discipline of the choice, not that both ends are open.',
    ],

    contrastWith: [
      {
        concept: 'stack',
        note: 'One site versus two: a stack earns its guarantee by refusing every position but the most recent, and opening the far end gives that guarantee up.',
      },
      {
        concept: 'queueFifo',
        note: 'Arrival order can be promised only while entry and exit are separate jobs; once either end can do both, departure order is chosen by the caller rather than fixed by the structure.',
      },
      {
        concept: 'circularBufferWrap',
        note: 'Reaching both ends cheaply usually rests on a fixed row of slots whose index wraps — one names the operations, the other shows where the values actually sit.',
      },
    ],
  },
};
