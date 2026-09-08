/**
 * enqueueDequeueEnds 개념 선언.
 *
 * canonical facet 은 `facet:enqueueDequeueEnds` — 정거장 아홉 개로 이어진 가로
 * 궤도 하나. 오른쪽이 대기, 가운데가 관(줄), 왼쪽이 빠져나온 자리이고 문 둘은
 * 관의 양 끝에 붙어 있다.
 *
 * 화면 성격: mount 하면 스스로 재생한다 (stepMs 620 · 문 짚기 → 넣기 셋 → 빼기
 * 셋 → 결론). 다 보고 지나가도 화면은 할 말을 마치며, 컨트롤 둘은 곱씹기 위한
 * 것이다.
 *
 * 코드에서 확인하고 바로잡은 것:
 *   - 값은 나간 뒤에도 화면에 남는다. 왼쪽 구역의 정거장으로 계속 미끄러져
 *     늘어선다 (advance 가 모든 조각을 한 칸씩 민다).
 *   - 대기 자리에는 값이 떠난 자국이 점선으로 남고, 마지막에 그 자국 줄과 실물
 *     줄이 함께 accent 로 물든다 (matchOrder).
 *   - 문 라벨은 IN / OUT 이며 locale 과 무관한 상수다. front / rear 라는 글자는
 *     화면에 없다.
 *
 * id 에 변별어를 붙인 이유: 이 화면의 주장은 "문이 서로 반대편에 있으면 차례가
 * 어떻게 되는가" 한 대목이고, 큐 일반을 자칭하면 우선순위 큐 · 메시지 큐 글까지
 * 데려온다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const enqueueDequeueEndsConcept: FacetConceptSource = {
  id: 'enqueueDequeueEnds',
  label: 'Opposite Ends: In One, Out the Other',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:enqueueDequeueEnds',

  surface: {
    definition:
      'A line of values with the entry at one end and the exit at the other, travelled in one direction only, so nothing passes anything else and departures follow arrivals.',
    exemplarKeywords: [
      'FIFO',
      'first-in first-out',
      'enqueue and dequeue',
      'front and rear',
      'waiting line',
      'arrival order',
      'nothing overtakes',
      'order preservation',
      'producer and consumer',
    ],
  },

  briefing: {
    observable: [
      'The two doors are drawn as posts at opposite ends of one pipe, marked IN on the right and OUT on the left, and both flash once before anything moves.',
      'Every motion on screen runs right to left. A dashed rail with a single arrowhead under the pipe states that direction, and no value ever moves against it.',
      'A departure moves the entire line one station forward in one motion; the value at the exit crosses the door in that same single step, so leaving is not a separate kind of event.',
      'A value that leaves its waiting place leaves a dashed outline behind, so the arrival order stays fixed on the right while the values themselves travel left.',
      'At the close, the dashed outlines on the right and the departed values on the left are outlined together, and the two rows read in the same order.',
    ],

    screen: {
      affordances: [
        'The screen plays the whole flow by itself, about 0.6s per beat, and comes to rest on the two rows being compared.',
        'Two buttons: Replay, and Step. The first press of Step returns the run to the waiting values and each further press advances one operation.',
        'The words on the doors are IN and OUT, and they stay in those two letters at every locale. Prose that speaks of a front and a rear is pointing at these two posts.',
        'Three values, 3 then 7 then 1, are all that enters, so the order under discussion is short enough to be read off the screen rather than tracked.',
      ],
    },

    useWhen: [
      'The reader has been handed the order guarantee as a promise and wants the mechanism behind it; here one lane runs one way, so passing is not forbidden but impossible.',
      'The article is about to use a front and a back as if they were fixed places, and those two words need to be pinned to opposite ends of a single picture before the prose leans on them.',
    ],

    avoidWhen: [
      'The subject is a priority queue. What leaves first there is decided by a comparison, and a lane where nothing overtakes says the opposite of what the article needs.',
      'The article is about queueing infrastructure — brokers, topics, acknowledgements, retries, consumer groups. The word matches but the subject is delivery, not the order inside one lane.',
      'The point is that storage is reused by an index that returns to the start. This lane is straight and its stations do not join up.',
      'The subject is a structure whose two ends do the same job. The asymmetry of one entry and one exit is exactly what this screen is built to make visible.',
    ],

    contrastWith: [
      {
        concept: 'queueFifo',
        note: 'One is the ordering claim on its own; the other is the structure at work, with capacity, ages and counters around it.',
      },
      {
        concept: 'pushPopTop',
        note: 'The same question asked of one opening instead of two: with the ends split apart the sequence survives, with them merged it comes out reversed.',
      },
      {
        concept: 'circularBufferWrap',
        note: 'Both keep values in order, but one moves the values along a lane while the other leaves them in place and moves the index that names them.',
      },
    ],
  },
};
