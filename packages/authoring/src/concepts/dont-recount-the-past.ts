/**
 * dontRecountThePast 개념 선언.
 *
 * canonical facet 은 `facet:dontRecountThePast` — 조각이다. 가운데 줄이 토큰 열이고,
 * 위는 캐시 없는 쪽, 아래는 캐시 있는 쪽이다. 둘 다 열과 제 K·V 줄 사이에 "셈" 띠가
 * 가로놓인다. 처음 토큰은 `we` 하나, 걸음 여섯이 `went to the beach and swam` 을 낸다.
 * 오른쪽 눈금이 걸음마다 셈한 자리를 위(캐시 없음)로, 아래(캐시)로 쌓는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **앞 자리의 K·V 는 걸음이 바뀌어도 같은 값이라 다시 셈할
 * 까닭이 없다** 는 관찰 하나다. 주어는 "이미 놓인 토큰들" 이다 (주어 층위 가르기 —
 * 완제품의 주어는 아낀 몫, `firstTokenVsRest` 의 주어는 걸음들).
 *
 * 어휘 배타: definition 에 recomputed · identical · already placed 를 쥐고, 형제의 낱말
 * (share · attends · prompt · first · bytes · memory · layer)은 쓰지 않는다. 화면의
 * 처음 토큰이 하나뿐이라 첫 걸음이 두 쪽에서 같다 — 프롬프트를 한꺼번에 넣는 장면은
 * 이 화면에 없으므로 그 낱말을 양보한 것이 정당하다.
 *
 * ── 전제
 *
 * 낱말 하나 = 토큰 하나, 이어진 낱말은 예로 정한 것, 층 · 머리는 세지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dontRecountThePastConcept: FacetConceptSource = {
  id: 'dontRecountThePast',
  label: "Don't Recount the Past (Earlier Keys and Values Never Change)",
  canonicalFacet: 'facet:dontRecountThePast',

  surface: {
    definition:
      'Tokens already placed yield identical keys and values at every later decoding step, so they need not be recomputed; only the newest position has to pass through the computation.',
    exemplarKeywords: [
      'why recompute keys and values',
      'redundant computation in decoding',
      'naive generation loop recomputes everything',
      'reuse past keys and values',
      'incremental decoding',
      'only the new token is processed',
      'triangular number of recomputations',
      'causal attention past does not change',
      'without a cache versus with a cache',
    ],
  },

  briefing: {
    observable: [
      'The run begins from a single token, "we", and six steps emit "went to the beach and swam". One word is counted as one token, and those six words are an example continuation chosen for the picture, not something a model produced.',
      'The token row runs across the middle. Above it sits the side without a cache and below it the side with one, each with its own row of K·V chips and a band marked "compute" lying between the tokens and the chips.',
      'At every step the upper side throws its K·V chips away and every token in the row passes back up through the band, so the chips rebuild from nothing: one at step 1, two at step 2, k at step k.',
      'On the lower side the chips already made stay where they are, and only the position that is not yet held passes through the band and joins the end of the row — one chip per step.',
      'Because the run begins from one token, the first step is identical on both sides; the sides only part from step 2 on.',
      'A gauge on the right stacks each step\'s count upward for the side without a cache and downward for the side with one, so the upper stack thickens every step while the lower grows by one each time. By the end the two totals are 21 and 6.',
      'Each side carries its name, No cache at the top edge and KV cache at the bottom edge, beside a line reading "K·V computed — this step n · total sum", and the caption says which step it is and how long a sequence it reads before emitting the next token.',
      'The last word emitted never has its K·V computed on either side, since no step comes after it. Layers and heads are left uncounted because both sides would be multiplied by the same factor.',
    ],

    screen: {
      affordances: [
        'The screen plays through its six steps on its own and stops with both totals shown.',
        'Beneath it are a Replay button and a playback strip. Once the run is over, dragging the handle to a step holds that step still so the two sides can be compared at the same moment.',
        'The starting token and the six emitted words are fixed, so an article can name the step at which a given word joins the row.',
      ],
    },

    useWhen: [
      'A reader has just learned that each new token attends to every earlier one and concludes that all of that must be worked out afresh each time; seeing the upper side throw away chips that the lower side keeps unchanged is the correction.',
      'The article wants the reason a cache is safe, not just that it is fast: nothing about a word that is already in place changes when more words arrive after it.',
      'The prose contrasts a textbook generation loop with how it is really run, and needs the difference as a count the reader can follow — 1, 2, 3 … against 1, 1, 1.',
    ],

    avoidWhen: [
      'The article needs to explain why the start of a response costs more than the rest. The run here begins from one token, so the opening step is the same on both sides.',
      'The subject is how much storage the kept values take. Nothing here is measured in bytes; the chips are counts of positions.',
      'The point concerns bidirectional encoders, where a later word can change how an earlier one is represented. The claim here depends on each position only looking backward.',
      'The article is about reusing results across different requests or users. Everything here happens inside one short run and is discarded when it ends.',
    ],

    contrastWith: [
      {
        concept: 'kvCache',
        note: 'This is the single reason reuse is possible — earlier positions do not change — while the other weighs how much that reuse saves over a long generation and what work it still leaves behind.',
      },
      {
        concept: 'firstTokenVsRest',
        note: 'Both describe the same lower row, but one says what is spared (everything already there) and the other says why the amount taken in differs between the step that absorbs the prompt and the steps after it.',
      },
      {
        concept: 'cacheKeepsGrowing',
        note: 'Keeping what never changes is the saving here; the other is the cost of that same decision, counted in bytes that are never given back.',
      },
      {
        concept: 'memoWriteOnce',
        note: 'Both avoid doing the same work twice by remembering it, but memoisation keys the stored answer by which subproblem it solves, while here the stored rows are simply appended in order and read back whole at every step.',
      },
    ],
  },
};
