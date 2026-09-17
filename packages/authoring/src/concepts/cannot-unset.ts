/**
 * cannotUnset 개념 선언.
 *
 * canonical facet 은 `facet:cannotUnset` — "왜 하나만 지울 수 없는가" 한 질문에만
 * 답하고 멈추는 짧은 화면이다. 비트 배열이 바닥이고 값은 그 위에 세 발을 딛고 선
 * 삼각대다. 하나를 지우려 칸을 끄면 그 칸을 함께 밟고 있던 값의 발이 바닥 아래로
 * 빠지고 좌판이 주저앉는다.
 *
 * 일곱 걸음을 스스로 재생하고 멈춘다. 독자가 지울 값을 고르는 자리는 없고,
 * 다시 보기와 한 걸음씩 짚기만 기다린다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 말하는 것은 **지우기 하나** 다 — 칸은 1 이라고만 말할 뿐 누가 켰는지를
 * 말하지 않으므로 되돌리는 연산이 성립하지 않는다는 것. `wrongInOneDirection` 은
 * 같은 사실에서 판정의 한계를 끌어내고, 이쪽은 연산의 불가를 끌어낸다. 넣는
 * 장면은 `severalHashesOneValue`, 설정을 고르는 일은 `bloomFilter` 의 몫이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cannotUnsetConcept: FacetConceptSource = {
  id: 'cannotUnset',
  label: 'Cannot Unset (Why Removal Breaks the Filter)',
  canonicalFacet: 'facet:cannotUnset',

  surface: {
    definition:
      'A Bloom filter has no removal because a position records that some value claimed it but not which one, so clearing one value\'s positions also withdraws the values that shared them.',
    exemplarKeywords: [
      'cannot delete from a Bloom filter',
      'counting Bloom filter',
      'removal is unsupported',
      'shared bits',
      'remove an element',
      'per-position counters',
      'why deletion breaks membership',
      'clearing a bit',
      'the no-false-negative guarantee broken',
      'delete support',
    ],
  },

  briefing: {
    observable: [
      'The array lies along the bottom as a floor, and each value stands on it as a seat on three legs whose feet rest on the three positions that value occupies.',
      'Feet belonging to different values on the same position are drawn side by side rather than stacked, so a position carrying two feet is visibly carrying two.',
      'Asking each value raises a "yes" badge over its seat and lights the positions it stands on; all three answer yes while the floor is still intact.',
      'The value to be removed is outlined in the alarm colour and lifted slightly off the floor before any position changes, so the intent is shown apart from its effect.',
      'Clearing is drawn as the old 1 sliding down and fading while a new 0 rises into the same cell.',
      'The removed value sinks behind the floor and disappears; the legs of every value that had been standing on a cleared position turn the alarm colour and drop through the floor while its seat sags.',
      'Asking again flips the badges of the collapsed values from "yes" to "no", and on this data nothing is left standing — removing one of three takes both of the others with it.',
      'The closing line names the cause: a position holds a 1 without holding who set it.',
    ],

    screen: {
      affordances: [
        'Seven moments play by themselves — the three standing, one round of questions, the selection, the clearing, the collapse, and the second round — and the screen stops on the closing line.',
        'A Replay button and a playback strip sit underneath. Once the run has finished, dragging the strip between the clearing and the second round is how the cleared positions can be compared against the feet still resting on them.',
        'The array is sixteen positions, the three values and the one to be removed are fixed, and every foot is placed from arithmetic on the value rather than by hand, so the shared positions are genuinely shared.',
      ],
    },

    useWhen: [
      'The article says the structure has no delete, and the reader takes that for a missing feature some implementation might supply. A leg dropping through the floor beneath a value nobody touched turns the omission into a consequence.',
      'The prose is about to offer counters in place of single bits as the repair, and the reason for the counters has to land first. A position bearing two feet while recording only that it is occupied is exactly what a counter would fix.',
    ],

    avoidWhen: [
      'The subject is the wrong verdict a filter can give about something never put in. The failure here runs the other way — values that were put in stop being found.',
      'The article is about inserting, or about how positions are computed. The floor starts filled and the only arithmetic shown is which positions each value already occupies.',
      'The point is sizing the array or the number of hashes. Both are fixed, and no setting of either would keep a shared position from being shared.',
      'The article is about deleting a key from a hash table or a dictionary, where the entry itself is stored and can be found and unlinked.',
    ],

    contrastWith: [
      {
        concept: 'bloomFilter',
        note: 'One is about an operation the structure refuses outright; the other about how accurately it performs the operations it does accept.',
      },
      {
        concept: 'severalHashesOneValue',
        note: 'Sharing a position occurs in both, but during insertion it costs nothing, and only when something is taken back out does it become the reason the operation cannot be done.',
      },
      {
        concept: 'wrongInOneDirection',
        note: 'Both follow from a position recording that it is set without recording by whom, but one bounds what a lookup may conclude while this rules out an operation altogether.',
      },
      {
        concept: 'chainingBucket',
        note: 'A bucket keeps the keys that landed on it, so one can be found and unlinked while the rest stay; a bit keeps no such record and cannot be undone for one value alone.',
      },
      {
        concept: 'countMinSketch',
        note: 'Both hand one position to several values at once, but a counter remembers how much was added there while a bit remembers only that something was, which is what decides whether one value can be taken back out.',
      },
    ],
  },
};
