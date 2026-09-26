/**
 * attentionWeights 개념 선언.
 *
 * canonical facet 은 `facet:attentionWeights` — 물음 q = (1, -1) 하나가 열쇠 넷 A · B · C · D 와 맞춰진다. q·k -1 · 1 · 0 · -2 를
 * √2 로 나눈 점수 -0.71 · 0.71 · 0.00 · -1.41 이 softmax 로 무게 0.13 · 0.54 · 0.27 · 0.06 (합 1.00)이 되고, 결과가 (0, 0) 에서
 * 값마다 제 몫만큼 A · B · C · D 차례로 쌓여 (0.75, 0.73) 에 선다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `queryKeyValue` 는 맞춰 보는 것(열쇠)과 가져오는 것(값)이 다르다는 역할의 갈라짐을, `selfAttention`(완제품)은 머리 수에 따라
 * 무게가 나뉘거나 몰리는 것을 맡는다. 이쪽의 주장은 **어텐션은 가장 잘 맞는 하나를 고르지 않고 모두를 몫대로 섞는다**는 하나다.
 * 그래서 definition 은 softmax · positive · sum to one · weighted sum · blend · not a pick 쪽 낱말을 쥐고, 입력이 행렬로 갈라지는
 * 이야기나 여러 토큰 · 머리 · 한 걸음 같은 말을 넣지 않는다.
 *
 * 전제 (설명 글 `attentionWeights.md`): 물음 · 열쇠 · 값은 예로 정한 수이고 투영 단계는 뺐다. 묻는 것은 물음 하나뿐이다.
 * softmax 는 최댓값을 빼고 셈하고 온도는 1. 차원 둘이라 결과를 평면 위의 점으로 그린다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const attentionWeightsConcept: FacetConceptSource = {
  id: 'attentionWeights',
  label: 'Attention Weights (Softmax Shares, Weighted Sum of Values)',
  canonicalFacet: 'facet:attentionWeights',

  surface: {
    definition:
      'Softmax turns one query\'s scores into positive weights summing to one, and the output is the weighted sum of the values — a blend pulled toward the heaviest, not a pick of the best match.',
    exemplarKeywords: [
      'attention weights',
      'softmax over attention scores',
      'weighted average of values',
      'context vector',
      'soft attention vs hard attention',
      'weights sum to 1',
      'convex combination',
      'why attention is differentiable',
      'attention output is a mixture',
      'scaled dot product score',
    ],
  },

  briefing: {
    observable: [
      'One query q (1, -1) sits beside four rows A, B, C, D, each with a key k and a value v: A (0, 1) / (0, 4), B (0, -1) / (2, 0), C (1, 1) / (-1, 1), D (0, 2) / (-1, -1). A plane on the right shows the four values as points, and "Result (0.00, 0.00)" starts at the origin.',
      'The score step writes, row by row, the dot product and the scaled score beside it — "q·k -1" and -0.71, "q·k 1" and 0.71, "q·k 0" and 0.00, "q·k -2" and -1.41 — with the caption "Score = q·k / √2, one per key."',
      'In the weigh step a single full bar at the head of the weight column breaks into four pieces that drop onto their rows: 0.13, 0.54, 0.27, 0.06, with a "Sum 1.00" mark. The caption reads "The scores split one whole into weights (softmax)." A negative score and a zero score both still get a positive weight.',
      'Four steps then add each value\'s share in turn. On the plane, the arrow from the origin to that value shrinks by its weight and attaches to the tip of the result, dragging the result point along: "A adds its share: 0.13 × (0, 4) = (0.00, 0.52)", then B\'s 0.54 × (2, 0) takes it to (1.08, 0.52), C\'s 0.27 × (-1, 1) to (0.81, 0.79), and D\'s 0.06 × (-1, -1) to (0.75, 0.73). The last caption adds "Largest weight: B 0.54".',
      'The final result (0.75, 0.73) equals none of the four values; it has been pulled furthest by B, whose share was largest. The run is seven steps counting the opening screen.',
      'Query, keys and values are example numbers; the projection from inputs is left out, and only one query asks. Softmax subtracts the largest score before exponentiating, with temperature 1. Displayed values are rounded to two places. The screen does not footnote these points.',
    ],

    screen: {
      affordances: [
        'The screen plays its seven steps by itself on mount and stops with the result at (0.75, 0.73).',
        'Beneath it are a Replay button and a playback strip. After the run, dragging through the four share steps shows the result point pulled a little by each value, most of all by B.',
        'All numbers are fixed, so an article can quote the four weights, the running sums and the final point exactly.',
      ],
    },

    useWhen: [
      'The reader pictures attention as picking the single best-matching word, and the article needs the output to land between the values, closest to the heaviest but equal to none.',
      'The article walks through softmax on attention scores and wants negative and zero scores to come out as small positive shares that still add their part to the output.',
    ],

    avoidWhen: [
      'The article is about hard attention, top-k selection or argmax retrieval. Every value contributes here; nothing is discarded.',
      'The subject is where queries, keys and values come from or why they are separate vectors. They are given numbers here, with no input or projection shown.',
      'The point is several tokens or several heads attending at once. There is exactly one query.',
    ],

    contrastWith: [
      {
        concept: 'queryKeyValue',
        note: 'Separating what is matched from what is delivered explains the roles. Turning the match scores into shares of one whole, and adding every value in proportion, is the mixing step that follows.',
      },
      {
        concept: 'squashToProbability',
        note: 'A sigmoid maps one score to one probability on its own. Softmax maps a whole row of scores to shares that must add up to one, so raising one score lowers every other share.',
      },
      {
        concept: 'flattenOrSharpen',
        note: 'Temperature decides how sharply softmax concentrates a row of scores. Attention weights take that concentration as it comes and use the shares to blend value vectors into a new point.',
      },
      {
        concept: 'selfAttention',
        note: 'A single row of scores becoming a blend is the unit of the computation. With several heads, each head produces its own row from different projected columns, and the question becomes how those rows differ.',
      },
    ],
  },
};
