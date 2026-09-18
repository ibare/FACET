/**
 * draftThenVerify 개념 선언.
 *
 * canonical facet 은 `facet:draftThenVerify` — 조각이다. "the quick brown fox" 가 레일 위에
 * 놓이고, 판마다 작은 모형의 초안 넷이 문장 끝 너머로 점선으로 미끄러져 나간다. 큰 모형 한 번이
 * 위에서 내려와 앞에서부터 훑어 ✓ · ✕ 를 달고, 처음 틀린 자리부터 뒤는 굴러 떨어지며 그 자리로
 * 큰 모형의 토큰이 내려앉는다. 세 판: 받은 초안 0 · 1 · 4, 붙은 토큰 +1 · +2 · +5. 끝은
 * "8 tokens from 3 large-model calls … Drafts accepted: 5 of 12". 스스로 한 바퀴 재생하고
 * 그 뒤로는 걸음을 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 완제품 `speculativeDecoding` 은 초안 길이를 몇으로 둘지 — 여러 설정을 가로지르는 조율과
 * 비용의 U — 를 맡는다. 이 조각이 홀로 맡는 것은 **한 번의 부름이 여러 토큰을 함께 판정하는
 * 방식** 이다. 주어 층위를 갈랐다: 이쪽 주어는 "큰 모형의 한 번", 저쪽은 "여러 판에 걸친 선택".
 * 어휘 배타도 기계로 확인했다 — 이쪽의 single · pass · judges · together · agrees · leading run 은
 * 저쪽 definition 에 0 건, 저쪽의 how many · longer · waste · cost · lowest · middle 은 여기 0 건.
 * 이 화면에는 길이 손잡이도 비용 수도 없으므로 그 낱말을 쓰지 않는 것이 정당하다.
 *
 * ── 전제
 *
 * 초안과 큰 모형의 토큰은 예로 정한 값이고, 낱말 하나 = 토큰 하나다. 판정은 탐욕 판정
 * (같으면 받는다) 뿐이라 난수가 없다 — 확률 비로 받는 규칙은 화면 밖이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const draftThenVerifyConcept: FacetConceptSource = {
  id: 'draftThenVerify',
  label: 'Draft, then Verify (One Call Settles Several Tokens)',
  canonicalFacet: 'facet:draftThenVerify',

  surface: {
    definition:
      'A small model writes several tokens past the end of the text, and a single pass of the large model judges them together, keeping the leading run that agrees and putting its own token where they first part.',
    exemplarKeywords: [
      'draft tokens checked in parallel',
      'verification step of speculative decoding',
      'one forward pass scores every drafted token',
      'accept the matching prefix',
      'rejected draft tokens are discarded',
      'bonus token when every draft is accepted',
      'at least one new token per call',
      'small model guesses, large model confirms',
      'why verifying is cheaper than generating one by one',
    ],
  },

  briefing: {
    observable: [
      'The sentence starts as "the quick brown fox" on a rail. Each round, four drafted tokens slide out beyond its end as dashed chips, ahead of anything the large model has produced.',
      'A single box labelled "large model · one call" comes down over all four at once and a cursor runs front to back, putting a tick under each drafted token that matches its own choice and a cross at the first that does not; nothing after the cross is examined.',
      'In the first round the very first draft is wrong: all four fall away and the large model\'s "jumps" takes their place, adding one token. In the second, "over" is kept, the other three fall, and "the" drops in, adding two.',
      'In the third round all four drafts match, so they attach and the same call also yields the next token, "away", adding five in one call.',
      'A tally at the top counts large-model calls and tokens added, and a bracket under each round\'s new stretch reads +1, +2 and +5. Kept drafts and the large model\'s tokens are coloured differently, as the legend shows, so the finished sentence shows where each word came from.',
      'The closing caption reads 8 tokens from 3 large-model calls against the 8 calls that one token per call would take, with drafts accepted 5 of 12.',
      'The drafts and the large model\'s choices are fixed values chosen for the example rather than output of real models, and a draft is accepted only when it is the identical word, so nothing on the screen is random.',
    ],

    screen: {
      affordances: [
        'The screen plays its three rounds by itself — draft, check, attach in each — and stops on the summary.',
        'A Replay button and a playback strip sit underneath. Once the run has finished, dragging the strip back to a check holds the ticks and cross in place before anything falls, so a single round can be read at rest.',
        'The prompt, the three sets of drafts and the large model\'s choices are fixed, so an article can quote any word, round or count on the screen.',
      ],
    },

    useWhen: [
      'The reader cannot see how a large model could confirm four tokens for the price of producing one; the single box coming down over all four drafts, with ticks laid out in one sweep, is the picture of that parallel check.',
      'The article needs to explain why a wrong guess costs nothing beyond itself — every round still gains at least one token, and the first round, where every draft falls, gains exactly as much as plain generation would.',
      'The prose has to justify throwing away drafts that might have been right, and the second round shows it: once "a" is refused, "lazy dog" was written after the wrong word and falls with it.',
    ],

    avoidWhen: [
      'The article is about the probabilistic acceptance rule — comparing the two models\' probabilities and resampling on rejection so the output matches the large model\'s distribution. Acceptance here is identical-word matching and involves no randomness.',
      'The subject is how many tokens to draft, or measured speed-ups and prices. The draft is always four, and the screen counts calls rather than time or money.',
      'The text is about drafting from extra prediction heads, from a lookup in earlier text, or as a tree of alternatives. One small model writes one straight line of four here.',
      'The words "draft" and "verify" refer to editing a document or confirming a user\'s identity. The terms coincide and the subject does not.',
    ],

    contrastWith: [
      {
        concept: 'speculativeDecoding',
        note: 'This is the reason the scheme can pay off at all — one call settling several proposed tokens — while the other is the question of how many to propose, once the discarded remainder is weighed against the calls it saves.',
      },
      {
        concept: 'greedyDecoding',
        note: 'Greedy decoding is the rule each check applies at every position — take the top choice; here that rule is applied to many positions in one call instead of one position per call.',
      },
      {
        concept: 'firstTokenVsRest',
        note: 'Both turn on how a single large-model call is priced, but one separates the heavy first call from the lighter ones that follow, while this makes one call count for several tokens.',
      },
      {
        concept: 'dontRecountThePast',
        note: 'Both save work in generating token by token, but one keeps earlier results so they are not computed again, and this checks guesses about later tokens so they need not be produced one call at a time.',
      },
    ],
  },
};
