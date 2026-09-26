/**
 * attendToAllAtOnce 개념 선언.
 *
 * canonical facet 은 `facet:attendToAllAtOnce` — 자리 1..5 의 토큰 A · B · C · D · E 가 서로를 보는 25 짝의 점수가 한 걸음에,
 * 다섯 줄의 softmax 가 한 걸음에, 결과 다섯이 한 걸음에 선다. 자리 1 의 A 가 가장 크게 보는 것은 가장 먼 E(0.66)이고 바로 옆 B 는 0.00.
 * 가장 먼 짝 A–E 에 닿는 데 든 층도, 바로 옆 A–B 에 닿는 데 든 층도 1. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `selfAttention`(완제품)은 머리를 어떻게 무리 짓느냐를, `queryKeyValue` 는 역할의 갈라짐을, `attentionWeights` 는 한 줄의
 * 무게 나눔을, `orderMustBeAdded` 는 차례를 모른다는 것을 맡는다. 이쪽의 주장은 **닿는 데 드는 걸음이 거리와 무관하다**는 하나다.
 * 그래서 definition 은 parallel · one step · distance · reached · in between 쪽 낱말을 쥐고, 무게의 합 · 가중합 · 자리를 뒤바꿈 ·
 * 머리 같은 말을 넣지 않는다. `orderMustBeAdded` 와 헷갈리기 쉽다 — 그쪽은 "차례를 모른다", 이쪽은 "차례대로 거치지 않는다".
 *
 * 전제 (설명 글 `attendToAllAtOnce.md`): 투영을 생략했다(q = k = v = x) — 그래서 점수 표가 대각선을 두고 마주 같다.
 * 점수는 q·k / √2, softmax 는 최댓값을 빼고 셈한다. 입력 · 차원 2 · 토큰 다섯은 예로 정한 값이다. 층 하나 · 머리 하나.
 * 셈에 자리 번호는 들어가지 않는다 — 자리는 거리를 말할 때만 쓴다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const attendToAllAtOnceConcept: FacetConceptSource = {
  id: 'attendToAllAtOnce',
  label: 'Attention Reaches Every Token in One Step',
  canonicalFacet: 'facet:attendToAllAtOnce',

  surface: {
    definition:
      'Self-attention scores every pair of tokens in one parallel step, so a token four places away is reached as directly as its neighbour, without passing through the tokens in between.',
    exemplarKeywords: [
      'attention is parallel',
      'no recurrence in the Transformer',
      'long-range dependencies',
      'constant path length between positions',
      'O(1) sequential operations',
      'n² attention pairs',
      'attention matrix n × n',
      'Transformer vs RNN',
      'Attention Is All You Need',
      'distant words in a sentence',
    ],
  },

  briefing: {
    observable: [
      'Five tokens A, B, C, D, E stand at positions 1 to 5, each with a two-number vector: (1, 2), (-2, -1), (-2, -2), (-1, 1), (2, 2). The tokens appear once under "Query" and once under "Key · value", each with its "Position". Counters read "Pairs scored: 0 · Layers done: 0" and the caption "Tokens: 5. No pair scored yet."',
      'In one step 25 lines grow from the five queries to the five keys on the same clock; the long diagonal A–E arrives at the same moment as the straight A–A. The 5 × 5 score table below fills all at once, and the caption reads "Every pair scored in a single step. Pairs: 25". The counters show 25 pairs and 1 layer.',
      'Next all five rows become weights together ("Every row turned into weights in a single step. Rows: 5") and each line\'s thickness follows its weight. The row for A reads 0.32, 0.00, 0.00, 0.02, 0.66, with the note "A weighs E most: position 5, distance 4, weight 0.66 · adjacent B: 0.00".',
      'In the last step all five results form at once ("Every result mixed in a single step. Results: 5"); A\'s result is (1.62, 1.98), and none waits for another. The closing note reads "Layers to reach the farthest pair A–E: 1 · the adjacent pair A–B: 1". The layer counter has counted each stage — scores, weights, results — once, ending at 3.',
      'The score table is symmetric across its diagonal because the projections are left out: query, key and value are the input itself. Scores are q·k divided by √2. The vectors, dimension 2 and five tokens are example values, and there is one layer with one head. Position numbers never enter the computation; they are used only to state distances. Weights shown as 0.00 are not zero. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its four steps by itself on mount — start, scores, weights, results — and stops.',
        'Beneath it are a Replay button and a playback strip. After the run, dragging back to the scores step holds the moment when the A–E and A–B lines have both just arrived.',
        'The tokens and vectors are fixed, so an article can cite the 0.66 weight on the farthest token and the 1-layer reach for both pairs.',
      ],
    },

    useWhen: [
      'The article claims attention handles long-range dependencies better than a recurrent network and needs to show that the farthest pair costs the same single step as the adjacent one.',
      'A reader asks why Transformers train in parallel, and the article wants every pair of a sequence to be scored at the same moment with no token waiting for another.',
    ],

    avoidWhen: [
      'The article is about attention cost growing with sequence length, memory limits or efficient attention variants. The screen counts 25 pairs but says nothing about cost.',
      'The subject is causal masking in decoding, where a token may not see later ones. Every token here sees all five.',
      'The point is that attention cannot tell word order apart. Positions are named here to measure distance, but reordering is not shown.',
    ],

    contrastWith: [
      {
        concept: 'carryHiddenState',
        note: 'A recurrent network reaches an earlier token only through the state passed along every step in between. Attention compares any two tokens directly, so distance adds no steps.',
      },
      {
        concept: 'unrolledRnn',
        note: 'In a recurrent chain, influence across a long distance is a product of per-step factors that can fade. A direct pairwise score has no chain to fade along, whatever the distance.',
      },
      {
        concept: 'orderMustBeAdded',
        note: 'Both follow from attention not walking through the sequence. Reaching far tokens directly is the gain; losing any sense of which token came first is the cost that has to be repaired separately.',
      },
      {
        concept: 'attentionWeights',
        note: 'Scoring all pairs at once is about when and how directly tokens meet. What each row then does with its scores — split one whole among values and blend them — is the same per-row computation either way.',
      },
      {
        concept: 'dontRecountThePast',
        note: 'Processing a whole sequence in parallel applies when every token is present, as in training or reading a prompt. Generating one token at a time is sequential again, and reusing earlier keys and values is how that phase avoids repeated work.',
      },
    ],
  },
};
