/**
 * queueFifo 개념 선언.
 *
 * canonical facet 은 `facet:queueFifo` — capacity 10 의 bounded 컨베이어 벨트.
 *
 * observable / screen 은 선언 파일의 필드 이름을 옮겨 적어서는 안 되고, view
 * 구현과 시나리오를 실제로 확인한 뒤에 써야 한다. 이 파일에서 실제로 걸린 것:
 *   - aging-gradient 는 색이 짙어지는 것이 아니라 채도가 빠져 바랜다
 *     (conveyor-queue.ts: saturate 1→0.35 이 지배적, brightness 는 0.75 까지).
 *   - overflow-check / underflow-check phase 는 IR 에는 있지만 기본 시나리오가
 *     용량에 닿지도 빈 큐를 건드리지도 않아 한 번도 점등되지 않는다.
 *   - 코드 패널은 처음에 비어 있다. 독자가 "+ 언어 추가" 를 눌러야 코드가 뜨고,
 *     동시에 최대 2개다 (view-code MAX_PANELS = 2).
 *   - 게이트 라벨은 front/rear 가 아니라 OUT/IN 이고 locale 무관이다.
 * 그대로 뒀다면 writer 가 화면에 없는 것을 가리키는 문장을 썼다.
 *
 * screen.labels 의 원천은 conveyor-queue.ts LABELS_BY_LOCALE, control-bar.ts
 * BTN_LABEL_BY_LOCALE / SPEED_LABEL_BY_LOCALE, view-code CODE_VIEW_LABELS_BY_LOCALE,
 * facet.ts 의 blocks[].label + metrics[].label 이다. codegen 이 붙으면 이 필드는
 * 손 작성에서 기계 추출로 넘긴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const queueFifoConcept: FacetConceptSource = {
  id: 'queueFifo',
  label: 'FIFO Queue',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:queueFifo',

  surface: {
    definition:
      'A linear collection where elements enter at one end and leave at the other, so the order of departure always matches the order of arrival (FIFO).',
    exemplarKeywords: [
      'FIFO',
      'first-in first-out',
      'enqueue and dequeue',
      'task queue',
      'message queue',
      'buffer',
      'waiting line',
      'BFS frontier',
      'producer-consumer',
      'arrival order',
    ],
  },

  briefing: {
    observable: [
      'Values enter only through the right gate and leave only through the left gate; the middle never opens in any frame.',
      'A single dequeue slides the whole line forward by one cell in one motion, so the queue reads as one body rather than a set of independently moving cards.',
      'Every block carries an entry stamp shown as #1, #2, #3, making the departure order visibly monotonic — the on-screen proof of FIFO.',
      'Blocks that have waited longer fade: saturation drops as age grows, so they wash out rather than darken, and waiting time is legible at a glance.',
      'Departed values remain in a tail log, up to the three most recent.',
      'An LED board above each gate names the operation happening right now and rests on a single dot when nothing is in flight.',
      'The metric row counts enqueued / dequeued / peeked / overflow / underflow. Capacity is 10 and the default scenario neither fills nor empties past the boundary, so the overflow and underflow counters stay at 0 for the whole run — what is on display is the capacity readout, not the failure itself.',
      'The code panel highlights the running phase in step with the animation — the scenario loop, then enqueue / dequeue / peek per step, then done.',
    ],

    screen: {
      labels: {
        en: [
          'Queue (FIFO)',
          'Conveyor belt: oldest leaves first, newest rides at the back',
          'Queue',
          'OUT',
          'IN',
          'Total in: <n>',
          'Size: <n> / 10',
          '(empty)',
          'PUSH <value>',
          'POP',
          'PEEK <value>',
          'OVERFLOW',
          'UNDERFLOW',
          '#<n>',
          '▶ Play',
          '⏭ Step',
          '⏸ Pause',
          '↺ Reset',
          'Speed',
          'Enqueued',
          'Dequeued',
          'Peek',
          'Overflow',
          'Underflow',
          'Code',
          '+ Add language',
          'Max 2',
          'Add a language to view code.',
          'Python',
          'JavaScript',
          'TypeScript',
          'Java',
          'C++',
          'C#',
        ],
        ko: [
          '큐 (FIFO)',
          '컨베이어 벨트 — 가장 오래 기다린 것이 가장 먼저 떠나는 기계',
          '큐',
          'OUT',
          'IN',
          '총 입장: <n>',
          '크기: <n> / 10',
          '(비어 있음)',
          'PUSH <값>',
          'POP',
          'PEEK <값>',
          'OVERFLOW',
          'UNDERFLOW',
          '#<n>',
          '▶ 재생',
          '⏭ 단계',
          '⏸ 정지',
          '↺ 리셋',
          '속도',
          '입장',
          '퇴장',
          '조회',
          '넘침',
          '빔',
          '코드',
          '+ 언어 추가',
          '최대 2개',
          '언어를 추가해 코드를 확인하세요.',
          'Python',
          'JavaScript',
          'TypeScript',
          'Java',
          'C++',
          'C#',
        ],
      },
      affordances: [
        'The panel opens with a title block printing the facet title and its one-line description verbatim. That sentence is already on screen before the reader reads a word of the article.',
        'The two gates are labelled OUT (left, where values leave) and IN (right, where values enter). These two words stay in English at every locale, and they are what the reader looks for when prose says "front" or "rear".',
        'The LED words (PUSH / POP / PEEK / OVERFLOW / UNDERFLOW) also stay in English at every locale, and they are the operation names the reader actually sees on the board.',
        'Playback controls: play, single step, pause, reset, and a speed slider. The reader can stop on any single operation.',
        'The code panel starts empty. Code appears only after the reader clicks "+ Add language" and picks one.',
        'At most two languages can be open side by side (chosen from Python, JavaScript, TypeScript, Java, C++, C#), and the add button turns into "Max 2" at the limit. Comparing exactly two languages is what this panel is good for.',
      ],
    },

    avoidWhen: [
      'The article is about a priority queue. Departure is decided by priority, not arrival, and the internals are a heap — this belt metaphor actively misleads.',
      'The point is the index wrap-around of a circular queue. This visualization is a straight belt and never shows the tail joining the head.',
      'The subject is a deque. Its symmetry at both ends contradicts the asymmetry this visualization is built to make visible.',
    ],

    contrastWith: [
      {
        concept: 'stack',
        note: 'Activity concentrates at one site in a stack and splits across two in a queue. A single still frame separates them: a container open at the top versus a belt open at both ends.',
      },
      {
        concept: 'array',
        note: 'What a queue gives up is exactly what an array is for: an array reaches any index in one step, a queue only ever touches its two ends.',
      },
      {
        concept: 'linkedList',
        note: 'A linked list is a common substrate for a queue — it explains how both ends stay constant-time, but it shows rewiring rather than order preservation.',
      },
    ],
  },
};
