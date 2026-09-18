/**
 * refillTheEmptySlot 개념 선언.
 *
 * canonical facet 은 `facet:refillTheEmptySlot` — 조각이다. 위에 요청 일곱(R1–R7)이 선
 * 대기열, 아래에 자리 셋이 가로 줄로 눕고 줄마다 걸음마다 한 칸씩 칸-걸음 기록이 쌓인다.
 * 걸음마다 빈 자리로 대기열 맨 앞 카드가 내려앉고, 앉은 카드마다 점 하나가 칸으로 날아가며,
 * 다 낸 카드는 걸음 끝에 떠난다. 스스로 한 바퀴 재생하고 되감기 · 타임라인으로 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **비워진 자리가 바로 다음 걸음에 대기열 맨 앞으로 찬다** 는 한
 * 주장이다. definition 의 주어는 끝난 요청이 비운 자리이고, 한 판의 시간 축 안에서 말한다.
 *
 * 어휘 배타 — 이 화면에는 가장 긴 요청이 정하는 끝도, 길이를 맞추는 빈칸도 없다. 그래서
 * longest · blank · padding 은 쓰지 않았다 (`shortWaitsForLong` 의 몫). slot 도 definition 에서
 * 뺐다 — 완제품이 자리 수를 주어로 쥐기 때문이다. 이쪽이 가져가는 것은 queue · waiting ·
 * next step · idle 이다. 마주 보는 짝은 `shortWaitsForLong` 머리 주석 참조.
 *
 * ── 전제
 *
 * 요청마다 낼 토큰 수 R1 5 · R2 2 · R3 3 · R4 4 · R5 1 · R6 3 · R7 2 는 예로 정한 값이다.
 * 프롬프트 읽기는 셈하지 않는다. observable 과 avoidWhen 에 밝혔다.
 *
 * ── 화면의 수
 *
 * 알고리즘의 `simulate` 규약대로 다시 셈했다. 걸음 3 에 R4 → 자리 2, 걸음 4 에 R5 → 자리 3,
 * 걸음 5 에 R6 → 자리 3, 걸음 6 에 R7 → 자리 1. 쉬는 칸은 걸음 7 의 자리 2 하나뿐.
 * 일곱 걸음, 칸-걸음 21 = 쓰임 20 + 쉼 1.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const refillTheEmptySlotConcept: FacetConceptSource = {
  id: 'refillTheEmptySlot',
  label: 'Refill the Empty Slot (Next in Queue Moves In)',
  canonicalFacet: 'facet:refillTheEmptySlot',

  surface: {
    definition:
      'In continuous batching, the place a finished request vacates is taken by the next request waiting in the queue at the very next step, so every place stays in use and falls idle only after the queue runs dry.',
    exemplarKeywords: [
      'continuous batching',
      'in-flight batching',
      'iteration-level scheduling',
      'dynamic batching in LLM serving',
      'request queue for an inference server',
      'new requests join a running batch',
      'reuse a freed slot immediately',
      'no need to wait for the whole batch',
      'vLLM style scheduling',
      'keep the accelerator busy',
    ],
  },

  briefing: {
    observable: [
      'Seven requests, R1 to R7, wait in a queue above three slots. The tokens each will produce — 5, 2, 3, 4, 1, 3 and 2 — are values chosen for the example, not lengths from any real model, and reading the prompt is not counted.',
      'Each request is a card whose filled dots are the tokens it still owes and whose hollow dots are the ones already produced. Every step, each seated card drops one dot into that step\'s cell in its slot\'s row.',
      'At step 1 the first three requests take slots 1, 2 and 3. R2 finishes at the end of step 2 and leaves; at step 3 R4, now first in the queue, moves into slot 2 and the rest of the queue shifts forward one place.',
      'The same happens once at each of steps 4, 5 and 6: R5 into slot 3, R6 into slot 3, R7 into slot 1. A slot emptied at the end of one step is filled at the start of the next, never within the same step.',
      'In the record on the right, a small triangle at the left edge of a cell marks the step at which a request moved in, and in each row it sits directly after the previous request\'s last cell, with no unused cell between them.',
      'The only unused cell appears after the queue is empty: slot 2 at step 7. The run ends after seven steps, and the tally reads 21 slot-steps as 20 used plus 1 idle.',
    ],

    screen: {
      affordances: [
        'The screen plays through on its own, one step at a time, and stops after step 7 with the tally shown.',
        'Beneath it are a Replay button and a timeline strip; dragging the strip holds any single step still.',
        'The seven requests, their token counts and the three slots are fixed, so an article can name the step at which a given request moved in and the slot it took.',
      ],
    },

    useWhen: [
      'An article introduces continuous batching and the reader needs the core move in isolation: R2 leaves at the end of step 2 and R4 is producing in the same slot at step 3.',
      'A reader assumes a finished request\'s capacity simply sits unused until others finish, and the prose needs to show that here the only unused slot-step in the whole run comes after the queue has emptied.',
      'The prose has to be exact about timing — vacated at the end of one step, taken at the start of the next — and wants each case of it pinned to a named request and slot.',
    ],

    avoidWhen: [
      'The article compares this approach with holding a group together until its longest member ends, or measures how much it saves. Nothing here runs the other way, so there is no second figure to set against 20 of 21.',
      'The subject is memory — how much each running request holds, or how much space a new one needs before it can be admitted. Every request is admitted as soon as a slot is free, and memory never appears.',
      'The article is about processing the prompt, prefill scheduling, or time to the first token. Reading the prompt is not counted as a step, and the token counts are values chosen for the example.',
      'The subject is scheduling threads or processes on an operating system, or ordering by priority. Requests here are taken strictly in arrival order.',
    ],

    contrastWith: [
      {
        concept: 'batchingAndPadding',
        note: 'One asks when handing over vacated capacity is worth doing and when it changes nothing, across several group sizes; this states only what the handover is and when it happens.',
      },
      {
        concept: 'shortWaitsForLong',
        note: 'The two are opposite answers to the same moment: here a finished request is let go and its share passes at once to someone waiting, while there it is kept until the group ends and its share goes to waste.',
      },
      {
        concept: 'queueFifo',
        note: 'The queue here is exactly a first-in first-out line; what this adds is the rule for when its front is admitted — whenever a place has been vacated, at the next step.',
      },
      {
        concept: 'kvCache',
        note: 'One is about what a single generation keeps from step to step so it does not recompute it; this is about which generations occupy the available capacity from step to step.',
      },
    ],
  },
};
