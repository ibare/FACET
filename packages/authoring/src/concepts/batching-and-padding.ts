/**
 * batchingAndPadding 개념 선언.
 *
 * canonical facet 은 `facet:batchingAndPadding` — 완제품이다. 위에 요청 여덟(R1–R8)이
 * 도착 차례로 선 대기열, 가운데에 자리마다 걸음마다 한 칸씩 자라는 줄(토큰은 요청 색,
 * 빈칸은 빗금), 오른쪽에 요청마다 돌려받은 걸음 막대(점선은 앞 판), 아래에 칸 막대와
 * 걸음 · 칸 · 빈칸 · 가동 % 줄이 있다. 손잡이 둘 — 묶는 법(묶어서 기다림 · 빈자리 채움)과
 * 자리 수(1 · 2 · 4 · 8). 코드 패널(Batch loop, `runBatch`)이 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **두 손잡이의 조합이 세 수를 어떻게 맞바꾸는가** 다 — 걸음
 * 수 · 버린 몫 · 요청마다 돌려받는 때. definition 의 주어는 "자리 수와 앉히는 규칙" 이라는
 * 설정이고, 판 여럿을 견주는 층위다 (주어 층위 가르기).
 *
 * 어휘는 조각 둘에 넘겼다 (어휘 배타) — 가장 긴 것 · 빈칸 · 함께 붙들림은
 * `shortWaitsForLong` 이, 대기열 · 다음 걸음 · 쉼은 `refillTheEmptySlot` 이 가져갔다.
 * 여기 definition 에는 그 낱말(longest · blank · queue · idle)이 없다. 남은 것은 자리 수 ·
 * 앉히는 규칙 · 걸음 · 버린 몫 · 돌려받음이다.
 *
 * ── 전제
 *
 * 요청마다 만들 토큰 수 3 · 12 · 5 · 7 · 2 · 9 · 4 · 6 은 예로 정한 값이다. 프롬프트 읽기는
 * 셈하지 않고, 걸음 하나의 값은 자리 수와 무관하게 같다고 둔다. 이것은 avoidWhen 과
 * observable 에 밝혔다.
 *
 * ── 화면의 수
 *
 * 묶어서 기다림: 자리 1 · 2 · 4 · 8 → 걸음 48 · 34 · 21 · 12, 빈칸 0 · 20 · 36 · 48,
 * 끝난 걸음의 합 222 · 186 · 132 · 96. 빈자리 채움: 걸음 48 · 25 · 14 · 12, 빈칸 0 · 2 · 8 · 48,
 * 합 222 · 119 · 68 · 48. 알고리즘 규약대로 자리 넷 두 판을 손으로 다시 셈해 맞췄다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const batchingAndPaddingConcept: FacetConceptSource = {
  id: 'batchingAndPadding',
  label: 'Batching and Padding (Slot Count Against Seating Rule)',
  canonicalFacet: 'facet:batchingAndPadding',

  surface: {
    definition:
      'Serving several generation requests at once on a fixed number of slots: the slot count and the rule for seating requests trade total decoding steps against wasted capacity and against when each response comes back.',
    exemplarKeywords: [
      'batching in LLM inference',
      'batch size trade-off',
      'static batching versus continuous batching',
      'GPU utilization during decoding',
      'LLM serving throughput',
      'padding waste in a batch',
      'how many requests to run at once',
      'inference server scheduling policy',
      'per-request completion time',
      'more parallelism is not free',
    ],
  },

  briefing: {
    observable: [
      'Eight requests, R1 to R8, start in a queue in arrival order with their prompt text shown. The number of tokens each will produce — 3, 12, 5, 7, 2, 9, 4 and 6, forty-eight in all — is a value chosen for the example, not the output length of any real model, and reading the prompt is not counted as a step.',
      'Each slot is a row that grows one cell per step. A cell holding a request is drawn in that request\'s colour; a cell where the slot has nothing to produce is hatched as empty, so wasted capacity is visible as area rather than only as a number.',
      'On the default setting — wait for the batch, four slots — the first group R1–R4 runs for twelve steps because R2 needs twelve, and R1, done after three, sits through nine hatched cells before all four are returned together. The run ends after 21 steps with 36 of 84 cells empty, 57% busy.',
      'Switching to refilling empty slots with four slots finishes in 14 steps with 8 empty cells. At step 5 R5 in slot 1 and R3 in slot 3 finish together, and at step 6 R6 takes slot 1 and R7 takes slot 3 — the lower-numbered slot receives the front of the queue.',
      'Adding slots under wait-for-the-batch cuts steps from 48 to 34, 21 and 12 while empty cells rise from 0 to 20, 36 and 48. Under refilling, the same slot counts give 48, 25, 14 and 12 steps with 0, 2, 8 and 48 empty cells.',
      'At one slot the two rules are identical. At eight slots they tie on steps and empty cells (12 and 48) yet still differ in the sum of finish steps, 96 against 48, because waiting returns even the two-token R5 only when the twelve-token R2 is done.',
      'A panel on the right grows one bar per request up to the step at which it was returned, and after any change of setting the previous run stays behind as dashed bars, so which requests came back earlier can be read bar against bar.',
      'Three running counts sit beside the controls — steps, empty cells, and the sum of finish steps — and a line under the rows reads step, cells, empty and busy percentage as the run proceeds.',
    ],

    screen: {
      affordances: [
        'The screen plays one whole run on its own and then waits. Moving either handle sends every request back to the queue, folds or unfolds the slot rows, and plays a new run from the start.',
        'Two handles: the batching rule, wait for the batch or refill empty slots, opening on wait; and the slot count, 1, 2, 4 or 8, opening on 4.',
        'Playback controls for running, stepping, pausing, resetting and changing speed.',
        'A code panel labelled Batch loop shows `runBatch`, which takes the request lengths, the slot count and the rule, returns the number of steps, and records each request\'s finish step.',
        'The eight requests and their token counts are fixed, so an article can quote any step count, empty-cell count or finish step and name the setting that produced it.',
      ],
    },

    useWhen: [
      'An article recommends raising the batch size to go faster and the reader needs to see what that buys and what it spends: under waiting, four slots take 21 steps instead of 48 but leave 36 of 84 cells empty.',
      'The prose argues that the seating rule matters as much as the slot count, and the reader should be able to hold the slot count at four and watch steps fall from 21 to 14 and the finish-step sum from 132 to 68 by changing the rule alone.',
      'A reader assumes one rule simply dominates the other, and the article needs the settings where they coincide — one slot entirely, eight slots on steps and empty cells — together with the one number that still separates them at eight.',
    ],

    avoidWhen: [
      'The subject is how fast a real accelerator runs a batch, or how the cost of a step grows with the number of slots. Every step here costs the same regardless of slot count, and all token counts are values chosen for the example rather than measured.',
      'The article is about processing the prompt, the time to the first token, or memory held per request. Prompt reading is not counted and nothing about memory appears.',
      'The subject is batching during training — minibatches, gradient averaging, or padding and masking in an encoder. Here only generation is batched and nothing is learned.',
      'The article uses "padding" for the bytes a compiler inserts between struct fields. The word matches and the subject does not.',
    ],

    contrastWith: [
      {
        concept: 'shortWaitsForLong',
        note: 'One isolates a single fact — what an early-finishing request does while its group keeps running; this sets two choices against each other and weighs steps, wasted capacity and return times across every combination.',
      },
      {
        concept: 'refillTheEmptySlot',
        note: 'One states the rule of handing a vacated place to the next request as a claim on its own; this treats that rule as one of two choices and asks where it pays off and where it makes no difference at all.',
      },
      {
        concept: 'throughputNotLatency',
        note: 'Both separate the rate at which work completes from how long any one piece of work takes, but one holds each instruction\'s duration fixed while the rate rises, whereas here the choice of rule changes the individual return times as well.',
      },
      {
        concept: 'kvCache',
        note: 'One cuts the work inside each step of a single generation by keeping what earlier steps computed; this leaves each step\'s work alone and arranges many generations so that fewer steps are spent in total.',
      },
      {
        concept: 'speculativeDecoding',
        note: 'Both lower the number of steps a generation takes, but one does it for a single request by accepting several tokens per step, while this does it across many requests by running them side by side, one token each per step.',
      },
    ],
  },
};
