/**
 * fewerGates 개념 선언.
 *
 * canonical facet 은 `facet:fewerGates` — 같은 입력 넷(−1 · 0 · 0 · 0)을 LSTM 과 GRU 가 나란히 받는다. LSTM 은 따로 도는
 * 두 문 f · i 의 합이 1.68 · 1.07 · 1.07 · 1.07, GRU 는 문 z 하나가 지킬 몫 z 와 들일 몫 1 − z 로 갈려 합이 걸음마다 1.00.
 * 문 3 | 2 · 넘기는 상태 2 | 1 · 무게 12 | 9. 끝에 둘 다 첫 입력의 음수를 지닌다 (LSTM h −0.54 · GRU h −0.68).
 * 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 형제 `gateLetsThrough` 는 LSTM 한 걸음의 문 셋을, `cellCarriesLong` 은 c 의 긴 길을, 완제품 `gatedCells` 는 셀을 바꿔
 * 방해 입력을 건너는 남은 몫을 견준다. 이쪽의 한 동사는 **묶인다** — 두 문이 하나로. 그래서 definition 은 GRU ·
 * update gate · merges · sum to one · hidden state alone 을 독점하고, distractors · kept share · 셀 길의 곱을 쓰지 않는다.
 *
 * 전제: 칸 하나 · 문은 x 만 봄(w_h 0 — 무게 수에는 넣음) · 무게는 예로 정한 값 · z 를 지킬 몫으로 두는 꼴(Cho 2014) ·
 * 학습 없음.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const fewerGatesConcept: FacetConceptSource = {
  id: 'fewerGates',
  label: 'GRU: Fewer Gates Than an LSTM',
  canonicalFacet: 'facet:fewerGates',

  surface: {
    definition:
      'A GRU merges the LSTM’s independent forget and input gates into one update gate whose keep and take-in shares always sum to one, and carries a hidden state alone instead of a cell plus a hidden state.',
    exemplarKeywords: [
      'GRU',
      'gated recurrent unit',
      'update gate z',
      'reset gate r',
      'GRU vs LSTM',
      'h_t = z * h_{t-1} + (1 - z) * h~_t',
      'fewer parameters than LSTM',
      'coupled forget and input gates',
      'no separate cell state',
      'Cho et al. 2014',
    ],
  },

  briefing: {
    observable: [
      'Two models stand side by side on the same inputs -1, 0, 0, 0: an LSTM panel with "Gates: 3 · States carried: 2 · Weights: 12" and a GRU panel with "Gates: 2 · States carried: 1 · Weights: 9". The start caption reads "Same inputs for both models. States carried — LSTM: 2 · GRU: 1."',
      'In the LSTM, the forget gate f and the input gate i are two separate values; their "Sum" reads 1.68 at step 1 and 1.07 at each later step.',
      'In the GRU, one update gate z sets both shares: z to keep and "take-in share 1−z" to let in. Its "Sum" reads 1.00 at every step — z 0.18 with 1−z 0.82 at step 1, then z 0.92 with 1−z 0.08.',
      'Each step shows the new state as "kept + taken": for the LSTM c goes 0.00 → -0.73 → -0.75 → -0.77 → -0.79 and h = o × tanh(c) goes -0.51, -0.52, -0.53, -0.54; the GRU carries h alone, -0.81 → -0.77 → -0.73 → -0.68.',
      '"Gate evaluations" counts up by 3 for the LSTM and 2 for the GRU at each step, ending at 12 and 8. The last caption reads "First input: -1. Final h — LSTM: -0.54 · GRU: -0.68." — both still carry the sign of the first input.',
      'Premises the screen does not footnote: each state is one number; the gates look only at x (their recurrent weights are 0 but still counted as weights), and only the candidates look at the previous state; the weights are chosen for the example; the GRU uses the form where z is the share kept (Cho 2014), though some texts swap z and 1 − z; nothing is trained, so which model learns better is not addressed.',
    ],

    screen: {
      affordances: [
        'The screen plays both models together by itself, one input per step, and stops after the fourth.',
        'A Replay button and a playback strip sit below it. Scrubbing across the steps sets the LSTM\'s sum moving (1.68, then 1.07) against the GRU\'s sum fixed at 1.00.',
        'All inputs, weights and counts are fixed, so 3 vs 2 gates, 12 vs 9 weights and -0.54 vs -0.68 can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces the GRU after the LSTM and needs to show precisely what was merged: two independent gates became one gate split as z and 1 − z, and the cell state disappeared.',
      'A reader asks whether the GRU, with fewer gates and fewer weights, can still hold on to an earlier input, and the article wants both models fed the same inputs and both final values shown.',
    ],

    avoidWhen: [
      'The article benchmarks GRU against LSTM on accuracy or training speed. Nothing is trained here.',
      'The subject is how long either model keeps a value through many distractor inputs. Four steps with a single nonzero input are shown.',
      'The point is the internal order of one LSTM step. The LSTM here is summarised per step, not unpacked gate by gate.',
      'The article uses the convention where z is the share replaced rather than kept. The formulas here follow the other form.',
    ],

    contrastWith: [
      {
        concept: 'gateLetsThrough',
        note: 'The LSTM\'s three gates each act on their own flow; the GRU ties the keep and take-in decisions into one gate so the two shares can no longer move independently.',
      },
      {
        concept: 'cellCarriesLong',
        note: 'The LSTM keeps long-lived values in a cell state separate from its output. The GRU has no such second state; its one hidden state plays both roles.',
      },
      {
        concept: 'gatedCells',
        note: 'How the GRU is put together — fewer gates, one state, fewer weights — is a question of structure. Whether that structure keeps an early value through a long run of distractors as well as an LSTM does is a question of outcome.',
      },
    ],
  },
};
