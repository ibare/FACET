/**
 * alwaysTheHighest 개념 선언.
 *
 * canonical facet 은 `facet:alwaysTheHighest` — 조각이다. 어휘 여섯(I · think · that ·
 * it · is · good)과 앞 토큰 하나만 보는 로짓 표로, 프롬프트 `I` 에서 토큰 여덟을
 * 늘 1 등으로 만든다. 셋째 토큰에서 `I` 가 돌아오면 줄이 꺾여 처음 칸 아래로 가고,
 * 문장은 `I think that` 을 세 줄 겹쳐 쌓는다. 상자 아래에 그 자리의 확률과 2 등이
 * 적힌다. 스스로 한 바퀴 재생하고 그 뒤로는 한 걸음씩 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **1 등만 고르는 규칙은 같은 자리에 다시 서면 같은 길을
 * 되밟는다** 는 주장이다. definition 의 주어는 "뽑기 없는 1 등 규칙" 이고 꼬리는
 * "되밟음 · 되풀이 · 고리" 다. 완제품 `greedyDecoding` 이 맡는 **글 전체의 확률 ·
 * 곱 · 첫 선택 · 먼저 닫힘** 어휘는 쓰지 않았다 — 이 화면에는 끝 표식도 글 전체
 * 확률도 없다. 낱말도 화면을 따라 token 으로 썼다 (완제품은 word).
 *
 * ── 전제
 *
 * 로짓은 예로 정한 값이고 앞 토큰 하나만 보는 작은 모형이다. 화면은 그 각주를 달지
 * 않으므로 avoidWhen 과 observable 에서 밝힌다. 행 it · is · good 은 걸음이 닿지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const alwaysTheHighestConcept: FacetConceptSource = {
  id: 'alwaysTheHighest',
  label: 'Always the Top Token (Why Greedy Output Repeats)',
  canonicalFacet: 'facet:alwaysTheHighest',

  surface: {
    definition:
      'A decoder that always appends the top-ranked next token, with nothing drawn at random, retraces its own output once any token recurs, so the same short phrase cycles until the length limit.',
    exemplarKeywords: [
      'greedy decoding repetition',
      'the model keeps repeating itself',
      'repetition loop in generated text',
      'degenerate repetitive output',
      'stuck in a loop',
      'argmax picks the same continuation',
      'same prompt gives the same output',
      'the runner-up never gets a chance',
      'text generation goes in circles',
      'why LLM output repeats a phrase',
    ],
  },

  briefing: {
    observable: [
      'The sentence starts from the single prompt token "I" and grows one token per step; each chosen token leaves the spot of the previous token and settles at the end of the line.',
      'Under every token box sits the chance it had at its step, to two decimals, and below that in smaller type the runner-up at the same spot: after "I" the top is "think" at 0.81, after "think" it is "that" at 0.48 with "it" second at 0.32, after "that" it is "I" at 0.46 with "it" second at 0.34.',
      'When "I" is chosen as the third new token, the line bends back and the box comes to rest beneath the column where "I" first stood, opening a second row; the caption says the token already sat at an earlier position.',
      'Every token after that lands directly beneath the same token in the row above, and the caption calls it the same step as the row above, so the retracing shows as rows stacking in the same columns.',
      'After eight new tokens the text reads "I think that I think that I think that" in three matching rows, and the closing caption says the same 3 tokens went round 3 times.',
      'Only three of the six tokens in the vocabulary are ever placed; "is" and "good" never appear, and "it" shows up only as a runner-up.',
      'Nothing on the screen says the numbers are made up: the logits behind them are example values for a toy model that looks only at the previous token, not the output of a trained model.',
    ],

    screen: {
      affordances: [
        'The screen plays through on its own, one token per step, and stops on the closing caption with three rows drawn.',
        'Beneath it are a Replay button and a playback strip; once the run is over, dragging the strip holds any single step still.',
        'The vocabulary, the logits, the prompt and the eight-token length are fixed, and there is no handle, so the run is identical every time — which is itself the point being made.',
      ],
    },

    useWhen: [
      'An article mentions that greedy output tends to repeat itself and the reader takes it for a quirk of the model; three identical rows show that the rule alone produces it once any token comes back.',
      'The prose needs to show that the loop is not the model being confident: the runner-up "it" sits at 0.32 and 0.34 right under the winners at 0.48 and 0.46, and still never gets picked.',
      'A reader asks why the same prompt keeps giving the same text under greedy settings; with no draw anywhere, the replay here runs step for step as before.',
    ],

    avoidWhen: [
      'The logits are example values for a six-token model that sees only the previous token, so the article should not quote 0.81, 0.48 or 0.46 as numbers from any real model.',
      'The article is about whether a greedy choice gives the best-scoring overall output. There is no end mark and no overall score on this screen; it is about the wording, not the score.',
      'The subject is a fix for repetition — penalties, temperature, sampling, beam width. The rule here is never changed, so no remedy is shown working.',
      'The topic is repetition caused by long context or training data — copying a pattern from the prompt, or memorised text. Here the only memory is one token back.',
    ],

    contrastWith: [
      {
        concept: 'greedyDecoding',
        note: 'Both apply the same top-choice rule, but one asks whether the chosen steps add up to the likeliest sentence overall, while this asks only what the rule makes the wording do once a token returns.',
      },
      {
        concept: 'penalizeRepeats',
        note: 'This is the cycle and that is one remedy for it: lowering the score of tokens already used means a token that has come back no longer ranks the old continuation first, so a return stops forcing a replay.',
      },
      {
        concept: 'flattenOrSharpen',
        note: 'A sharpened distribution drifts toward this very behaviour, since in the limit only the top token survives; flattening gives the runner-up a real chance, which is what the cycle here never allows.',
      },
      {
        concept: 'temperatureSampling',
        note: 'Drawing by chance means returning to the same token need not mean taking the same path, while the rule here is fixed, so a return commits the text to a replay.',
      },
      {
        concept: 'carrySeveralLines',
        note: 'Keeping several candidate lines widens what is considered at each step, yet still ranks deterministically; this is the single-line case, where the runner-up is dropped at every step and nothing is held in reserve.',
      },
    ],
  },
};
