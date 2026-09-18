/**
 * firstTokenVsRest 개념 선언.
 *
 * canonical facet 은 `facet:firstTokenVsRest` — 조각이다. 왼쪽에 프롬프트 열 낱말과 낸
 * 토큰이 글로 있고, 가운데에 "K·V compute" 문이, 오른쪽에 캐시가 아래에서 위로 쌓인다.
 * 걸음 1 에 프롬프트 열 자리가 한꺼번에 문을 지나 두꺼운 판이 되고, 걸음 2 · 3 · 4 에는
 * 앞 걸음이 낸 토큰 하나씩 얇은 판이 얹힌다. 옆 괄호 "+10" · "+1" 이 두께를 남긴다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **걸음들이 고르지 않다** 는 시간 축의 주장이다. 주어는
 * "생성의 여는 걸음" 과 "그 뒤 걸음들" 이다 (주어 층위 가르기 — `dontRecountThePast` 의
 * 주어는 이미 놓인 토큰, 완제품의 주어는 아낀 몫). 캐시 없는 쪽은 이 화면에 없으므로
 * recompute 류 낱말을 쓰지 않았고, 값의 낱말(bytes · memory · layer)도 쓰지 않았다.
 * 이쪽이 prompt · opening step · one pass 를 쥔다 — 형제 셋의 definition 에는 0 건이다.
 *
 * ── 전제
 *
 * 낱말 하나 = 토큰 하나, 이어진 네 낱말은 예로 정한 것. 셈은 자리 수이지 시간이 아니다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const firstTokenVsRestConcept: FacetConceptSource = {
  id: 'firstTokenVsRest',
  label: 'The First Step and the Rest (Prompt In at Once, Then One at a Time)',
  canonicalFacet: 'facet:firstTokenVsRest',

  surface: {
    definition:
      'The opening step of generation takes the whole prompt through the key and value computation in one pass, while each later step feeds in only the single token emitted just before it.',
    exemplarKeywords: [
      'prefill and decode phases',
      'prefill versus decode',
      'time to first token',
      'why the first token takes longer',
      'prompt processing in one pass',
      'long prompt slows the start',
      'decode phase one token per step',
      'input tokens versus output tokens cost',
      'TTFT',
    ],
  },

  briefing: {
    observable: [
      'The prompt is "write a short poem about the quiet sea at night", ten words counted as ten tokens, and four steps emit "soft", "waves", "hum" and "below". Those four words are an example continuation chosen for the picture, not the output of a model.',
      'At step 1 all ten prompt positions leave their words together, pass through the gate labelled "K·V compute" and settle as one thick slab at the bottom of the cache; a bracket beside it reads +10.',
      'At steps 2, 3 and 4 only the word emitted at the step before goes through — soft, then waves, then hum — each landing as a thin slab with a +1 bracket, so the four brackets stand side by side for comparing thickness.',
      'Each step then sends out one word, which appears under the "Emitted" heading below the prompt, and the cache is headed by a running count reading "Cache: c positions".',
      'At the end the caption reads that thirteen positions were computed in all: ten on step 1 and three over the three steps after it. A last line notes that "below" was emitted last, so its K·V is never computed.',
      'Only a setup with a cache is shown; the count is in positions, one per token, with no time or storage figure attached.',
    ],

    screen: {
      affordances: [
        'The screen plays through its four steps on its own and stops with all four slabs stacked.',
        'Beneath it are a Replay button and a playback strip. Once the run is over, dragging the handle to a step holds that slab mid-stack so its bracket can be read against the others.',
        'The prompt and the four emitted words are fixed, so an article can refer to a step by the word that goes through the gate on it.',
      ],
    },

    useWhen: [
      'An article explains why a reply is slow to start and then streams quickly, and needs the mechanism rather than the observation: ten positions go in at the start, one at every step afterwards.',
      'A reader is weighing a long prompt against a long answer and assumes each word costs the same wherever it sits; the +10 bracket beside three +1 brackets shows where a prompt\'s words are paid for.',
      'The prose introduces the terms for the two phases of serving a model and wants a picture in which the boundary between them is a single step.',
    ],

    avoidWhen: [
      'The article needs actual latencies or a time-to-first-token figure. Nothing here is timed; the slabs count positions, and a word is taken to be a token.',
      'The subject is what would happen without a cache. Only the cached setup is shown, so there is nothing to compare against.',
      'The point is how much the stored values weigh in memory. The cache is drawn as a count of positions only.',
      'The article is about how the prompt itself is assembled, trimmed or ordered. The prompt here is a fixed sentence and only its length matters.',
    ],

    contrastWith: [
      {
        concept: 'kvCache',
        note: 'This is about how unevenly the work falls across the steps of one reply; the other totals that work over a whole reply and asks how the total saving changes as the reply gets longer.',
      },
      {
        concept: 'dontRecountThePast',
        note: 'One explains why earlier positions can be left alone; this takes that as given and points out that the positions left alone are first taken in all at once, making the opening step the heavy one.',
      },
      {
        concept: 'speculativeDecoding',
        note: 'Here every step after the opening one advances by exactly one token; guessing ahead tries to get several tokens accepted for a single pass of the large model, breaking that one-per-step rhythm.',
      },
      {
        concept: 'contextAssembly',
        note: 'Deciding what goes into the prompt sets its length; this is about what that length costs at the moment generation begins, and why the cost is not spread over the reply.',
      },
    ],
  },
};
