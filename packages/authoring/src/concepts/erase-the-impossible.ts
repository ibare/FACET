/**
 * eraseTheImpossible 개념 선언.
 *
 * canonical facet 은 `facet:eraseTheImpossible` — 조각이다. 위 두 줄은 목표 문법
 * `{ "age" : <정수> }` 의 자리와 지금까지의 출력, 아래는 후보 여섯이 원으로 선다 — 원의
 * 넓이가 확률이다. 결정 둘마다 제시 → 지우기 → 고르기 세 걸음이다. 스스로 한 번 재생하고
 * 그 뒤로는 되감아 짚는다.
 *
 * ── 화면의 수 (다시 재어 확인)
 *
 * 결정 1: 모형 1 등 `"` 0.46. 넷(`"` · null · `,` · `}`)을 지워 몫 0.59, 남은 42 가
 *         0.31 → 0.75, 7 이 0.10 → 0.25. 고른 것 42.
 * 결정 2: 모형 1 등 `,` 0.52. 다섯을 지워 몫 0.68, `}` 가 0.32 → 1.00 으로 전부 받는다.
 * 출력 `{"age": 42}`. 두 결정 모두 모형의 1 등이 지워져 답이 바뀐다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각은 빔이 없다 — 줄기 하나에서 토큰 하나를 고르는 자리다. 그래서 형제의 어휘
 * (beam · width · line · runner-up · summed)를 쓰지 않았고, 주어도 "문법" 이다. 완제품
 * `beamSearch` 의 지우기와는 **마주 보는 짝**이다 — 저쪽은 지워도 점수를 그대로 두고 빈
 * 자리를 다른 줄기가 차지하며, 이쪽은 지운 몫을 남은 후보에게 나눠 주어 한 번의 선택이
 * 바뀐다. definition 꼬리가 "shared out … overriding the model's top choice" 인 까닭이다.
 *
 * ── 전제
 *
 * 로짓은 예로 정한 값이다. `<정수>` 는 수 토큰 **하나** 라는 것도 이 문법의 약속이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const eraseTheImpossibleConcept: FacetConceptSource = {
  id: 'eraseTheImpossible',
  label: 'Erase the Impossible (Grammar-Constrained Decoding)',
  canonicalFacet: 'facet:eraseTheImpossible',

  surface: {
    definition:
      'Grammar-constrained decoding: before each token is picked, every option a required format such as JSON forbids is removed and its probability shared out among the permitted ones, overriding the model\'s top choice.',
    exemplarKeywords: [
      'constrained decoding',
      'structured output',
      'JSON mode',
      'logit masking',
      'masking invalid tokens',
      'force the model to output valid JSON',
      'grammar based sampling',
      'renormalize after masking',
      'schema-guided generation',
      'the model wants a quote but the field is a number',
    ],
  },

  briefing: {
    observable: [
      'Two rows sit at the top: the grammar {"age": <integer>} as a sequence of slots, and the output so far, which begins with {, "age" and : already filled. The slot being decided is lit.',
      'Below them six candidates stand as circles whose area is the probability: ", 42, 7, null, , and }. Each carries its probability to two decimals.',
      'In the first decision the model\'s top candidate is " at 0.46 — it wants to start a string. The slot takes one number token only, so four candidates shrink to dotted outlines, their combined 0.59 breaks off in small circles and flies to the two numbers: 42 grows from 0.31 to 0.75 and 7 from 0.10 to 0.25. 42 is picked and rises into the output.',
      'In the second decision the model\'s top candidate is , at 0.52 — it wants another key. Only } fits, so five are erased, 0.68 in all, and } goes from 0.32 to 1.00. 7 is erased here too, because the grammar has no way to append a second number.',
      'Each pick caption names what would have been chosen without erasing, so both times the model\'s own first choice is on screen next to the one the grammar let through. The finished output reads {"age": 42}.',
      'The shares go to the survivors in proportion to their size, which is the same as setting the forbidden logits to minus infinity and taking the softmax again. The logits are values fixed for the example, not the output of a real model.',
    ],

    screen: {
      affordances: [
        'The screen plays both decisions by itself — offer, erase, pick, twice — and stops with the finished output.',
        'Below it are a Replay button and a playback strip; after the run, dragging the strip holds any single offer, erase or pick still.',
        'The grammar, the six candidates and their logits are fixed, so an article can quote every probability before and after erasing.',
      ],
    },

    useWhen: [
      'The article introduces structured output or JSON mode and the reader believes the model is simply told the format. Here the model never learns it; its first choice is wrong both times and is removed from outside.',
      'A reader wonders why validating the whole output afterwards is not enough; the point is made at the level of one token, where a quote chosen for a number field could not be taken back.',
      'The prose needs to say what happens to the probability of a masked token — that it is not lost but handed to the allowed ones in proportion, so 42 ends at three times the share of 7, as it began.',
    ],

    avoidWhen: [
      'The subject is keeping several candidate outputs and comparing them. A single output is built one token at a time and no alternative is carried.',
      'The article is about prompting a model to follow a format, or about fine-tuning for it. Nothing here changes the model; the constraint is applied between its scores and the pick.',
      'The subject is parsing or validating JSON that already exists. The grammar here steers generation before each token and never inspects finished text.',
      'The point relies on real model behaviour or on nested schemas. The logits are chosen for the example and the grammar has one key and one integer made of a single token.',
    ],

    contrastWith: [
      {
        concept: 'beamSearch',
        note: 'Both remove continuations that break a rule before choosing; here the freed probability is redistributed and the single pick changes, while there scores are left as they were and the gain is room for other candidates.',
      },
      {
        concept: 'cutTheTail',
        note: 'Both drop candidates and share out what they held, but that drops them for ranking low, and this drops them for breaking a rule, even when they rank first.',
      },
      {
        concept: 'alwaysTheHighest',
        note: 'The pick is still the highest; what differs is that the highest is taken from what the grammar allows, so the model\'s own favourite can lose.',
      },
      {
        concept: 'tokenization',
        note: 'A lexer applies a grammar to text that already exists and reports what it finds; here a grammar is applied to text not yet written and decides what may appear.',
      },
    ],
  },
};
