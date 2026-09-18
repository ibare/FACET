/**
 * speculativeDecoding 개념 선언.
 *
 * canonical facet 은 `facet:speculativeDecoding` — 완제품이다. 한가운데 줄이 열여섯 자리의
 * 글이고, 그 아래로 작은 모형의 초안이 커서에서 앞으로 뻗는다. 큰 모형이 훑으면 맞은 앞부분은
 * 위로 올라가 글에 붙고 틀린 자리부터는 바닥에 쌓이며, 글 위 괄호 하나가 검사 한 번이다.
 * 손잡이 γ 를 0 · 1 · 2 · 4 · 8 로 옮기면 검사 16 · 9 · 7 · 5 · 5, 버린 초안 0 · 2 · 4 · 6 · 19,
 * 비용 80 · 54 · 48 · 42 · 55 — 아래 장부의 막대가 U 를 그린다. 코드 패널이 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 형제 조각 `draftThenVerify` 는 **한 판** 을 맡는다 — 큰 모형 한 번이 초안 전부를 함께
 * 판정하는 방식. 이 개념이 홀로 맡는 것은 **초안을 얼마나 길게 둘 것인가** 라는 조율이다.
 * 주어의 층위를 갈랐다: 저쪽 주어는 "한 번의 부름", 이쪽 주어는 "여러 설정을 가로지르는 선택".
 * 어휘도 배타로 나눴다 — 저쪽의 single · pass · judges · together · agrees · leading run 은
 * 이쪽 definition 에 0 건, 이쪽의 how many · longer · waste · cost · lowest · middle 은 저쪽에 0 건.
 *
 * ── 전제
 *
 * 글과 작은 모형의 추측은 예로 정한 자료이고 (틀린 자리 넷: 3 · 6 · 10 · 14 번째), 비용 비
 * 1 : 5 도 예다. 판정은 탐욕 판정뿐이고 확률 비로 받는 표본 규칙은 화면 밖이다. 낱말 하나를
 * 토큰 하나로 친다. 이 셋을 avoidWhen 과 observable 에 밝혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const speculativeDecodingConcept: FacetConceptSource = {
  id: 'speculativeDecoding',
  label: 'Speculative Decoding (How Far Ahead to Draft)',
  canonicalFacet: 'facet:speculativeDecoding',

  surface: {
    definition:
      'Tuning speculative decoding: how many tokens a small model should propose per round, since longer proposals save big-model calls but waste more guesses, leaving total cost lowest at a middle length.',
    exemplarKeywords: [
      'speculative decoding',
      'draft length gamma',
      'choosing the number of speculative tokens',
      'draft model and target model',
      'assisted generation',
      'LLM inference speedup',
      'acceptance rate of the draft model',
      'wasted draft tokens',
      'cost of the small model is not free',
      'why a longer draft stops helping',
    ],
  },

  briefing: {
    observable: [
      'The middle row holds the sixteen places of the text, with places not yet written shown dashed. Beneath it the small model\'s guesses stretch forward from the cursor in orange, one round at a time.',
      'After each check the matching front of the guesses rises into the text, everything from the first wrong place onward drops to the floor and piles up under the place it was guessed for, and the big model\'s own word lands from above at the wrong place.',
      'One bracket above the text is one big-model check, so the number of brackets is the number of checks. When the handle moves, the previous setting\'s row of brackets steps up one line and stays beside the new run for comparison.',
      'Across the settings 0, 1, 2, 4 and 8 the checks read 16, 9, 7, 5 and 5, the guesses thrown away read 0, 2, 4, 6 and 19, and the cost reads 80, 54, 48, 42 and 55. Going from 4 to 8 buys no further saving in checks and more than triples the waste.',
      'The ledger at the bottom keeps a bar for every setting that has been played, so turning the handle through all five leaves a U of cost with its floor at 4. The closing caption also gives words per check, which climbs from 1.00 to 3.20 and then stays put.',
      'The small model misses at four places in this sentence — "has" for "will", "Friday" for "Monday", "plan" for "budget", "school" for "fiscal" — and the rounds are cut at exactly those places whatever the setting.',
      'Every number here is chosen for the example: the sentence, the small model\'s guesses and the cost ratio of 1 per guessed word to 5 per check are not the output or price of any real model, and the ledger says the ratio is an example.',
    ],

    screen: {
      affordances: [
        'The screen opens at a setting of 0, plays that run by itself — sixteen checks, one word each — and then waits for the handle.',
        'A segmented handle labelled "Draft length γ" with the positions 0, 1, 2, 4 and 8; each move plays a full run for that setting.',
        'Playback controls for running, stepping, pausing, resetting and changing speed, next to three live counts: big-model checks, drafts thrown away, and cost.',
        'The code panel titled "Speculate and check" starts empty with a "+ Add language" button offering Python, JavaScript, TypeScript, Java, C++ and C#; at most two sit side by side.',
      ],
    },

    useWhen: [
      'The article presents speculative decoding as "the longer the draft, the faster", and the reader needs to see the gain stop: past a setting of 4 the checks stay at five while the thrown-away guesses jump from 6 to 19.',
      'A reader has to pick a value for the draft-length parameter and asks what it depends on; the U in the ledger ties the answer to how often the small model misses and to what its guesses cost relative to a check.',
      'The prose argues that the small model\'s work is part of the bill, and the reader needs a total in which the savings and the waste are summed on one scale rather than reported separately.',
    ],

    avoidWhen: [
      'The article is about the acceptance rule that keeps the output distribution identical to the big model\'s — accepting by a ratio of probabilities and resampling on rejection. The screen only accepts a guess when it is the same word.',
      'The subject is measured wall-clock speed or the real price of particular models. The cost ratio and the guesses are invented for the example, and a check is charged the same no matter how many guesses it covers.',
      'The article is about variants that draft with extra heads or from a lookup of earlier text, or that branch into a tree of guesses. Here one small model proposes one straight line.',
      'The text uses "speculative" for speculative execution in processors. The word matches and the subject does not.',
    ],

    contrastWith: [
      {
        concept: 'draftThenVerify',
        note: 'One is the mechanism of a single round — why one call can settle several proposed tokens; this is the dial on top of it, asking how many to propose before the discarded remainder costs more than the calls it saves.',
      },
      {
        concept: 'greedyDecoding',
        note: 'Greedy decoding fixes which token comes next; this leaves that choice to the big model and changes only how many of its calls it takes to reach the same text.',
      },
      {
        concept: 'kvCache',
        note: 'Both cut the price of producing text token by token, but one avoids recomputing what came before within each call, while this reduces how many calls to the large model are made at all.',
      },
      {
        concept: 'batchingAndPadding',
        note: 'Both trade some wasted work for fewer or fuller trips through a large model, but one fills the trip with several requests side by side, and this fills it with several guessed positions of one request.',
      },
    ],
  },
};
