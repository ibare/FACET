/**
 * circularBufferWrap 개념 선언.
 *
 * canonical facet 은 `facet:circularBufferWrap` — 칸 다섯의 가로 띠와, 그 띠와
 * 같은 구간을 차지하되 양끝이 반원으로 이어 붙은 지표 트랙. 화면의 주인공은
 * 저장된 값이 아니라 칸을 가리키는 자리(index)가 도는 길이다.
 *
 * 화면 성격: mount 하면 스스로 재생한다 (stepMs 700 · 넣기 둘 → 빼기 둘 → 결론).
 * 컨트롤은 다시 보기와 한 걸음 둘이며, 눌러야 완성되는 화면이 아니다.
 *
 * 코드에서 확인한 것:
 *   - 처음 배치가 이미 감긴 뒤 상태다. 찬 칸은 3 · 4 인데 tail 은 0 을 가리킨다.
 *     재생 중에 눈으로 감기는 것은 마지막 빼기의 head 4 → 0 한 번이다.
 *   - 감기는 걸음도 같은 미끄러짐이다. 트랙을 따라 도는 거리가 길어질 뿐 다른
 *     운동이 아니며, 그동안 트랙 선이 그 지표의 색으로 물든다.
 *   - 화면에 수식이 떠 있다. 쉴 때는 `next (i + 1) % 5`, 걸음마다
 *     `head (4 + 1) % 5 = 0` 꼴로 바뀐다.
 *   - 마지막 캡션은 칸 수가 그대로임을 말한다 (facet.ts messages 의 caption.done).
 *
 * definition 에 큐를 뜻하는 말을 넣지 않았다 — 이 화면의 주장은 차례가 아니라
 * 고정된 자리를 돌려 쓰느라 인덱스가 끝에서 처음으로 감긴다는 것이고, 그 말이
 * 들어가면 일반 큐 글에 걸린다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const circularBufferWrapConcept: FacetConceptSource = {
  id: 'circularBufferWrap',
  label: 'Circular Buffer: Wrapping to the First Slot',
  domain: 'cs-fundamentals',
  canonicalFacet: 'facet:circularBufferWrap',

  surface: {
    definition:
      'A fixed row of slots addressed by an index that returns to the first slot after the last, so positions are reused in place rather than added.',
    exemplarKeywords: [
      'ring buffer',
      'circular buffer',
      'circular queue',
      'wrap-around',
      'modulo index',
      '(i + 1) % n',
      'head and tail indices',
      'fixed-size buffer',
      'reusing slots in place',
      'audio and network buffers',
    ],
  },

  briefing: {
    observable: [
      'Five slots are numbered 0 to 4 in a row, and the row is the same width from the first frame to the last — the closing caption states that the count has not changed.',
      'Under the row runs a closed track covering exactly the same span, its two ends joined by half circles. The head and tail markers ride that track and only ever move forward along it.',
      'The step from the last slot to the first is the same sliding motion as any other, just a longer path around the curved end, and the track lights up in the moving marker colour while it travels.',
      'A line of arithmetic under the track reads next (i + 1) % 5 at rest and, on every step, spells out that step as the moving index name with its numbers filled in.',
      'Slots are dashed while empty and solid while holding a value; a value drops in from above the slot the tail names, and lifts out and fades from the slot the head names.',
    ],

    screen: {
      affordances: [
        'The screen runs four operations by itself, about 0.7s apart, and finishes on the sentence about the slot count.',
        'Two buttons: Replay, and Step. The first press returns to the opening arrangement and each further press plays one operation.',
        'The opening arrangement is already past one turn: values sit in slots 3 and 4 while the writing index points at slot 0. That crossed-looking start is the state to explain, not a mistake to correct.',
        'The two indices are labelled head and tail on screen, and the arithmetic is printed in the same modulo form. Prose that calls them read and write positions should tie those names to these two markers.',
      ],
    },

    useWhen: [
      'The prose has said the storage is fixed and reused and the reader wants to know what the index does at the end of the row — the answer is one modulo, shown as a continued move rather than a special case.',
      'A claim depends on the number of slots holding still while values keep passing through it, and that constancy needs to be watched from the first frame to the last.',
    ],

    avoidWhen: [
      'The article is about a collection that answers a shortage of room by taking more room — doubling, copying, amortised growth. Nothing here grows, which is the opposite of the subject.',
      'The subject is concurrency in a ring buffer: producers and consumers on separate threads, atomics, memory ordering. The name matches but a single index rule is all that is on display.',
      'The point is telling a full buffer from an empty one when the two indices meet. The run never fills the row nor empties it, so the ambiguity it turns on never arises here.',
      'The article is about what happens to data that arrives when the buffer is already full — dropping, overwriting, backpressure. That is a policy decision, and none is exercised here.',
    ],

    contrastWith: [
      {
        concept: 'growAndCopy',
        note: 'Two answers to running out of room: take more room, or come back around and use the room already held.',
      },
      {
        concept: 'indexAddressCalc',
        note: 'Both reach a slot by arithmetic on an index; here the arithmetic closes on itself, so an address can never run past the end of the row.',
      },
      {
        concept: 'enqueueDequeueEnds',
        note: 'One is about the order values leave in, the other about where they sit while they wait — the values here never move, only the indices naming them do.',
      },
    ],
  },
};
