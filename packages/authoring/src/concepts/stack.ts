/**
 * stack 개념 선언.
 *
 * canonical facet 은 `facet:stack` — 입력 트랙 · 수직 더미 · 출력 트랙을 한 SVG 에
 * 담은 stack-stage view.
 *
 * 진행 모델은 **reactive** 다 — mount 직후 1·2·3 을 0.7 초 간격으로 쌓아 보인 뒤
 * 멈추고, 독자가 값을 넣고 버튼을 누를 때만 움직인다. 화면 구성은 값 입력 필드와
 * 네 버튼, 그리고 다섯 카운터가 전부다.
 *
 * 화면 텍스트 주의: stage 내부 문자열이 locale 분기 없이 한국어로 하드코딩되어
 * 있다 (stack-stage.ts:253 '꼭대기', :262 '비어 있음', projector.ts:34 BASE_CAPTION
 * 과 사건 캡션 전부). 영어 화면에서도 그대로 한국어가 뜨므로 screen.labels 의
 * en/ko 가 상당 부분 동일하다.
 *
 * 변별어를 붙이지 않은 이유: 모든 스택이 LIFO 라 `stack` 단독으로 불려도 모호하지
 * 않다 (C4 명명 규칙 3).
 */

import type { FacetConceptSource } from '../concept-types.js';

export const stackConcept: FacetConceptSource = {
  id: 'stack',
  label: 'Stack (LIFO)',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:stack',

  surface: {
    definition:
      'A linear collection where insertion and removal both happen at one and the same end, so the most recently added element is the first one out (LIFO).',
    exemplarKeywords: [
      'LIFO',
      'last-in first-out',
      'push and pop',
      'top of stack',
      'call stack',
      'undo history',
      'backtracking',
      'expression evaluation',
      'depth-first traversal',
      'nesting and unwinding',
    ],
  },

  briefing: {
    observable: [
      'Every change happens at one single place — the top. The middle and the bottom of the pile are never touched in any frame, which is the whole contrast with a queue.',
      'A push travels as a curve: a box leaves the input track on the right, arcs over, and lands on top of the pile.',
      'A pop is the same curve reversed — the top box lifts off and arcs down to the output track on the left.',
      'A peek does not move anything. Concentric rings spread from the top box and its color blinks, and the pile stays exactly as it was.',
      'Underflow shakes the pile left and right and flashes the top label red.',
      'Overflow draws a red dashed line above the pile and bounces the incoming box back off it.',
      'On mount the facet demonstrates itself: 1, 2, 3 are pushed one at a time about 0.7s apart, then it stops and waits for the reader.',
      'A caption line under the pile changes with every event, naming what just happened.',
    ],

    screen: {
      labels: {
        en: [
          'Stack (LIFO)',
          'One spot to add, one spot to remove — last in, first out',
          '꼭대기',
          '비어 있음',
          '스택은 가장 최근에 들어온 원소를 가장 먼저 꺼내는 자료구조다 — 모든 변화는 꼭대기 한 자리에서만 일어난다.',
          '꼭대기 위에 새 박스를 얹었다 — <값>',
          '꼭대기의 박스를 떼어냈다 — <값>',
          '꼭대기 값을 보았다 — 더미는 그대로다',
          '더 쌓을 자리가 없다',
          '떼어낼 박스가 없다',
          '이제 직접 — 값을 입력하고 쌓기·떼기·보기를 눌러보세요',
          'Value',
          'Push',
          'Pop',
          'Peek',
          'Reset',
          'Overflow',
          'Underflow',
        ],
        ko: [
          '스택 (LIFO)',
          '한 자리만 만진다 — 마지막에 들어온 것이 가장 먼저 나온다',
          '꼭대기',
          '비어 있음',
          '스택은 가장 최근에 들어온 원소를 가장 먼저 꺼내는 자료구조다 — 모든 변화는 꼭대기 한 자리에서만 일어난다.',
          '꼭대기 위에 새 박스를 얹었다 — <값>',
          '꼭대기의 박스를 떼어냈다 — <값>',
          '꼭대기 값을 보았다 — 더미는 그대로다',
          '더 쌓을 자리가 없다',
          '떼어낼 박스가 없다',
          '이제 직접 — 값을 입력하고 쌓기·떼기·보기를 눌러보세요',
          '값',
          '쌓기',
          '떼기',
          '보기',
          '초기화',
          '넘침',
          '빔',
        ],
      },
      affordances: [
        'The reader drives this facet. It plays a short self-demonstration on mount — 1, 2, 3 pushed about 0.7s apart — then stops and waits. From there, every further change comes from the reader typing a value and pressing a button.',
        'The controls are one value field and four buttons: Push, Pop, Peek, Reset. Write about what the reader should try, not about what they should watch.',
        'The pile caps at 8, so a reader who keeps pushing will hit overflow, and pressing Pop or Peek on an empty pile produces underflow. Both have their own animation and their own counter, so both are worth inviting the reader toward.',
        'A standing caption already states the LIFO rule in full ("모든 변화는 꼭대기 한 자리에서만 일어난다"). It is on screen before the reader does anything, so that sentence is not available as your own reveal.',
      ],
    },

    avoidWhen: [
      'The article is about a deque or a double-ended structure. The entire point of this visualization is that there is exactly one active site.',
      'The article needs the reader to sit back and watch a run unfold on its own. This facet only advances when clicked.',
    ],

    contrastWith: [
      {
        concept: 'queueFifo',
        note: 'One active site versus two. A single still frame separates them: a container open at the top versus a belt open at both ends.',
      },
      {
        concept: 'array',
        note: 'A stack refuses to look at the middle; an array is nothing but the ability to reach the middle by index.',
      },
      {
        concept: 'bfs',
        note: 'Swapping a stack for a queue in a traversal is what turns depth-first into breadth-first — the container choice decides the shape of the search.',
      },
    ],
  },
};
