/**
 * queryKeyValue 개념 선언.
 *
 * canonical facet 은 `facet:queryKeyValue` — 토큰 셋 A · B · C 의 입력 x 가 세 행렬을 지나 물음 q · 열쇠 k · 값 v 로 갈라진다.
 * 묻는 토큰은 C 하나다. q_C = (-2.00, 3.00) 이 열쇠 셋과 맞춰져 점수 A -2.83 · B 4.24 · C 1.41, 무게 A 0.00 · B 0.94 · C 0.06.
 * C 로 옮겨 오는 것은 (2.88, 0.94) — x_B 도 k_B 도 아닌 v_B (3.00, 1.00) 에 가깝다 (거리 2.89 · 3.07 · 0.13). 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 같은 묶음의 `selfAttention`(완제품)은 같은 행렬을 머리 하나 · 둘로 읽을 때 갈리는 것을, `attentionWeights` 는 무게가 여럿에게
 * 나뉘어 값이 쌓이는 것을, `attendToAllAtOnce` 는 모든 토큰이 한꺼번에 묻는 것을 맡는다. 이쪽의 주장은 **맞춰 보는 데 쓴 것(열쇠)과
 * 실제로 가져오는 것(값)이 다른 벡터**라는 하나다. 그래서 definition 은 one input · three matrices · matched · carried back ·
 * not the key 쪽 낱말을 쥐고, 가중합의 모양(sum to one · blend)이나 머리 · 한꺼번에 같은 말을 넣지 않는다.
 *
 * 전제 (설명 글 `queryKeyValue.md`): 입력 · 행렬 · 차원 2 는 예로 정한 값이다(배운 값이 아니다). 벡터는 행 벡터, 행렬은 오른쪽에서
 * 곱한다. softmax 는 최댓값을 빼고 셈한다. 어텐션 한 번 — 여러 머리 · W_O · 잔차 · 층 정규화 없음. 거리는 유클리드.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const queryKeyValueConcept: FacetConceptSource = {
  id: 'queryKeyValue',
  label: 'Query, Key and Value (Match by Key, Fetch the Value)',
  canonicalFacet: 'facet:queryKeyValue',

  surface: {
    definition:
      'One input vector is multiplied by three separate matrices into a query, a key and a value; the query is matched against keys, but what gets carried back is the value, not the key.',
    exemplarKeywords: [
      'query key value',
      'Q, K, V',
      'W_Q, W_K, W_V projection matrices',
      'what are queries, keys and values',
      'why are key and value different vectors',
      'attention as a soft dictionary lookup',
      'retrieval analogy for attention',
      'q = xW_Q',
      'linear projections in attention',
    ],
  },

  briefing: {
    observable: [
      'Three tokens A, B, C stand in columns, each with an input x: (1.00, 0.00), (0.00, 1.00), (1.00, 1.00). Rows below are labelled "query  q = x·WQ", "key  k = x·WK", "match  q·k / √dk", "value  v = x·WV" and "result  Σ w·v"; C carries an "asks" tag.',
      'Only C asks, so only C gets a query: "C asks with qC = xC·WQ: (-2.00, 3.00)". Then keys appear for every token — (2.00, 0.00), (0.00, 2.00), (2.00, 2.00) — and then values for every token — (-2.00, -1.00), (3.00, 1.00), (1.00, 0.00). The same x has become three different vectors.',
      'Matching reads "-4.00 / √2 = -2.83", "6.00 / √2 = 4.24" and "2.00 / √2 = 1.41" under A, B and C. Softmax turns these into 0.00, 0.94 and 0.06, with the caption "Best-matching key: kB. Sum of weights: 1.00".',
      'The last step carries a result into C: "Arrives at C: Σ w·v = (2.88, 0.94)". Beside B\'s three vectors the screen gives the distance from this result to each: x_B 2.89, k_B 3.07, v_B 0.13. What arrived is close to B\'s value and far from the key that won the match.',
      'The run is seven steps counting the opening screen: input, query, keys, values, match, weights, fetch.',
      'The matrices, the inputs and the dimension 2 are example values, not learned ones. Vectors are rows multiplied by matrices on the right. A\'s weight shows as 0.00 but is not zero (about 0.0008). There is a single attention computation, with no multiple heads, output matrix, residual or normalization. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays the seven steps by itself on mount and stops once the result has arrived at C.',
        'Beneath it are a Replay button and a playback strip. After the run, dragging back to the keys step and then to the values step shows B\'s two vectors appearing separately from the same input.',
        'All numbers are fixed, so an article can quote q_C, the three scores, the weight 0.94 and the three distances exactly.',
      ],
    },

    useWhen: [
      'A reader has met Q, K and V as three letters and wants to know why there are three, and in particular why the vector used for matching is not the one that gets returned.',
      'The article uses the search-engine or dictionary analogy for attention and needs a concrete case where the key that wins the match and the content delivered are visibly different vectors.',
    ],

    avoidWhen: [
      'The article is about how weights are spread across many tokens and blended. Here one key takes almost all the weight, so the blending barely shows.',
      'The subject is every token querying at once or the full attention matrix. Only C asks here, one row of the computation.',
      'The point is cross-attention, where queries come from one sequence and keys and values from another. All three roles here come from the same three tokens.',
    ],

    contrastWith: [
      {
        concept: 'attentionWeights',
        note: 'Splitting one input into roles explains what is compared and what is delivered. How the comparison scores turn into a whole divided among several values, and why the result sits between them, is the next question.',
      },
      {
        concept: 'selfAttention',
        note: 'The three roles are fixed by three matrices per token. Multi-head attention takes those projections as given and asks how their columns should be grouped when scoring.',
      },
      {
        concept: 'angleNotLength',
        note: 'Cosine similarity scores a match by direction alone and returns the item it matched. Attention scores with an unnormalised dot product, and what it returns is a separate value vector rather than the key that scored.',
      },
      {
        concept: 'dontRecountThePast',
        note: 'Caching keys and values during generation relies on each token\'s key and value being fixed once its input is known. Why a token needs a key and a value in the first place, and why they differ, comes before that saving.',
      },
    ],
  },
};
