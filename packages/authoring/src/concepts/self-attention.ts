/**
 * selfAttention 개념 선언.
 *
 * canonical facet 은 `facet:selfAttention` — 토큰 넷(A · B · C · D)이 같은 투영 행렬 W_Q · W_K · W_V 로 서로를 본다.
 * 손잡이 "Heads"(1 · 2, 처음 1)는 행렬을 바꾸지 않고 투영 네 칸을 한 무리로 읽을지(d_k 4) 두 칸씩 두 무리로 읽을지(d_k 2)만
 * 바꾼다. 머리 하나면 두 관계(원을 따라 다음 · 맞은편)의 q·k 가 더해져 네 줄 모두 두 짝이 5 = 5 동률, 무게 0.50 씩 나뉜다.
 * 머리 둘이면 여덟 줄 모두 짝이 홀로 서고 무게가 0.94 로 몰린다. 투영 무게 수는 두 쪽 다 48.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 각각 한 장면이다 — 한 입력이 세 벡터로 갈라짐(`queryKeyValue`) · 모든 짝을 한 걸음에(`attendToAllAtOnce`) ·
 * 한 물음의 무게 나눔과 섞임(`attentionWeights`) · 머리마다 다른 짝(`severalViews`). 이쪽은 그 셈을 한 판에 잇고
 * **손잡이로 같은 무게를 다르게 무리 지을 때 무엇이 갈리는가**를 맡는다. 그래서 definition 은 same weights · columns ·
 * split · tie · weight count 쪽 낱말을 쥐고, 조각들이 독점한 query/key/value 의 역할 · 한 걸음 · 가중합 · 제 행렬을 가진 머리 ·
 * concatenate 를 쓰지 않는다. `severalViews` 와 특히 가깝다 — 그쪽은 머리마다 **제 행렬**이 있어 다른 짝을 고르는 장면이고,
 * 이쪽은 **같은 행렬의 열을 나누기만** 해도 동률이 풀린다는 대비다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `selfAttention.md` 가 밝힌 것):
 *  - 행렬은 관계 둘을 보이려고 예로 짠 값이다. 배운 값이 아니다. W_Q · W_K 는 x 의 앞 두 칸만, W_V 는 뒤 두 칸만 읽게 짰다.
 *  - d_model 4 로 줄였다. 실제 모형은 d_model 수백~수천, 머리 여덟 이상.
 *  - 출력 행렬 W_O 는 생략(항등). 층 하나, 마스크 · 잔차 · 층 정규화 없음.
 *  - 가장 크게 보는 짝은 정수 q·k 로 견주고 동률을 깨지 않는다. 0.00 으로 보이는 무게도 0 이 아니다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const selfAttentionConcept: FacetConceptSource = {
  id: 'selfAttention',
  label: 'Self-Attention and Multi-Head (One Head vs Two)',
  canonicalFacet: 'facet:selfAttention',

  surface: {
    definition:
      'Splitting the same projection columns into two heads instead of one leaves the weight count unchanged, yet separates two relations that a single head adds into one tied score.',
    exemplarKeywords: [
      'self-attention',
      'multi-head attention',
      'why use multiple attention heads',
      'number of heads',
      'd_k = d_model / h',
      'head dimension',
      'scaled dot-product attention',
      'Transformer attention layer',
      'multi-head does not add parameters',
      'one head averages two relations',
      'attention heatmap per head',
    ],
  },

  briefing: {
    observable: [
      'Four tokens A, B, C, D each have a four-cell input x. One round is six steps: the frame, then Projection ("q · k · v for every token at once"), Scores ("q·k divided by √d_k, every head and every row at once"), Weights ("softmax across each row"), Pairs ("the largest q·k in each row, compared as integers") and Result ("weights times v, summed; head results joined per token").',
      'With Heads at 1 the info line reads "heads 1 · d_k 4 · √d_k 2.00". There is one 4 × 4 grid labelled "rows: query · columns: key" and "head 1 · columns 1–4". Every row has two q·k values of 5 (score 2.50) and two of −5, the weights come out 0.50, 0.50, 0.00, 0.00, and each row is marked as a tie: "tie B·C", "tie C·D", "tie A·D", "tie A·B".',
      'With Heads at 1 each token\'s four-cell result has its first half equal to its second half — the same blend carried twice. The readouts show rows whose pair stands alone 0 / 4, rows whose pairs tie 4 / 4, and 48 projection weights.',
      'Switching to 2 heads, the q · k · v cells part into two groups of two, the info line becomes "d_k 2 · √d_k 1.41", and the one grid splits into two. In every row of both heads a single key now carries 0.94 of the weight, with the others at 0.03 or 0.00. Head 1 pairs each token with the next one around the circle (A→B, B→C, C→D, D→A); head 2 pairs it with the opposite one (A→C, B→D).',
      'With 2 heads the readouts become rows whose pair stands alone 8 / 8 and rows whose pairs tie 0, while Projection weights stays at 48. The two halves of each result now differ: A becomes (0.00, 2.86, −1.86, 0.97). Turning back to 1 head merges the grids and spreads the concentrated weight over two keys again.',
      'A readout "smallest of the row-top weights" gives the weakest winner across rows: 0.50 with one head, 0.94 with two. Weights shown as 0.00 are not zero, since softmax never outputs zero; displayed values are rounded to two places, so adding them by hand can miss the shown result slightly.',
      'The matrices are example values arranged so that the query and key read only the first two input cells and the value only the last two; they were not learned. The model is cut down to four tokens and d_model 4, has no output matrix W_O, and is a single layer without masking, residual connection or layer normalization. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) and one handle, a two-position "Heads" slider at 1 and 2, starting at 1. A round plays its six steps and then waits for the handle; a new value starts a fresh round with the same matrices.',
        'The move that makes the idea land is 1 → 2: the tied pairs in every row come apart into one clear pair per head, the top weight jumps from 0.50 to 0.94, and the projection-weight readout does not move from 48.',
        'The code panel, labelled "Multi-head attention", starts empty with a "+ Add language" button; the chosen language shows the multi-head function with its projection, score, softmax, pair-picking and mixing parts, and highlights the part of the current step. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article claims multi-head attention helps and a reader asks how, when splitting the dimension adds no parameters. Watching 48 stay 48 while four tied rows become eight clear ones answers that directly.',
      'A reader wonders why one wide attention head cannot simply do what several narrow ones do, and the article needs a case where two relations collapse into equal scores inside one head.',
    ],

    avoidWhen: [
      'The article is about masked or causal attention in a decoder, cross-attention between encoder and decoder, or stacking many layers. There is one unmasked layer over one sequence here.',
      'The subject is how the projection matrices are learned or what trained heads specialise in. These matrices are hand-set and do not change.',
      'The point is the effect of dividing scores by √d_k or of temperature on softmax. That factor is applied but is not something the reader can vary.',
    ],

    contrastWith: [
      {
        concept: 'queryKeyValue',
        note: 'Why one input becomes three different vectors, and why what is returned is the value rather than the key, is the premise of the whole computation. Grouping the projected columns into heads is a separate choice made on top of those roles.',
      },
      {
        concept: 'attendToAllAtOnce',
        note: 'That every pair is scored in one parallel step holds whatever the head count. How many heads read the projections decides which pairs stand out, not how quickly they are reached.',
      },
      {
        concept: 'attentionWeights',
        note: 'Softmax turning one row of scores into a blend of values is the per-row mechanism. The head count changes what goes into each row\'s scores, and so whether a row\'s weight is shared between two keys or concentrated on one.',
      },
      {
        concept: 'severalViews',
        note: 'Heads with their own projections picking different partners shows that heads can disagree. Taking one fixed set of projections and only regrouping its columns shows why the split itself matters: one head sums what two heads keep apart.',
      },
      {
        concept: 'unrolledRnn',
        note: 'A recurrent network relates positions through a chain of repeated steps, so distant influence depends on a per-step factor. Attention relates every pair of positions through one score, and the design questions move to how those scores are grouped.',
      },
      {
        concept: 'flattenOrSharpen',
        note: 'Temperature spreads or concentrates a distribution by rescaling every score by one number. Splitting into heads concentrates weight by changing which projection columns are summed into each score, with no rescaling at all.',
      },
    ],
  },
};
