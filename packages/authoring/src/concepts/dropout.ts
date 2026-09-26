/**
 * dropout 개념 선언.
 *
 * canonical facet 은 `facet:dropout` — 은닉 칸 여섯(h · v 는 조각 dropRandomUnits 와 같다, 모두 켜면 y = 1.05)에 마스크
 * 마흔 벌을 한 걸음에 다섯 벌씩 흘려 출력 y 를 축 위에 점으로 쌓는다. 손잡이 둘 — 쉴 확률 p(0 · 0.1 · 0.4 · 0.7) ·
 * 되살림(켬 · 끔). 켬이면 기댓값은 1.050 그대로 흩어짐만 0.00 · 0.20 · 0.58 · 0.92 로 커지고, 끔이면 기댓값이
 * (1 − p) 배(0.945 · 0.630 · 0.315)로 내려간다. 표본 평균은 기댓값과 따로 보인다. 걸음 열.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 하나)
 *
 * 조각 `dropRandomUnits` 는 **걸음마다 다른 칸이 쉬어** 같은 입력이 다른 출력을 내는 장면이다(p 0.5 고정 · 다섯 번).
 * 이쪽은 **많은 마스크를 모았을 때 무리가 어디에 모이고 얼마나 퍼지는가**와 1/(1 − p) 로 메우는 까닭을 쥔다. 그래서
 * definition 은 inverted dropout · rescaling · expected output · spread grows with drop rate · without rescaling shifts
 * 를 쥐고, 조각이 독점한 fresh mask each step · same input different output · no unit always present 를 쓰지 않는다.
 *
 * 전제 (설명 글 `dropout.md`): 뽑힌 수 u 는 한 번 뽑아 고정하고 모든 p 에 같은 u 를 쓴다 · 뽑힌 수 ≥ p 면 켜짐 ·
 * 흩어짐은 마흔 출력의 모집단 표준편차 · 쉰 몫은 칸 240 개 중 쉰 칸의 백분율 · 무게 갱신은 없다 · 코드 패널은
 * IR → 여섯 언어의 `dropoutRun`.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dropoutConcept: FacetConceptSource = {
  id: 'dropout',
  label: 'Dropout: Drop Rate and Inverted Rescaling',
  canonicalFacet: 'facet:dropout',

  surface: {
    definition:
      'Inverted dropout divides surviving activations by (1 − p), so the expected output stays at the full-network value while its spread grows with the drop rate; without that rescaling the expected output falls to (1 − p) times it.',
    exemplarKeywords: [
      'dropout',
      'inverted dropout',
      'dropout rate',
      'scale by 1/(1 - p)',
      'Srivastava Hinton dropout 2014',
      'nn.Dropout',
      'Keras Dropout layer',
      'dropout at test time',
      'train/test mismatch without rescaling',
      'dropout as regularization',
      'expected value of dropout output',
    ],
  },

  briefing: {
    observable: [
      'Six hidden units, each with a value h and a weight v into one output. With all units on, y = Σ hᵢ·vᵢ = 1.05, and this "All-on output" is marked on an axis at the right.',
      'Forty masks flow through, five per step. Each mask switches some units off, and each mask\'s output y drops as a dot onto the axis, piling up into a cloud. A round is ten steps: all on, eight steps of five masks, then the summary.',
      'The formula shown is y = Σ mᵢ·hᵢ·vᵢ / (1 − p) with rescaling on, and y = Σ mᵢ·hᵢ·vᵢ with it off. Counters read "Masks" and "Units dropped".',
      'Three markers are kept apart: the all-on output, the expected value (computed, not sampled: Σ (1 − p)·hᵢ·vᵢ, divided by (1 − p) when rescaling is on), and the sample mean, which appears only at the summary step.',
      'With rescaling on, the expected value stays 1.050 for every p while the spread (standard deviation) grows 0.00, 0.20, 0.58, 0.92 for p = 0, 0.1, 0.4, 0.7 — the fewer units survive, the more each is enlarged and the wider a single output can land.',
      'With rescaling off, the whole cloud slides down: expected value 0.945, 0.630, 0.315 for p = 0.1, 0.4, 0.7, with spreads 0.18, 0.35, 0.28.',
      'At the default p 0.4 with rescaling on, the sample mean of forty masks is 1.03 against the expected 1.050; at the summary the sample-mean marker visibly separates from the expected-value marker. The dropped share is 38%.',
      'Premises the screen does not footnote: the random numbers were drawn once and the same draws serve every p, so raising p only switches more units off in the same masks; a unit stays on when its draw is at least p; spread is the population standard deviation of the forty outputs; dropped share is dropped units out of 240 (six times forty); no weight is trained.',
    ],

    screen: {
      affordances: [
        'Playback controls (Play, Step, Pause, Reset, Speed) plus two handles: a "Drop rate p" slider with 0, 0.1, 0.4, 0.7 (starting at 0.4) and a "Rescale" slider with On and Off (starting at On).',
        'Two moves carry the idea. Raising p with rescaling on widens the cloud while its expected-value marker stays pinned at 1.050. Switching rescaling off at the same p drops the whole cloud to (1 − p) of the all-on value.',
        'The code panel, labelled "Dropout: outputs, mean, spread", starts empty with a "+ Add language" button; the chosen language shows `dropoutRun`, which calls `maskedOutput` for each mask, while `expectedOutput` computes the expected value separately. It carries one meaning across Python, JavaScript, TypeScript, Java, C++ and C#.',
      ],
    },

    useWhen: [
      'The article explains why dropout implementations divide by (1 − p) during training, and needs to show the alternative failing: without it the training-time outputs centre on (1 − p) of what the full network gives at test time.',
      'A reader asks what raising the dropout rate actually does to one layer\'s output; holding the expected value fixed at 1.050 while the spread grows from 0.20 to 0.92 separates the unchanged average from the added noise.',
    ],

    avoidWhen: [
      'The article is about dropout\'s effect on overfitting, validation accuracy or training curves. No training happens; only the outputs of one fixed layer under masks are shown.',
      'The subject is dropout on inputs, DropConnect on weights or Monte Carlo dropout for uncertainty. The masks here act on six hidden units only.',
      'The claim concerns batch normalisation or weight decay. Neither appears; only the dropout mask acts on the layer.',
    ],

    contrastWith: [
      {
        concept: 'dropRandomUnits',
        note: 'That a fresh random mask changes the output on every pass is the basic mechanism; what those outputs average to across many masks, and why the survivors are scaled up, is the statistical claim built on it.',
      },
      {
        concept: 'batchnorm',
        note: 'Both behave differently in training and at test time. Dropout injects noise by removing units and rescales so the average matches; batch normalisation removes variation by standardising each batch.',
      },
      {
        concept: 'weightPenalty',
        note: 'Both are regularisers, but a weight penalty changes the objective to keep weights small, while dropout leaves the objective alone and randomises which units take part.',
      },
    ],
  },
};
