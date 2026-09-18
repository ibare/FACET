/**
 * fillToAShare 개념 선언.
 *
 * canonical facet 은 `facet:fillToAShare` — 조각이다. 문맥 둘이 나란히 서고, 문맥마다 그릇
 * 하나와 확률 차례로 선 후보 여덟이 있다. 후보를 하나 담을 때마다 그 조각이 그릇으로 날아가
 * 수위가 오르고, 수위가 p = 0.9 선에 닿은 걸음에서 담기가 멈춘다. "The capital of France is"
 * 는 둘, "My favorite color is" 는 일곱에서 멈춘다. 끝 걸음은 k = 3 이었다면 찼을 높이를
 * 그릇 곁 괄호로 보인다. 스스로 한 번 재생한다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **몫을 채우는 규칙이 남기는 수를 문맥에 맡긴다** 는 한 주장이다.
 * definition 의 주어는 "확률 큰 차례로 담아 합이 p 에 닿을 때까지" 이고 꼬리는 "한 낱말이
 * 압도하면 둘, 여럿이 겨루면 일곱" 이다. 완제품 `topKTopP` 의 낱말(count · mass · peaked ·
 * flat · chained)과 형제 `cutTheTail` 의 낱말(draw · survivors · proportion · weakest)은
 * definition 에 0 건이다 (기계 확인). cutTheTail 과는 마주 보는 짝이다 — 저쪽은 크기를
 * 고정하고 버린 몫이 흔들리며, 이쪽은 담긴 몫을 고정하고 크기가 흔들린다.
 *
 * ── 밝힌 전제
 *
 * 로짓은 예로 정한 값이다. 화면은 이 각주를 달지 않으므로 observable 과 avoidWhen 에서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fillToAShareConcept: FacetConceptSource = {
  id: 'fillToAShare',
  label: 'Fill to a Share (Top-p Nucleus)',
  canonicalFacet: 'facet:fillToAShare',

  surface: {
    definition:
      'Adding candidate tokens from likeliest downward until their summed probability first reaches p lets the context decide how many stay: two when one word dominates, seven when many compete.',
    exemplarKeywords: [
      'nucleus sampling',
      'top-p sampling',
      'top_p parameter',
      'cumulative probability threshold',
      'smallest set of tokens covering p',
      'adaptive candidate set',
      'why top-p keeps more tokens when the model is unsure',
      'nucleus size varies by prompt',
      'confident prediction keeps few tokens',
    ],
  },

  briefing: {
    observable: [
      'Each of two prompts has eight candidates lined up by probability beside an empty bowl with a line marked p 0.9. The logits behind the probabilities are example values, not the output of a real language model, and the screen does not say so.',
      'The prompts are taken in turn. Each step lifts the next candidate out of the line into the bowl as a layer as thick as its probability, and the fill level rises by that much.',
      'After "The capital of France is", "Paris" alone fills about 0.85; adding "the" brings the level to about 0.92, past the line, so filling stops and two candidates are kept.',
      'After "My favorite color is", the first colour fills only about 0.22, and the level crosses the line only when the seventh colour brings it to about 0.95; "white" is the one left out.',
      'The candidate that carries the level over the line is kept, not discarded, and the ones never poured stay in the line and fade.',
      'The last step raises a bracket beside each bowl showing how high the top three alone would have filled it: about 0.95 for the France prompt and about 0.56 for the colour prompt.',
    ],

    screen: {
      affordances: [
        'The screen plays through once by itself — one prompt poured to the line, then the other, then the brackets — and stops with both bowls filled.',
        'A Replay button and a playback strip sit beneath it; after the run, dragging the strip back holds any single pour still.',
        'Both prompts, their sixteen candidates, p and the comparison value of three are fixed, so an article can quote any fill level and name the word that produced it.',
      ],
    },

    useWhen: [
      'An article calls nucleus sampling "adaptive" and the reader needs to see what adapts: one p = 0.9 keeps two words after a factual prompt and seven after an open-ended one.',
      'A reader thinks top-p keeps the candidates whose probability is above p, and needs to watch the rule actually applied — probabilities added one at a time until the total first reaches the line.',
      'The prose needs the edge case stated plainly: the candidate that pushes the total over the line stays in, which is why the France prompt keeps "the" as well as "Paris".',
    ],

    avoidWhen: [
      'The article presents the probabilities as a real model\'s output. The logits are example values chosen so that one prompt is nearly certain and the other is spread out.',
      'The subject is the random pick that follows. Nothing is drawn here; each prompt ends when filling stops.',
      'The article is about choosing p, or about stacking top-p with top-k in one configuration. p is fixed at 0.9, and the three-candidate bracket only compares what a fixed number would have filled.',
      'The subject is temperature or reshaping the distribution. Every probability here is fixed before the first pour.',
    ],

    contrastWith: [
      {
        concept: 'cutTheTail',
        note: 'Both leave a shortlist, but here the retained probability is fixed and the size is whatever it turns out to be; there the size is fixed in advance and the discarded probability is whatever it turns out to be.',
      },
      {
        concept: 'topKTopP',
        note: 'This isolates why a threshold on accumulated probability yields a different number of candidates per prompt; the broader question weighs that against a fixed number and follows the two applied in sequence.',
      },
      {
        concept: 'flattenOrSharpen',
        note: 'Temperature changes how concentrated a distribution is; the threshold takes that shape as given and responds to it, so a sharper distribution lets the same p stop after fewer candidates.',
      },
      {
        concept: 'alwaysTheHighest',
        note: 'Always taking the top token is the case where one candidate is the whole shortlist whatever the prompt; a threshold keeps one only when that token alone already reaches it.',
      },
    ],
  },
};
