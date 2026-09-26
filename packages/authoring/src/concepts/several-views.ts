/**
 * severalViews 개념 선언.
 *
 * canonical facet 은 `facet:severalViews` — 토큰 넷 A · B · C · D 한 줄에 머리 둘이 저마다의 W_Q · W_K · W_V(4×2)로 어텐션을 건다.
 * 머리 1 은 두 칸 건너의 짝(A→C · B→D · C→A · D→B)을, 머리 2 는 바로 옆의 짝(A→B · B→A · C→D · D→C)을 가장 크게 본다
 * (무게 0.45). 가장 큰 짝이 갈린 줄 4 / 4. 끝에 두 머리의 결과 두 칸씩이 토큰마다 네 칸으로 이어진다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `selfAttention`(완제품)과 가장 가깝다. 그쪽은 **같은 행렬의 열을 나누기만 할 때** 머리 하나의 동률이 풀린다는 대비를
 * 손잡이로 보이고, 이쪽은 **머리마다 제 행렬이 있어 같은 토큰에게 다른 짝을 고른다**는 한 장면이다. 그래서 definition 은
 * own matrices · different partner · concatenated · both relations 쪽 낱말을 쥐고, 완제품이 쥔 same columns · split ·
 * tie · weight count 를 쓰지 않는다. 한 머리 안의 무게 나눔(`attentionWeights`)은 이쪽의 주제가 아니다.
 *
 * 전제 (설명 글 `severalViews.md`): 머리 수 2 · 입력 차원 4 · 머리마다 두 칸 · 행렬의 수는 예로 정한 값이다(배운 값이 아니다).
 * 머리 1 은 입력의 앞 두 칸을, 머리 2 는 뒤 두 칸을 읽게 골랐다. 출력 행렬 W_O 없음(항등). 어텐션 한 번 — 마스크 · 잔차 · 층 정규화 ·
 * 되먹임 신경망 · 여러 층 없음. 실제 모형은 머리 여덟 · 열여섯쯤에 행렬을 배운다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const severalViewsConcept: FacetConceptSource = {
  id: 'severalViews',
  label: 'Two Attention Heads Pick Different Partners',
  canonicalFacet: 'facet:severalViews',

  surface: {
    definition:
      'Two attention heads with their own matrices, run over the same tokens, can each give a token a different strongest partner, and concatenating their outputs keeps both relations side by side.',
    exemplarKeywords: [
      'multi-head attention',
      'what different attention heads learn',
      'each head attends to different things',
      'heads capture different relationships',
      'concatenate head outputs',
      'per-head W_Q, W_K, W_V',
      'attention head specialization',
      'syntactic head vs positional head',
      'representation subspaces',
    ],
  },

  briefing: {
    observable: [
      'One row of four tokens A, B, C, D sits in the middle with its four-cell inputs: A (1, 0, 1, 0), B (-1, 0, 0, 1), C (0, 1, -1, 0), D (0, -1, 0, -1). A band above is labelled "Head 1", a band below "Head 2". The caption reads "One row of tokens, two heads. Nothing computed yet."',
      'Head 1 computes all four rows at once and draws, for each token, one arc above the row to the token it weighs most, with that weight on top: A→C, B→D, C→A, D→B, each 0.45. The pairs are two places apart. Each token\'s two-cell result rises into the band: A (0.00, 0.34), B (0.00, -0.34), C (0.34, 0.00), D (-0.34, 0.00).',
      'Head 2 does the same below the row with its own matrices, and its arcs are short: A→B, B→A, C→D, D→C, each 0.45. Its results are A (0.34, 0.00), B (0.00, 0.34), C (-0.34, 0.00), D (0.00, -0.34). The caption reads "Head 2: rows whose strongest pair differs from Head 1: 4 / 4".',
      'In the last step both heads\' results gather into one "Joined" row, four cells per token, the first two from head 1 and the last two from head 2: A (0.00, 0.34, 0.34, 0.00), B (0.00, -0.34, 0.00, 0.34), C (0.34, 0.00, -0.34, 0.00), D (-0.34, 0.00, 0.00, -0.34). The caption reads "Head results joined per token. Cells per token: 4".',
      'The 0.45 on each arc is only the largest weight in its row; head 1\'s row for A is 0.22, 0.22, 0.45, 0.11. Arcs are drawn only to the largest.',
      'The number of heads, the input size 4, the two cells per head and all matrix entries are example values, not learned; the matrices were chosen so head 1 reads the first two input cells and head 2 the last two. There is no output matrix W_O — the joined four cells are the output — and a single attention computation without masking, residual, normalization or feed-forward layer. Real models use eight or sixteen heads with learned matrices. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its four steps by itself on mount — start, head 1, head 2, join — and stops.',
        'Beneath it are a Replay button and a playback strip. After the run, dragging back to the head 2 step shows the long upper arcs and the short lower arcs over the same row at once.',
        'The tokens, inputs and matrices are fixed, so an article can name each head\'s pairs and the joined vectors exactly.',
      ],
    },

    useWhen: [
      'The article says different attention heads learn different relationships and needs a case where two heads over the same sentence give every token a different partner.',
      'A reader asks what happens to the outputs of several heads, and the article wants the head results laid end to end so each relation keeps its own cells in the joined vector.',
    ],

    avoidWhen: [
      'The article is about what heads in a trained model actually specialize in, or probing and pruning heads. These heads are hand-built, not learned.',
      'The subject is how weights within one row are shared out by softmax. Only the largest weight per row is drawn here.',
      'The point is the output projection that mixes heads after concatenation. It is left out here.',
    ],

    contrastWith: [
      {
        concept: 'selfAttention',
        note: 'Heads with their own projections can look at different relations. The sharper claim is that even one fixed set of projections, only regrouped into heads, stops two relations from being added into one tied score.',
      },
      {
        concept: 'attentionWeights',
        note: 'Within one head, softmax spreads each row over every token and blends the values. Across heads, the question is which token each head favours, and two heads can favour different ones for the same query.',
      },
      {
        concept: 'queryKeyValue',
        note: 'One set of query, key and value matrices defines one way of matching tokens. Giving each head its own set is what allows several ways of matching to coexist over the same sequence.',
      },
      {
        concept: 'attendToAllAtOnce',
        note: 'Every head scores all pairs directly, so reach is the same in each. What differs between heads is which of those directly reachable tokens each one prefers.',
      },
    ],
  },
};
