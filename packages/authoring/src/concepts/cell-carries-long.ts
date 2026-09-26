/**
 * cellCarriesLong 개념 선언.
 *
 * canonical facet 은 `facet:cellCarriesLong` — LSTM 에 입력 여섯(2 · 1 · 0 · 1 · 0 · 1)을 넣는다. 걸음 1 에 셀 c 에 0.67 이
 * 적히고, 걸음마다 잊는 문 0.98 이 곱해지는 것만으로 옮겨 가 걸음 6 에 0.64 (남은 비 0.95 · f 곱 0.91). 같은 동안 h 는
 * 0.58 · 0.51 · 0.07 · 0.50 · 0.07 · 0.50 으로 출렁인다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `gateLetsThrough` 는 한 걸음 안의 문 셋을, `fewerGates` 는 GRU 의 짜임을, 완제품 `gatedCells` 는 셀을 바꿔
 * 방해 입력을 건너는 남은 몫을 견준다. 이쪽의 한 동사는 **실려 간다** — 주인공은 여러 걸음을 가로지르는 c 의 길이다.
 * 그래서 definition 은 cell state · separate path · persists while the hidden output swings 를 독점하고, 문 셋의 이름 풀이 ·
 * distractors · RNN/GRU 비교를 쓰지 않는다.
 *
 * 전제: 칸 하나 · 문과 후보는 x 만 봄(w_h 0) · 무게는 예로 정한 값.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cellCarriesLongConcept: FacetConceptSource = {
  id: 'cellCarriesLong',
  label: 'The LSTM Cell State Carries a Value Far',
  canonicalFacet: 'facet:cellCarriesLong',

  surface: {
    definition:
      'The LSTM cell state is a dedicated path on which a stored value is only multiplied by the forget gate each step, so it persists across many steps while the gated hidden output swings.',
    exemplarKeywords: [
      'LSTM cell state',
      'c_t vs h_t',
      'memory cell',
      'cell state highway',
      'conveyor belt of the LSTM',
      'additive cell update',
      'forget gate close to 1',
      'long-term memory vs short-term output',
      'information flowing unchanged through time',
      'why the LSTM remembers longer',
    ],
  },

  briefing: {
    observable: [
      'Six steps run left to right with inputs 2, 1, 0, 1, 0, 1. Two lanes run across them: a "Cell state" lane c on top and a "Hidden state" lane h below. The start caption reads "Inputs to feed: 6. The cell starts at c = 0.00."',
      'Step 1 writes into the cell: "0.00 × f 0.98 = 0.00, + 0.67 → c 0.67", and h comes out as "o 1.00 × tanh(c) = 0.58".',
      'From step 2 on, each link of the c lane is marked "f ×0.98" and the amount added is +0.01 or +0.00; c reads 0.67, 0.67, 0.66, 0.65, 0.64, 0.64.',
      'Over the same steps each h is its own tanh(c) times the output gate — ×1.00, ×0.88, ×0.12, ×0.88, ×0.12, ×0.88 — so h swings 0.58, 0.51, 0.07, 0.50, 0.07, 0.50.',
      'The final caption reads "Step 1 → step 6: c 0.67 → 0.64. Remaining ratio: 0.95 · product of f: 0.91 · Over the same steps, range of h: 0.07 ~ 0.58". The cell lane has no weight multiplication and no tanh on it; the only thing multiplied along it is the gate.',
      'Premises the screen does not footnote: the state is one number; the gates and candidate look only at x (f = σ(4), i = σ(6x − 10), g = tanh(0.5x), o = σ(4x − 2)), a simplification unrelated to why the cell path is long; the weights are chosen for the example.',
    ],

    screen: {
      affordances: [
        'The screen plays six steps by itself, one input per step, and stops with the remaining ratio shown.',
        'A Replay button and a playback strip sit below it. Scrubbing to step 3 and then step 4 sets h dropping to 0.07 and jumping back to 0.50 against a c that barely moves.',
        'All inputs and gate formulas are fixed, so 0.67, 0.64 and 0.95 can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article says an LSTM has "two states" and needs the reader to see why: the cell c holds 0.67 → 0.64 across six steps while the output h swings between 0.07 and 0.58 over the same steps.',
      'The reader has heard the cell state called a highway or conveyor belt and needs to see what that means in numbers — only a forget gate of 0.98 multiplied in each step, no weight and no squashing.',
    ],

    avoidWhen: [
      'The subject is what each gate does inside one step. The gate values are shown per step but not unpacked in the order of the computation.',
      'The article compares LSTM cells with plain RNN or GRU cells on the same inputs. Only one LSTM runs here.',
      'The subject is the cell of a spreadsheet, a biological cell, or a memory cell in hardware. This is the LSTM cell state.',
      'The point is a forget gate that closes to erase memory. The forget gate here stays at 0.98 throughout.',
    ],

    contrastWith: [
      {
        concept: 'gateLetsThrough',
        note: 'How the three gates act inside one step is the mechanism; what that mechanism achieves over many steps — a value surviving because the forget gate stays near one — is the claim here.',
      },
      {
        concept: 'vanishingOverTime',
        note: 'A plain recurrent state is multiplied by a weight and a tanh slope at each step, and the product shrinks fast. The cell state is multiplied only by a gate that can stay near one, so its product barely shrinks.',
      },
      {
        concept: 'carryHiddenState',
        note: 'Both carry something from step to step, but a plain hidden state is rebuilt through tanh from the new input each time, while the cell state is mostly passed on unchanged with small additions.',
      },
      {
        concept: 'gatedCells',
        note: 'A long cell path is one design choice of the LSTM. Whether it, a GRU or an ungated cell keeps an early value best when distractor inputs arrive in between is a comparison across designs.',
      },
    ],
  },
};
