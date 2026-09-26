/**
 * orderMustBeAdded 개념 선언.
 *
 * canonical facet 은 `facet:orderMustBeAdded` — 토큰 셋 A (1, 0) · B (0, 1) · C (1, -2). 줄 A B C 에서 A 의 결과 (0.80, -0.60),
 * C B A 로 뒤바꿔도 무게가 토큰을 따라 옮겨 결과 (0.80, -0.60), 차이 0.00. 자리마다 PE(p) = (sin p, cos p) 를 더하면 A B C 에서
 * (0.98, 1.05), C B A 에서 (1.60, -0.38), 차이 1.56. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `positionalEncoding` 은 표시를 더한다는 것을 전제로 두고 **그 표시의 주파수가 먼 자리를 가르는가**를 손잡이로 가른다.
 * 이쪽은 그 앞의 한 장면 — **어텐션 혼자서는 차례를 모르고, 자리마다 다른 벡터를 더해야 안다**. 그래서 definition 은
 * reorder · set · unchanged · position-dependent vector · added 쪽 낱말을 쥐고, 완제품이 쥔 frequency · dimension · gap ·
 * most similar 를 쓰지 않는다. `attendToAllAtOnce`(차례대로 거치지 않는다)와도 가른다 — 이쪽은 차례를 **모른다**는 것이다.
 *
 * 전제 (설명 글 `orderMustBeAdded.md`): 투영을 생략했다(q = k = v = x) — 투영을 두어도 차례를 모르는 성질은 같다.
 * 입력 · 토큰 수 · 차원 2 는 예로 정한 값, 점수는 √2 로 나눈다. 차원이 2 라 주파수가 하나뿐이다(교과서 식에서 i = 0 만 남아
 * (sin p, cos p)). 한 층, 어텐션 한 번 — 마스크 · 잔차 · 층 정규화 없음.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const orderMustBeAddedConcept: FacetConceptSource = {
  id: 'orderMustBeAdded',
  label: 'Attention Ignores Order Until Positions Are Added',
  canonicalFacet: 'facet:orderMustBeAdded',

  surface: {
    definition:
      'Attention alone treats its tokens as an unordered set: reordering them leaves each token\'s output unchanged, and only adding a position-dependent vector to each input makes the order change the result.',
    exemplarKeywords: [
      'permutation invariance of self-attention',
      'permutation equivariance',
      'why Transformers need positional encoding',
      'attention has no notion of word order',
      'bag of words problem',
      'shuffle the tokens, same output',
      'add positional encoding to embeddings',
      'add vs concatenate positional encoding',
      'order-agnostic',
    ],
  },

  briefing: {
    observable: [
      'On the left three columns are headed Position 0, Position 1 and Position 2. The "Original order" row holds A, B, C with inputs x (1.00, 0.00), (0.00, 1.00), (1.00, -2.00). On the right a small plane will mark the result for A. The caption reads "Order: A B C. No position marks yet."',
      'A attends to the row: under "Weights from A" appear 0.40, 0.20, 0.40, and the caption reads "In order A B C, result for A: (0.80, -0.60)".',
      'A "Swapped order" row settles below with A and C exchanged: C, B, A. A\'s weights follow the tokens — 0.40 to C, 0.20 to B, 0.40 to A — and its result is again (0.80, -0.60). The two result points sit on top of each other, and the caption ends "Difference: 0.00".',
      'Each position then gets a mark, "Each position gets a mark PE(p) = (sin p, cos p)": PE (0.00, 1.00), PE (0.84, 0.54), PE (0.91, -0.42) at the heads of the columns.',
      'The marks drop into the cells and the inputs become x + PE. In the original order A is (1.00, 1.00), B (0.84, 1.54), C (1.91, -2.42); weights from A become 0.40, 0.53, 0.07 and the result (0.98, 1.05). In the swapped order C is (1.00, -1.00), B (0.84, 1.54), A (1.91, -0.42); weights 0.23, 0.09, 0.68 and the result (1.60, -0.38). The same A is now a different vector at position 0 and at position 2.',
      'The last caption reads "Difference between the two results: 1.56 · Without marks: 0.00", and the two points on the plane have separated. The run is seven steps counting the opening screen.',
      'Projections are left out, so query, key and value are the input itself; with projections attention would still ignore order. The inputs, three tokens and dimension 2 are example values, scores are divided by √2, and with dimension 2 the encoding has only one frequency. One layer, one attention computation, no masking. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its seven steps by itself on mount and stops with the difference 1.56 beside the unmarked 0.00.',
        'Beneath it are a Replay button and a playback strip. After the run, dragging back and forth across the step where the marks are added shows the two coinciding result points split apart.',
        'The tokens, marks and results are fixed, so an article can quote both results for each order and the two differences exactly.',
      ],
    },

    useWhen: [
      'The article states that self-attention is permutation-invariant and needs the reader to see a shuffled sequence give the identical output for a token, down to a difference of 0.00.',
      'A reader asks why a Transformer needs positional encoding at all, and the article wants the same shuffle to produce different results once a per-position vector has been added to each input.',
    ],

    avoidWhen: [
      'The article is about choosing among positional schemes — sinusoidal frequencies, learned embeddings, RoPE or relative bias. A single one-frequency mark is used here only to show that some mark is needed.',
      'The subject is causal masking, which also breaks the symmetry between positions. No mask appears here.',
      'The point is that attention reaches distant tokens directly. Distance is not measured here; only the order of three tokens changes.',
    ],

    contrastWith: [
      {
        concept: 'positionalEncoding',
        note: 'That attention needs a position signal is the starting point. Whether a sine-cosine signal keeps far-apart positions distinct depends on how many frequencies it has, a separate question about the signal\'s design.',
      },
      {
        concept: 'attendToAllAtOnce',
        note: 'Scoring every pair directly is what frees attention from walking through a sequence. The same property means nothing in the computation records which token came first, so order has to be supplied from outside.',
      },
      {
        concept: 'carryHiddenState',
        note: 'A recurrent network is order-aware by construction: each step builds on the state left by the one before, so reordering the inputs changes the outputs. Attention has no such state and needs order written into its inputs.',
      },
      {
        concept: 'queryKeyValue',
        note: 'Projecting inputs into queries, keys and values applies the same matrices to every token regardless of position, so those projections do not introduce order either.',
      },
    ],
  },
};
