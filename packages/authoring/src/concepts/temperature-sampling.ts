/**
 * temperatureSampling 개념 선언.
 *
 * canonical facet 은 `facet:temperatureSampling` — 완제품이다. 프롬프트
 * `I like cats. I like dogs. I like` 뒤에 올 후보 일곱의 로짓이 왼쪽 두 기둥에 서고,
 * 가운데 0 부터 1 까지의 줄이 후보 차례대로 몫만큼 칸으로 나뉜다. 줄 위에 박힌 핀
 * 서른이 난수 서른 개이고, 뽑기마다 핀에서 점이 떨어져 칸을 짚고 그 후보의 더미로
 * 쌓인다. 손잡이 둘(온도 0.25 · 0.5 · 1 · 2, 되풀이 벌점 1 · 1.5 · 2.5)을 옮기면 같은
 * 난수 서른 개가 새 칸으로 다시 떨어지고, 앞 판의 더미가 점선 윤곽으로 남는다.
 * 계기 셋(1 등 % · 가짓수 · 되풀이)과 코드 패널이 있다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 개념이 홀로 맡는 것은 **뽑기가 여러 번 되풀이되는 시간 축**과 **두 손잡이가 서로
 * 얽히는 것**이다 — 벌점 2.5 아래에서는 온도를 올릴수록 되풀이가 는다 (1 → 3 → 9 → 10).
 * definition 의 주어는 "다음 낱말을 무작위로 뽑아 글을 잇는 일" 이고 꼬리는 "한 손잡이가
 * 다른 손잡이의 효과를 뒤집는다" 다.
 *
 * 어휘는 형제에게 넘겼다 — 확률 모양의 어휘(softmax · logit · 쏠림 · 퍼짐 · 차례)는
 * `flattenOrSharpen` 이, 깎는 식의 어휘(부호 · 나눔 · 곱함 · 이미 나온 말 · 1 등 교체)는
 * `penalizeRepeats` 가 가져갔다. 두 조각에는 뽑기가 없으므로 draw · random · sample 은
 * 여기서만 쓴다 (기계 확인: 두 조각 definition 에 0 건).
 *
 * ── 전제
 *
 * 로짓 일곱은 예로 정한 값이다. 씨앗은 1 하나로 고정이라 화면의 모든 셈(되풀이 30 · 26 …)
 * 은 이 난수 서른 개에 묶여 있다. 벌점은 곱셈형 한 가지다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const temperatureSamplingConcept: FacetConceptSource = {
  id: 'temperatureSampling',
  label: 'Temperature Sampling (Two Dials over Repeated Draws)',
  canonicalFacet: 'facet:temperatureSampling',

  surface: {
    definition:
      'Generating text by drawing each next word at random in proportion to its chance, where temperature and a repetition penalty interact: moving one dial can reverse what the other does to variety.',
    exemplarKeywords: [
      'temperature sampling',
      'sampling from a language model',
      'stochastic decoding',
      'LLM temperature setting',
      'why the output is different every time',
      'the model keeps repeating itself',
      'creativity versus coherence',
      'random seed and reproducible generation',
      'tuning temperature together with a repetition penalty',
      'generation parameters in an API call',
    ],
  },

  briefing: {
    observable: [
      'Thirty pins stand on the line from zero to one, one for each random number, and they never move: a note above them says every round reuses the same thirty numbers, seed 1. When a dial moves, the dots already piled up fly back to their own pins and fall again, so only the boundaries of the cells have changed.',
      'Each draw drops one dot from a pin onto the cell beneath it and carries it to that word\'s pile, while the counters for kinds drawn and for repeats rise draw by draw.',
      'With both dials at their opening values (temperature 1, penalty 1) the thirty draws land as cats 12, dogs 12, birds 2, fish 3, pizza 1 — five kinds, 24 of the thirty being words the prompt already said, with a top share of 33%.',
      'With no penalty, lowering the temperature to 0.25 leaves only cats and dogs — 24 and 6 — so all thirty draws repeat the prompt; raising it to 2 gives six kinds and 18 repeats.',
      'Raising the penalty sinks only cats and dogs on the left column — the two words marked "already said" beneath their piles — and birds takes first place at 1.5 and at 2.5.',
      'At penalty 2.5 the dial that reduced repeats now adds them: repeats read 1, 3, 9 and 10 as the temperature goes 0.25, 0.5, 1, 2, while at penalty 1 the same sweep read 30, 26, 24, 18.',
      'After the first round each pile shows a dashed outline with the previous round\'s count beside it, so the effect of a single dial change is read as the difference between two piles.',
      'The seven scores are invented for the example and are not the output of any real model; the counts on screen depend on this one fixed seed, and another seed would scatter them differently.',
    ],

    screen: {
      affordances: [
        'The screen plays a whole round — penalty, temperature, shares, thirty draws, tally — and then waits for a dial to move, replaying with the same thirty random numbers each time.',
        'Two segmented dials: temperature at 0.25, 0.5, 1 and 2 (opening at 1) and repetition penalty at 1, 1.5 and 2.5 (opening at 1), next to playback controls for running, stepping, pausing, resetting and speed.',
        'Three live counters read the top share as a percentage, the number of kinds drawn, and the number of draws that repeated a word from the prompt.',
        'A code panel beneath the stage shows the same penalty, temperature and draw procedure, and highlights the part being carried out.',
      ],
    },

    useWhen: [
      'An article advises turning temperature up to make a model stop repeating itself, and the reader needs to see that this holds without a penalty (30 repeats falling to 18) but runs backwards once a strong penalty is on (1 rising to 10).',
      'A reader thinks randomness is what makes two settings give different outputs; here the thirty random numbers are pinned in place and only the cell boundaries move, so every difference between rounds is the dials\' doing.',
      'The prose has to show that a single sampled answer says little and a batch of draws says more, and the piles with their counts make the spread of thirty outcomes visible at once.',
    ],

    avoidWhen: [
      'The article concerns frequency or presence penalties that subtract an amount growing with how often a word appeared. The penalty here divides a positive score once, regardless of count.',
      'The subject is top-k, nucleus or min-p truncation. Every one of the seven candidates keeps a cell here, however thin.',
      'The article treats temperature zero or fully deterministic output as the case in point; the lowest setting here is 0.25 and every round is still a draw.',
      'The text needs figures from a real model. All seven scores are chosen for the example, the words are whole words split on spaces rather than subword tokens, and every count is tied to one fixed seed.',
    ],

    contrastWith: [
      {
        concept: 'flattenOrSharpen',
        note: 'Reshaping the distribution is one input to this; the claim here only begins when draws are taken from it, and changes again once a second control interferes with the first.',
      },
      {
        concept: 'penalizeRepeats',
        note: 'Lowering the scores of words already used is one dial here; on its own it settles which word ranks first, while combined with random draws its strength decides how the other dial behaves.',
      },
      {
        concept: 'greedyDecoding',
        note: 'Taking the most likely word every time yields one fixed continuation; drawing in proportion to probability yields a spread of continuations whose breadth becomes something to tune.',
      },
      {
        concept: 'topKTopP',
        note: 'Truncation decides which candidates may be drawn at all; this keeps every candidate eligible and changes only how much probability each one holds.',
      },
      {
        concept: 'beamSearch',
        note: 'Keeping several high-scoring continuations is still a search for the best text; drawing at random deliberately gives up that aim in exchange for variety.',
      },
    ],
  },
};
