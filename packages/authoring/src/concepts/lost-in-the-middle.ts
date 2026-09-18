/**
 * lostInTheMiddle 개념 선언.
 *
 * canonical facet 은 `facet:lostInTheMiddle` — 조각이다. 맥락은 가로로 선 일곱 칸이고,
 * 금문교가 언제 열렸는지 묻는 질문 아래에서 답 조각 하나가 자리 1 · 4 · 7 로 옮겨 간다.
 * 칸마다 가까운 끝까지 거리가 있고, 카드의 가라앉음과 흐림은 그 거리 하나로만 정해진다.
 * 스스로 한 바퀴 재생하고 그 뒤로는 한 걸음씩 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **글은 그대로이고 자리만 바뀐다** 는 주장이다. definition 의
 * 주어는 바뀌지 않는 한 조각이고, front · middle · end · overlook 을 쥔다. 개수나 몫에
 * 관한 낱말(window · instructions · reply · fit · allowance · how many)과 완제품의
 * prompt · sequence · buries · alternating 은 쓰지 않았다. 기계로 확인했다.
 *
 * 꼬리는 형제와 엇갈린다 — 여기서는 **개수가 그대로이고 자리만 바뀌며**,
 * `budgetRunsOut` 은 개수가 바뀌고 차례는 따지지 않는다.
 *
 * ── 전제
 *
 * 가운데를 놓치기 쉽다는 것은 여기서 셈한 것이 아니라 실측 연구(Liu 외 2023)가 여러
 * 모형에서 보고한 경향이다. 흐려짐은 거리의 단조 함수로 그린 그림이지 측정값이 아니다.
 * observable 과 avoidWhen 에 밝혔다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lostInTheMiddleConcept: FacetConceptSource = {
  id: 'lostInTheMiddle',
  label: 'Lost in the Middle (Same Chunk, Different Position)',
  canonicalFacet: 'facet:lostInTheMiddle',

  surface: {
    definition:
      'One unchanged answer chunk moved from the front of a model\'s input through the middle to the end changes nothing but its distance to the nearer end, and models tend to overlook what sits in the middle.',
    exemplarKeywords: [
      'lost in the middle',
      'position bias in long context',
      'U-shaped performance curve',
      'primacy and recency in language models',
      'the model ignored the relevant document',
      'needle in a haystack',
      'where to put the most important information',
      'long context retrieval failure',
      'relevant passage buried mid-context',
      'Liu et al. 2023',
    ],
  },

  briefing: {
    observable: [
      'The question "When did the Golden Gate Bridge open?" sits above seven cards laid left to right, with the left edge labelled as the front of the context and the right edge as its end.',
      'The answer card, "The bridge opened in 1937.", is placed first in slot 1, then slot 4, then slot 7; the other six cards keep their own order and shift one slot at a time to make room.',
      'Every slot has a distance to the nearer end, and a card\'s depth, blur and fading follow that distance alone: equal distances look the same, larger ones sink lower and blur more. In slot 4 the answer card drops into the bottom of the valley and blurs; in slot 7 it rises and comes back sharp.',
      'Each slot the answer has tried leaves a marker underneath, and in the last step the three markers are labelled with their distances, 0, 3 and 0.',
      'Each placement is captioned with its slot and distance, followed by "a spot models tend to catch" at an end or "a spot models tend to miss" toward the middle. The closing line says the words were the same in all three slots and only the distance to an end changed.',
      'No accuracy, probability or attention figure appears anywhere. The blur is a drawing of a tendency reported in published measurements across several models, not a value computed from this example.',
    ],

    screen: {
      affordances: [
        'The screen plays through on its own — front, middle, end, then the comparison — and stops with the three labelled markers in place.',
        'Beneath it are a Replay button and a playback strip; dragging the handle to one placement holds the answer card in that slot so its depth and blur can be compared with the others.',
        'The seven sentences, their order and the three slots tried are fixed, so an article can quote the answer sentence and name the slot it is in.',
      ],
    },

    useWhen: [
      'An article reports that a model missed information that was plainly in its input and the reader suspects the retrieval. Here the text of the answer card never changes, only its slot, which isolates position as the variable.',
      'The prose introduces the U-shaped finding from long-context studies and needs something concrete to hang it on: a single card that sinks and blurs as it reaches the middle slot and recovers at either end.',
      'A reader needs a working definition of "the middle" that is not a feeling — distance to the nearer end, 0 at the front, 3 at the fourth of seven slots, 0 again at the back.',
    ],

    avoidWhen: [
      'The article needs a measured number — how much accuracy drops mid-context, for which model, at what length. The screen draws a reported tendency as blur and computes only slot and distance; it is not evidence of the size of the effect.',
      'The subject is how many passages fit into a model\'s input or what gets cut off. All seven cards are present throughout and nothing is dropped.',
      'The article uses "lost in the middle" for a different problem, such as a message dropped from the middle of a network stream or a list element lost during a merge. The words match and the subject does not.',
      'The subject is how a model attends to positions internally — positional encodings, attention patterns. Nothing inside a model is drawn here.',
    ],

    contrastWith: [
      {
        concept: 'contextAssembly',
        note: 'Here position is the only thing that moves, which makes the effect of position visible on its own; assembly lets the number of passages grow and shows that growth is what pushes an important passage toward the middle in the first place.',
      },
      {
        concept: 'budgetRunsOut',
        note: 'A passage that is shut out of the input is gone by rule; a passage that is inside but mid-way is only more likely to be missed, and that likelihood is a reported tendency rather than a rule.',
      },
      {
        concept: 'reranking',
        note: 'Rank says how relevant a passage is judged to be; position says where it lands in the input. Putting passages in rank order ties the two together, which is why a relevant passage with a middling rank can end up in the weakest spot.',
      },
    ],
  },
};
