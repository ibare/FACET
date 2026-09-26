/**
 * carryHiddenState 개념 선언.
 *
 * canonical facet 은 `facet:carryHiddenState` — 토큰 넷 A · A · B · A 가 칸 하나짜리 RNN 셀을 차례로 지난다.
 * 걸음마다 넘겨받은 h 와 새 토큰이 w_x·x + w_h·h 로 섞여 tanh 를 지나고, 방금 만든 h 가 다음 걸음으로 건너간다.
 * 같은 토큰 A 뒤의 h 가 0.76 · 0.92 · 0.66 으로 셋 다 다르다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `unrolledRnn` 은 되먹임 무게를 돌려 앞뒤 두 방향이 함께 움직이는 것을, 형제 `sameWeightsEachStep` 은
 * 무게 한 벌이 되쓰이는 것을 쥔다. 이쪽의 한 동사는 **넘겨진다** — 주인공은 건너가는 h 다. 그래서 definition 은
 * same token · different output · what came before 를 독점하고, weights · gradient · parameter 를 쓰지 않는다.
 *
 * 전제: 은닉 상태 한 칸 · w_x 1 · w_h 0.8 · b 0 · h0 0 은 예로 정한 값 · A → x 1, B → x −1 · 출력층이 없어 h 가 곧 출력.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const carryHiddenStateConcept: FacetConceptSource = {
  id: 'carryHiddenState',
  label: 'Carrying the Hidden State to the Next Step',
  canonicalFacet: 'facet:carryHiddenState',

  surface: {
    definition:
      'A recurrent network hands the hidden state it just produced into the next step, so the same input token yields a different output each time depending on what came before it.',
    exemplarKeywords: [
      'hidden state',
      'RNN memory',
      'h_t = tanh(W_x x_t + W_h h_{t-1} + b)',
      'previous hidden state',
      'context from earlier tokens',
      'same word, different meaning in context',
      'sequential processing one token at a time',
      'state passed between time steps',
      'recurrence',
      'why an RNN output depends on history',
    ],
  },

  briefing: {
    observable: [
      'Four token slots stand in a row, A, A, B, A, with their input values beneath (A is x 1, B is x -1) and h0 = 0.00 on the left. The caption starts "Nothing seen yet — h: 0.00".',
      'At each step the carried-in h crosses from the previous slot, and the cell shows its two parts, wₓ·x and wₕ·h, their sum, and the result after tanh: step 1 is 1.00 + 0.00 = 1.00 → h1 0.76; step 2 is 1.00 + 0.61 = 1.61 → h2 0.92; step 3 is -1.00 + 0.74 = -0.26 → h3 -0.26; step 4 is 1.00 + -0.20 = 0.80 → h4 0.66.',
      'The caption tracks each token\'s outputs separately and ends "h after token A: 0.76 · 0.92 · 0.66" — the same token, three different results, each set by the h it was handed.',
      'Premises the screen does not footnote: the hidden state is one number; w_x = 1, w_h = 0.8, b = 0 and h0 = 0 are chosen for the example; there is no output layer, so h itself is the output.',
    ],

    screen: {
      affordances: [
        'The screen plays the four tokens by itself, one per step, and stops after the fourth.',
        'A Replay button and a playback strip sit below it. Dragging the strip back to step 2 and then to step 4 sets two A tokens side by side with different carried-in h and different results.',
        'The tokens, inputs and weights are fixed, so every sum and output can be quoted exactly as it appears.',
      ],
    },

    useWhen: [
      'The article explains what makes a network "recurrent" and needs the reader to see that the input alone does not decide the output: token A enters three times and comes out 0.76, 0.92 and 0.66.',
      'A reader thinks an RNN reads each word independently, like a lookup table, and has to be shown where the earlier words are kept and how they enter the next computation.',
    ],

    avoidWhen: [
      'The subject is how many weights the network has or that they are reused. The weights sit in the background here and are never counted.',
      'The article is about training, gradients or backpropagation through time. Only a forward pass is shown.',
      'The point is how long information survives across many steps. There are four tokens, and nothing here measures fading.',
      'The subject is the key–value cache or context windows in Transformers. The state here is one number updated in place, not a stored history.',
    ],

    contrastWith: [
      {
        concept: 'sameWeightsEachStep',
        note: 'Both hold across every step of a recurrent network, but they are opposite in kind: the hidden state changes at each step and carries the past, while the weights stay the same at each step and carry nothing about the input.',
      },
      {
        concept: 'unrolledRnn',
        note: 'Passing h forward is the single link; how much of the first input survives a long chain of such links, and that the gradient comes back through the same links, builds on it.',
      },
      {
        concept: 'cellCarriesLong',
        note: 'A plain hidden state is overwritten through tanh at every step, so what it carries is mixed with each new input. An LSTM cell state is a separate path that is mostly just multiplied by a gate, which is what lets it carry a value much further.',
      },
      {
        concept: 'attendToAllAtOnce',
        note: 'A recurrent network sees earlier tokens only through the one state passed along the sequence. Attention looks at every earlier position directly, with no single carried state in between.',
      },
    ],
  },
};
