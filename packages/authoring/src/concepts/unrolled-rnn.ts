/**
 * unrolledRnn 개념 선언.
 *
 * canonical facet 은 `facet:unrolledRnn` — 칸 하나짜리 RNN 을 셀 여덟으로 펼쳐 앞으로 한 번(첫 입력의 흔적
 * s_t = ∂h_t/∂x_1), 뒤로 한 번(끝 출력 h8 의 기울기 ∂h8/∂h_k) 지나간다. 두 쪽 모두 셀마다 같은 몫 w_h·(1 − h_t²) 을
 * 곱하므로, 끝 걸음에 따로 셈한 "앞으로 잰 흔적 s8" 과 "뒤로 닿은 ∂h8/∂x1" 이 같은 수로 나란히 선다.
 * 손잡이 w_h(0.3 · 0.6 · 0.9, 처음 0.6)를 돌리면 둘이 함께 멀리 간다 (0.000 · 0.023 · 0.406).
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 각각 한 장면이다 — h 가 건너감(`carryHiddenState`) · 한 벌 무게가 되쓰임(`sameWeightsEachStep`) ·
 * 손실 기울기가 한 무게에 모임(`unrollThenBackprop`) · 거슬러 갈수록 곱으로 줄어듦(`vanishingOverTime`).
 * 이쪽이 쥐는 것은 **손잡이 하나가 두 방향을 함께 움직인다는 대비**다. 그래서 definition 은 forward 와 backward 를
 * 나란히 두고 "turning the recurrent weight" · "together" · "same product" 를 쥐며, 조각들이 독점한
 * same token · parameter count · loss · vanishing · distance 를 쓰지 않는다.
 *
 * 전제 (설명 글 `unrolledRnn.md` 가 밝힌 것 — 화면은 각주가 없다):
 *  - 은닉 상태는 칸 하나. 입력 여덟(±0.2) · w_x 1 · b 0 · h0 0 은 예로 정한 값이고 |h| < 0.5 라 tanh 는 포화 밖이다.
 *  - 손실이 없다. 끝 출력 h8 자체의 기울기(1)를 거슬러 보낸다.
 *  - 손잡이는 |w_h| < 1 만 둔다. 1 을 넘으면 불어날 수 있으나 화면에는 없다.
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴 것이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const unrolledRnnConcept: FacetConceptSource = {
  id: 'unrolledRnn',
  label: 'Unrolled RNN and Backpropagation Through Time (One Weight, Both Directions)',
  canonicalFacet: 'facet:unrolledRnn',

  surface: {
    definition:
      'Unrolling a recurrent network shows forward influence of the first input and backward gradient from the last output shrinking by the same per-step product, so turning the recurrent weight moves both together.',
    exemplarKeywords: [
      'unrolled RNN',
      'RNN unfolded through time',
      'backpropagation through time',
      'BPTT',
      'recurrent weight W_hh',
      'forward pass and backward pass of an RNN',
      'Jacobian of the hidden state',
      'dh_T/dx_1',
      'how long an input influences the output',
      'effect of the recurrent weight on memory and gradients',
      'computational graph of a recurrent network',
    ],
  },

  briefing: {
    observable: [
      'Eight cells t1 … t8 stand in a row with their inputs x beneath them (0.2, −0.2, −0.2, 0.2, 0.2, −0.2, 0.2, −0.2) and h0 = 0.00 on the left. A tag reads the current w_h, 0.6 at the start.',
      'Steps 1–8 go forward: each cell computes `h_t = tanh(w_x·x_t + w_h·h_{t−1} + b)` and an orange band, "Trace ∂h_t/∂x1", crosses into it. From t2 on the cell shows the "Multiplied share" w_h·(1 − h_t²) — about ×0.56 to ×0.60 at w_h 0.6 — and the trace falls 0.961, 0.573, 0.323, 0.193, 0.110, 0.066, 0.038, 0.023.',
      'Steps 9–16 go backward from t8 to t1: a yellow bar "Gradient ∂h8/∂h_k" starts at 1.000 and shrinks as it moves left (0.594, 0.347, 0.207 … 0.024). At each cell a share d·x flies to a "w_x gradient" box on the right, whose running sum ends at −0.105.',
      'Step 17 sets two bars side by side, "Forward trace s8" and "Reached back ∂h8/∂x1". They are computed separately and read the same number — 0.023 at w_h 0.6 — and a "Far half" mark over cells 1–4 gives what share of the summed gradient came from that far half (0.10).',
      'Across the handle both directions move together: w_h 0.3 gives 0.000 and 0.000 with a far-half share of 0.01; w_h 0.6 gives 0.023 and 0.023 with 0.10; w_h 0.9 gives 0.406 and 0.406 with 0.38. A displayed 0.000 is a value cut at the third decimal, not zero.',
      'The two readouts under the controls carry the round: "Trace left %" (s_t / s_1, e.g. 100 60 34 20 11 7 4 2 at w_h 0.6, and 100 90 77 … 42 at 0.9) and "Far-half share %", which stays 0 until the last step.',
      'Premises the screen does not footnote: the hidden state is a single number; the inputs, w_x = 1, b = 0 and h0 = 0 are chosen for the example, and the inputs are small enough that |h| stays under 0.5; there is no loss, the gradient sent back is that of the output h8 itself; the handle stays below 1, where a larger weight could make the trace and gradient grow instead.',
    ],

    screen: {
      affordances: [
        'Playback controls (play, step, pause, reset, speed) and one handle, a three-position "Recurrent weight w_h" slider at 0.3, 0.6 and 0.9, starting at 0.6. A round is eighteen steps and plays to the end before the handle is read; a new value starts a fresh round.',
        'The move that makes the idea land is stepping w_h from 0.3 to 0.9: the place where the forward band fades moves from around cell 4 to past cell 8, the backward bar reaches the same way, and the two end bars rise together.',
        'The code panel, labelled "Forward, backward, far-half share", starts empty with a "+ Add language" button; the chosen language shows the forward and backward functions and highlights the lines of the current phase. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article says a recurrent network "remembers" and also that it is "hard to train on long sequences", and needs to show these are one fact: the same multiplication that lets an early input fade going forward limits how far the gradient reaches going back.',
      'A reader is to watch what the recurrent weight value does to a network as a whole — turning it up and seeing both the forward influence and the backward gradient reach further at once, with the two end numbers matching.',
    ],

    avoidWhen: [
      'The subject is exploding gradients or gradient clipping. The handle stays below 1 and every value shown shrinks.',
      'The article is about training a network on data with a loss and weight updates. Nothing here is learned; the gradient sent back is that of the last output itself and no weight changes.',
      'The subject is LSTM or GRU cells, or any gated design. This is the plain tanh cell with one recurrent weight.',
      'The point is a multi-dimensional hidden state, matrix weights or eigenvalues of the recurrent matrix. Everything here is a single number.',
    ],

    contrastWith: [
      {
        concept: 'carryHiddenState',
        note: 'Handing the hidden state to the next step is what makes an early input reach later outputs at all; how much of it arrives, and that the gradient comes back by the same amount, is what this adds.',
      },
      {
        concept: 'sameWeightsEachStep',
        note: 'Reusing one weight set at every step is why a single recurrent weight governs every link of the chain; that reuse is the premise here, and its consequence for forward influence and backward reach is the claim.',
      },
      {
        concept: 'unrollThenBackprop',
        note: 'Backpropagation through time as a procedure sends a loss gradient back and adds up one weight’s contributions. This is about how the recurrent weight sets the reach of that procedure, and that forward influence obeys the same product.',
      },
      {
        concept: 'vanishingOverTime',
        note: 'The vanishing gradient is the backward half alone: a product of per-step factors shrinking with distance. Setting it beside the forward influence of the first input, under a weight that can be turned, shows the two are the same quantity.',
      },
      {
        concept: 'gatedCells',
        note: 'Both concern how much of an early value survives a chain of steps. Tuning the one recurrent weight of a plain cell only changes the size of a weight-times-slope factor; a gated cell replaces that factor with a gate that can stay near one.',
      },
      {
        concept: 'selfAttention',
        note: 'A recurrent network links distant positions only through a chain of per-step multiplications whose product fades with length. Self-attention links every pair of positions directly in one step, so no such chain stands between them.',
      },
    ],
  },
};
