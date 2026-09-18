/**
 * shortWaitsForLong 개념 선언.
 *
 * canonical facet 은 `facet:shortWaitsForLong` — 조각이다. 요청 넷(A–D)이 한 묶음 틀 안에서
 * 걸음 1 에 함께 시작하고, 걸음마다 넷이 함께 한 칸씩 자란다. 칸에는 답의 낱말이 적히고,
 * 먼저 끝난 줄에는 점선 빈칸이 붙는다. 끝난 줄 오른쪽에 "waited n" 이 붙고, 가장 긴 줄이
 * 끝날 때 틀이 굵어진다. 스스로 한 바퀴 재생하고 되감기 · 타임라인으로 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **먼저 끝난 요청이 묶음이 끝날 때까지 붙들린다** 는 한 주장이다.
 * definition 의 주어는 먼저 끝난 요청이고, 한 묶음의 시간 축 안에서 말한다 (주어 층위 가르기 —
 * 완제품은 설정을 주어로 판 여럿을 견준다).
 *
 * 어휘 배타 — 이 화면에는 대기열도 자리 번호도 없다. 그래서 queue · slot · idle 은 쓰지
 * 않았다 (`refillTheEmptySlot` 의 몫). 이쪽이 가져가는 것은 longest · blank · together 다.
 * 마주 보는 짝 — 여기서는 끝난 요청이 **떠나지 못하고** 묶음 길이는 가장 긴 것이 정한다.
 * `refillTheEmptySlot` 에서는 끝난 요청이 **떠나고** 그 몫을 다음 요청이 이어 쓴다.
 *
 * ── 전제
 *
 * 답은 예로 정한 글이고, 낱말 하나를 토큰 하나로 센다. 실제 토큰화기는 낱말을 더 잘게
 * 자른다. 이것은 observable 과 avoidWhen 에 밝혔다.
 *
 * ── 화면의 수
 *
 * A 3 · B 8 · C 2 · D 5 낱말. 묶음은 걸음 8 에 끝나고 칸 32 가운데 빈칸 14 (44%).
 * 기다린 걸음 A 5 · B 0 · C 6 · D 3. 알고리즘의 `tallyAt` 규약대로 다시 셈했다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const shortWaitsForLongConcept: FacetConceptSource = {
  id: 'shortWaitsForLong',
  label: 'Short Waits for Long (Held Until the Longest Ends)',
  canonicalFacet: 'facet:shortWaitsForLong',

  surface: {
    definition:
      'Generations of unequal length started together as one group all stay in it until the longest ends; each that finishes sooner fills its row with blanks meanwhile, so the group lasts as long as its longest member.',
    exemplarKeywords: [
      'padding tokens in a batch',
      'pad to the longest sequence',
      'static batching',
      'wasted compute on padding',
      'straggler request',
      'the short answer waits for the long one',
      'variable-length outputs in one batch',
      'batch finishes with its slowest member',
      'why short requests are slow under batching',
      'head-of-line blocking in generation',
    ],
  },

  briefing: {
    observable: [
      'Four requests, A to D, start at step 1 inside one frame. Their answers are example sentences chosen for the illustration, and each word is counted as one token — a real tokenizer would divide many of these words further.',
      'At every step all four rows grow by one cell together. A request still producing writes its next word into the cell; a request already done receives a dashed blank cell instead, so the rows never differ in length.',
      'C finishes first, after two words, then A after three and D after five; B needs eight. A vertical mark is drawn after each request\'s last word so the point where it actually finished stays visible while the blanks pile up behind it.',
      'The frame\'s right edge advances with every step and carries all four rows along, and nothing leaves the frame until B\'s eighth word — the batch ends at step 8.',
      'Once a request is done, a count beside its row reads how many steps it has waited since; at the end these read 5 for A, 0 for B, 6 for C and 3 for D.',
      'Each step\'s caption states how many of its four cells were tokens and how many were blanks, and the closing caption reports 14 of 32 cells as blanks, 44%.',
    ],

    screen: {
      affordances: [
        'The screen plays through on its own — start, then one step at a time up to step 8 — and stops with the frame closed.',
        'Beneath it are a Replay button and a timeline strip; dragging the strip holds any single step still.',
        'The four answers are fixed, so an article can quote a word, a step or a waited count and name the request it belongs to.',
      ],
    },

    useWhen: [
      'An article says that running requests together wastes work on padding and the reader cannot picture where that waste sits: here it is the dashed cells, fourteen of thirty-two, all trailing the requests that finished early.',
      'A reader expects a two-word answer to come back after two steps, and the prose has to show why it takes eight — C finishes at step 2 and then waits six more beside B.',
      'The prose needs the reason a group\'s duration is fixed by one member, before any remedy is introduced, stated as something the reader watches happen rather than as a rule.',
    ],

    avoidWhen: [
      'The article is about what happens to the freed capacity — handing it to another request, or sorting requests by length before grouping them. Here the group is fixed from start to end and no request joins or leaves early.',
      'The subject is padding added to the input so that sequences line up, or attention masks over padded positions. The blanks here accumulate on the output side as generation runs.',
      'The article uses "padding" for the bytes a compiler inserts between struct fields. The word matches and the subject does not.',
      'The point depends on real token counts or real timings. Each word is counted as one token and every step is treated as costing the same.',
    ],

    contrastWith: [
      {
        concept: 'batchingAndPadding',
        note: 'One weighs several settings against each other to see how steps, wasted capacity and return times move; this fixes a single group and states only why an early finisher cannot come back early.',
      },
      {
        concept: 'refillTheEmptySlot',
        note: 'The two are opposite answers to the same moment: here a finished request is kept in its group and its share goes to waste, while there it is let go and the share passes to someone waiting.',
      },
      {
        concept: 'pipelineBubble',
        note: 'Both are about capacity that moves forward without doing work, but a bubble is one gap caused by a dependency and it delays everything behind it, whereas here the gaps are caused by uneven lengths and delay only the return of the ones that finished first.',
      },
      {
        concept: 'simd',
        note: 'Both lose efficiency because units of unequal work are run in lockstep, but there leftover elements cost extra operations of their own, while here the shorter members add nothing and simply occupy time until the longest is done.',
      },
    ],
  },
};
