/**
 * gatedCells 개념 선언.
 *
 * canonical facet 은 `facet:gatedCells` — 시각 1 에 쓰기 입력 x 2 를 넣고 방해 입력(±0.5)을 정해 둔 차례로 넣는다.
 * 손잡이 둘: 셀(RNN · GRU · LSTM, 처음 LSTM) · 방해 입력 수(2 · 6 · 12, 처음 6). 시각마다 들고 가는 상태에 곱해지는 몫과
 * 그 곱인 "남은 몫" 띠가 이어진다. 방해 6 에서 남은 몫 RNN 0.17 · GRU 0.96 · LSTM 0.94.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 셋)
 *
 * 조각 셋은 한 장면씩이다 — 한 시각 안의 문 셋(`gateLetsThrough`) · 방해 없는 긴 c 길과 출렁이는 h(`cellCarriesLong`) ·
 * 두 문을 하나로 묶은 GRU 와 LSTM 의 짜임 대비(`fewerGates`). 이쪽이 쥐는 것은 **같은 입력 길 위에서 셀을 바꾸고
 * 사슬 길이를 바꿀 때 남은 몫이 어떻게 갈리는가**다. 그래서 definition 은 plain RNN · GRU · LSTM 셋을 한꺼번에 부르고
 * distractor inputs · swapping the cell 을 쥐며, 조각들이 독점한 forget/input/output gate 의 이름 풀이 · cell state path ·
 * merged update gate · sum to one 을 쓰지 않는다.
 *
 * 전제 (설명 글 `gatedCells.md` 가 밝힌 것):
 *  - 칸 하나. 무게는 예로 정한 값. 문과 LSTM 후보는 x 만 본다. 두 문 달린 셀에 같은 지킬 몫 식 σ(−3x + 5.5).
 *  - RNN 의 w_h 는 0.9. 학습은 없고 정해 둔 무게로 앞으로만 셈한다 — 어느 셀이 더 잘 배우는가는 말하지 않는다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const gatedCellsConcept: FacetConceptSource = {
  id: 'gatedCells',
  label: 'Gated Cells — LSTM and GRU vs a Plain RNN Across Distractors',
  canonicalFacet: 'facet:gatedCells',

  surface: {
    definition:
      'Feeding one written value and then distractor inputs through a plain RNN, a GRU and an LSTM shows the gated cells keeping nearly all of it while the plain cell loses most as the gap lengthens.',
    exemplarKeywords: [
      'LSTM',
      'GRU',
      'gated recurrent unit',
      'long short-term memory',
      'RNN vs LSTM vs GRU',
      'why LSTM solves the vanishing gradient',
      'long-term dependencies',
      'remembering a value across many time steps',
      'distractor inputs',
      'constant error carousel',
      'gating mechanism in recurrent networks',
    ],
  },

  briefing: {
    observable: [
      'A chain of time slots runs left to right with rows for the input x, the gates, the candidate, the carried state, the "multiplied share" and the "kept share". Time 1 is the write input x 2.0; after it come distractor inputs 0.5, −0.5, −0.5, 0.5, −0.5, 0.5 … in a fixed order.',
      'From time 2 on, every slot shows the share multiplied into the carried state for that time, and a yellow band along the carried state keeps the running product at that thickness, with a dashed outline marking the starting thickness 1.',
      'With the LSTM and 6 distractors the gate f reads 0.38 at the write (letting the new value in) and 0.98 or 1.00 at every distractor; c stays at 0.47 then 0.46, the multiplied shares are ×0.98 and ×1.00, and the round ends "6 multiplied shares, from 0.98 to 1.00 · kept share 0.94".',
      'With the plain RNN on the same inputs there are no gates; the multiplied share is w_h·(1 − h²), from 0.42 to 0.90, h swings 0.76, 0.73, 0.39, 0.10, 0.33, 0.04, 0.28, and the kept share falls 0.42, 0.32, 0.28, 0.23, 0.20, 0.17.',
      'With the GRU the gate z opens at the write (0.38) and then sits at 0.98–1.00; h shows 0.47 at every time while the kept share still falls slowly to 0.96, because it is computed from the unrounded values.',
      'Switching the cell changes how many lanes are carried: the RNN and GRU carry h alone, the LSTM carries a c lane and an h lane, and the band moves to the lane that is measured (c for the LSTM).',
      'Kept share by distractor count — 2: RNN 0.32, GRU 0.99, LSTM 0.98; 6: RNN 0.17, GRU 0.96, LSTM 0.94; 12: RNN 0.06, GRU 0.91, LSTM 0.89. The readouts "Kept share %" and "Gates" (0, 2, 3) carry these.',
      'Premises the screen does not footnote: each state is one number; the weights are chosen for the example; gates and the LSTM candidate look only at x; the LSTM forget gate and the GRU update gate are given the same formula σ(−3x + 5.5), so the difference is the cell design rather than weight picking; the RNN uses w_h 0.9; nothing is trained.',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) and two handles: a "Cell" slider over RNN, GRU and LSTM (starting at LSTM) and a "Distractor inputs" slider over 2, 6 and 12 (starting at 6). A round plays to the end, waits, and replays from the start with the new setting.',
        'The move that makes the idea land is keeping the distractor count and switching the cell: the same inputs, the band thinning step by step for the RNN and passing almost untouched for the GRU and LSTM. Moving to 12 distractors then lengthens the chain and widens the gap.',
        'The code panel, labelled "Kept share through the cell", starts empty with a "+ Add language" button; the chosen language shows one function with a branch per cell and highlights the branch of the current cell. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article introduces LSTM or GRU as the fix for plain recurrent networks forgetting, and needs one sequence run through all three so the reader sees the fix as a number: the carried state multiplied by about 0.98–1.00 per step instead of 0.42–0.90.',
      'A reader should find out for themselves that the benefit grows with the gap — at 2 distractors the plain cell still keeps a third, at 12 it keeps 6 percent while the gated cells stay near 0.9.',
    ],

    avoidWhen: [
      'The article is about which of LSTM and GRU learns better or trains faster. Nothing is trained, and the two gated cells come out within a few hundredths of each other on purpose.',
      'The subject is the internal equations of one LSTM step and what each gate is called. The gates are shown as values along a chain, not unpacked one by one.',
      'The point is attention or Transformers replacing recurrent networks. Only recurrent cells appear here.',
      'The article needs multi-dimensional states, peepholes or stacked layers. Every state is a single number in a single layer.',
    ],

    contrastWith: [
      {
        concept: 'gateLetsThrough',
        note: 'What each gate does inside a single step is the mechanism; how a gate near one, applied at every step, lets a value survive a long chain of distractors is the consequence compared across cell types.',
      },
      {
        concept: 'cellCarriesLong',
        note: 'The cell state being a separate path multiplied only by the forget gate is one design fact of the LSTM. Here that fact is weighed against a plain RNN and a GRU on the same inputs and across chain lengths.',
      },
      {
        concept: 'fewerGates',
        note: 'How a GRU is built with fewer gates than an LSTM is a question of structure; whether that smaller structure still keeps an early value through distractors, and how it compares with no gates at all, is a question of outcome.',
      },
      {
        concept: 'vanishingOverTime',
        note: 'The vanishing gradient explains why a plain recurrent cell loses early information: a product of factors below one. Gated cells change what that product is made of, replacing the recurrent weight times a slope with a gate that can sit near one.',
      },
      {
        concept: 'unrolledRnn',
        note: 'Turning the recurrent weight of a plain cell moves how far influence reaches, but always as a product of the weight and a slope. Swapping in a gated cell changes the factor itself, not just its size.',
      },
    ],
  },
};
