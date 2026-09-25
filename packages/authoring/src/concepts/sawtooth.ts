/**
 * sawtooth 개념 선언.
 *
 * canonical facet 은 `facet:sawtooth` — 망 용량 한 왕복 8 조각, 처음 창 4. 창은 4 · 5 · 6 · 7 · 8 을 지나 9 가 되는
 * 여섯째 왕복에서 넘쳐 잃고 ⌊9/2⌋ = 4 로 돌아간다. 열두째 왕복에서 한 번 더. 왕복마다 남긴 창이 이어져 톱니가 되고,
 * 톱니 하나의 평균 창은 6.50 · 용량의 0.81 이다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * `congestionControl`(완제품)에서는 망이 조이는 쪽일 때만 톱니가 선다. 형제 조각 가운데 `slowStart` 는 출발의 불어나기,
 * `backOffOnLoss` 는 잃음 하나에 꺾는 사건. 이쪽은 **그 둘을 오래 되풀이한 모양과 그 평균이 용량에 못 미친다** 를 쥔다.
 * 그래서 definition 은 additive increase · multiplicative decrease · repeating sawtooth · average below capacity 를
 * 독점하고, 중복 확인 · 문턱 · 확인마다 · 두 배는 쓰지 않는다.
 *
 * 전제 (설명 글 `sawtooth.md`): 용량 8 · 처음 창 4 · 왕복 열셋은 예로 정한 값. 처음 창 4 는 한 번 줄어든 뒤라고
 * 친 것이라 슬로 스타트는 없다. 창은 조각 수. 잃음을 알아채는 법과 빠른 회복은 그리지 않는다. 규칙은 "용량을 넘으면
 * 그 왕복에서 잃고 절반(내림), 아니면 하나 더" 뿐.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const sawtoothConcept: FacetConceptSource = {
  id: 'sawtooth',
  label: 'Congestion Window Sawtooth (AIMD)',
  canonicalFacet: 'facet:sawtooth',

  surface: {
    definition:
      'Under additive increase and multiplicative decrease, the congestion window climbs linearly, halves whenever it exceeds link capacity, and repeats, tracing a sawtooth whose average stays below that capacity.',
    exemplarKeywords: [
      'AIMD',
      'additive increase multiplicative decrease',
      'TCP sawtooth',
      'congestion window over time',
      'cwnd graph',
      'link utilization',
      'why TCP cannot fill the link',
      'average throughput below bandwidth',
      'steady-state TCP behavior',
      'bandwidth probing',
    ],
  },

  briefing: {
    observable: [
      'A chart with "Round trip" across and "Window (segments)" up, and a line at "Capacity: 8". The opening caption reads "Capacity per round trip: 8 · starting window: 4".',
      'A pen — a column of cells as tall as the current window — moves one round trip to the right each step and leaves a dot at its height; the dots join into a line. Cells above capacity show in a warning colour.',
      'The window climbs 4, 5, 6, 7, 8 ("Round trip 3 · window: 6 · no loss · next window: 7"). At round trip 6 it reaches 9: "window: 9 > capacity: 8 · loss · next window: 4", marked with a cross instead of a dot, and the top of the pen folds away.',
      'When a tooth closes, a horizontal line is drawn across it with "Mean: 6.50", and the caption reads "Tooth, round trips 1–6 · mean window: 6.50 · mean ÷ capacity: 0.81". The same tooth repeats, losing again at round trip 12 and falling back to 4 at 13.',
      'The run is an opening state plus thirteen round trips, fourteen steps. Capacity 8, starting window 4 and the thirteen round trips are fixed example values; starting at 4 stands for a window already cut once, so there is no slow start. The window is counted in segments, loss detection is not drawn, and the only rule is "over capacity: lose and halve, rounding down; otherwise add one". The screen does not footnote these.',
    ],

    screen: {
      affordances: [
        'The screen plays the thirteen round trips by itself and stops.',
        'A Replay button and a playback strip sit below it. The moment worth dragging back to is the close of the first tooth, when the mean line appears below the capacity line and the ratio 0.81 is printed.',
        'Capacity and starting window are fixed, so every window value and the mean can be quoted exactly.',
      ],
    },

    useWhen: [
      'The reader asks why a single TCP flow does not use its link fully. The mean line settling at 0.81 of capacity, tooth after tooth, gives a concrete figure.',
      'The article introduces additive increase and multiplicative decrease as the long-run behaviour of a sender and wants the shape it draws over time.',
    ],

    avoidWhen: [
      'The subject is the start of a connection, where the window grows from one segment. This run begins after a cut and never doubles.',
      'The article explains how the loss is detected — duplicate acknowledgments or a timeout. Losses here are only marked.',
      'The subject is several flows sharing a link and converging to fairness. There is one flow.',
    ],

    contrastWith: [
      {
        concept: 'slowStart',
        note: 'The sawtooth is the steady pattern after the opening ramp. Slow start is that ramp, where the window grows much faster and has not yet met a loss.',
      },
      {
        concept: 'backOffOnLoss',
        note: 'The sawtooth assumes each loss halves the window. How a sender actually detects that loss and resends is the mechanism underneath that single fall.',
      },
      {
        concept: 'congestionControl',
        note: "The sawtooth appears when the network is the only limit on the sender. If the receiver's window is the tighter limit, the same sender runs flat and loses nothing.",
      },
    ],
  },
};
