/**
 * gateLetsThrough 개념 선언.
 *
 * canonical facet 은 `facet:gateLetsThrough` — LSTM 의 한 걸음(입력 x 1 · h_prev 0.5 · c_prev 2)을 흐름의 차례로 푼다.
 * 잊는 문 f 0.12 가 지난 셀 2.00 중 0.24 만 남기고, 후보 g 0.76 중 들이는 문 i 0.88 이 0.67 을 들이고, 새 셀 c 0.91 에서
 * 내보내는 문 o 0.73 이 h 0.53 을 낸다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `gatedCells` 는 같은 입력 길에서 셀을 바꿔 남은 몫을 견주고, 형제 `cellCarriesLong` 은 여러 걸음을 가로지르는
 * c 의 길을, `fewerGates` 는 GRU 가 문을 묶은 짜임을 쥔다. 이쪽의 한 동사는 **걸러진다** — 한 걸음 안에서 문 셋이 각자
 * 흐름에 곱해진다. 그래서 definition 은 forget · input · output gate 의 이름과 one step · sigmoid · multiply 를 독점하고,
 * many steps · distractors · GRU 를 쓰지 않는다.
 *
 * 전제: 칸 하나 · 무게와 상태는 예로 정한 값 · 엿보기 구멍 없음 · 흐름이 모두 0 이상(막대로 그리려고) · 한 걸음만.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const gateLetsThroughConcept: FacetConceptSource = {
  id: 'gateLetsThrough',
  label: 'LSTM Gates Let a Share Through (One Step)',
  canonicalFacet: 'facet:gateLetsThrough',

  surface: {
    definition:
      'Within one LSTM step, the forget, input and output gates are sigmoid values between zero and one that multiply the old cell, the new candidate and the outgoing activation to set how much of each passes.',
    exemplarKeywords: [
      'LSTM gates',
      'forget gate',
      'input gate',
      'output gate',
      'candidate value tanh',
      'c_t = f * c_{t-1} + i * g',
      'h_t = o * tanh(c_t)',
      'sigmoid gate between 0 and 1',
      'element-wise multiplication gating',
      'inside an LSTM cell',
      'how an LSTM decides what to forget',
    ],
  },

  briefing: {
    observable: [
      'The step starts from "In: x 1 · h_prev 0.50 · c_prev 2.00", with three gate slots labelled Forget gate, Input gate and Output gate, a Candidate slot, and the old cell c_prev 2.00 as a bar.',
      'Step 1: the forget gate opens to f = 0.12 (σ(-2.00)) and multiplies the old cell, so f·c_prev keeps 0.24 and 1.76 is let go.',
      'Step 2: the candidate g = tanh(1.00) = 0.76 appears. Step 3: the input gate opens to i = 0.88 (σ(2.00)) and i·g lets in 0.67.',
      'Step 4: the two shares meet — "New cell c = 0.24 + 0.67 = 0.91". Step 5: the output gate o = 0.73 (σ(1.00)) multiplies tanh(c) 0.72, giving "h = 0.73 × 0.72 = 0.53".',
      'Each gate is shown with its sigmoid argument, and each flow is drawn as a bar before and after its gate, so the fraction let through is visible as the bar shortening.',
      'Premises the screen does not footnote: the state is one number; the gate weights and the incoming h_prev and c_prev are chosen for the example, with the forget gate nearly shut so most of the old cell is dropped; there are no peephole connections; every flow here is non-negative so it can be drawn as a bar, though in general g and c can be negative; only one step is shown.',
    ],

    screen: {
      affordances: [
        'The screen plays the five flow steps by itself — forget, candidate, admit, combine, output — and stops once h is produced.',
        'A Replay button and a playback strip sit below it. Scrubbing back to step 1 holds the moment the old cell of 2.00 is cut to 0.24 by a gate of 0.12.',
        'All inputs and gate values are fixed, so 0.12, 0.88, 0.73, 0.91 and 0.53 can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article writes out the LSTM equations and the reader needs to see each gate act as a multiplier on one specific flow, in the order the computation happens, rather than as three abstract symbols.',
      'A reader thinks "forget gate 0.12" means the network forgets 12 percent, and the article needs the opposite made plain: 0.12 is the share that stays, and 1.76 of 2.00 is let go.',
    ],

    avoidWhen: [
      'The subject is how an LSTM keeps information across many steps. Only a single step is unpacked here.',
      'The article compares LSTM with GRU or a plain RNN. One LSTM cell is shown and nothing else.',
      'The subject is gating in Transformers, mixture-of-experts routers or gated linear units. The gates here are the three LSTM gates.',
      'The point is training the gate weights. The weights are fixed and nothing is learned.',
    ],

    contrastWith: [
      {
        concept: 'cellCarriesLong',
        note: 'What the gates do inside one step is the mechanism; the cell state being carried across many steps is what that mechanism makes possible when the forget gate stays open.',
      },
      {
        concept: 'fewerGates',
        note: 'Three gates acting on separate flows is the LSTM design; tying the keep and take-in shares into one gate and dropping the separate cell is the GRU\'s simplification of it.',
      },
      {
        concept: 'squashToProbability',
        note: 'Each gate value is produced by a sigmoid squashing a score into the range between zero and one; here that value is then used as a multiplier on a flow rather than read as a probability.',
      },
      {
        concept: 'gatedCells',
        note: 'Unpacking one step shows what each gate multiplies. Whether gating as a whole keeps an early value alive across many distractor inputs, compared with an ungated cell, is a question about the whole sequence.',
      },
    ],
  },
};
