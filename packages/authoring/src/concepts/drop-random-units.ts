/**
 * dropRandomUnits 개념 선언.
 *
 * canonical facet 은 `facet:dropRandomUnits` — 칸 여섯(u1 ~ u6)과 출력 하나의 작은 층에 같은 입력을 다섯 번 흘린다.
 * 걸음마다 새 마스크가 칸 몇을 끄고(3 · 2 · 4 · 1 · 2 칸), 켜진 칸은 몫을 두 배(p = 0.5)로 실어 출력이 2.18 · 0.76 · 0.30 ·
 * 1.56 · 1.50 으로 매번 다르다. 왼쪽 격자에 마스크의 자취가 남아, 다섯 걸음 뒤 여섯 칸 모두 두 번씩 쉬었다.
 * 스스로 재생하고 멈춘다. 여섯 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `dropout` 은 마스크 마흔 벌을 모아 기댓값과 흩어짐, 1/(1 − p) 로 메우는 까닭을 쥔다. 이쪽의 한 동사는
 * **쉰다** — 걸음마다 다른 칸이 쉬어 같은 입력이 다른 출력을 낸다. 그래서 definition 은 each training step · fresh
 * random mask · same input different output · no unit always present 를 쥐고, expected value · spread · drop rate
 * sweep · rescaling on/off 를 쓰지 않는다. 두 배로 키우는 것은 화면에 있으나 그 까닭(기댓값)은 이쪽이 말하지 않는다.
 *
 * 전제: 장난감 자료 · 마스크는 뽑은 결과를 그대로 적은 것 · p = 0.5 · h 와 v 는 바뀌지 않는다 · 갱신도 시험 때 모두
 * 켜는 일도 그리지 않는다 · 다섯 출력의 평균 1.26 은 모두 켠 1.05 와 같지 않다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const dropRandomUnitsConcept: FacetConceptSource = {
  id: 'dropRandomUnits',
  label: 'Dropout Silences Different Units Each Step',
  canonicalFacet: 'facet:dropRandomUnits',

  surface: {
    definition:
      'During training, each forward pass draws a fresh random mask that silences some hidden units, so the same input gives a different output every step and no single unit can be relied on to be present.',
    exemplarKeywords: [
      'dropout mask',
      'randomly dropping neurons',
      'random subset of units each iteration',
      'thinned network',
      'co-adaptation of neurons',
      'Bernoulli mask',
      'dropout during training only',
      'ensemble of subnetworks',
      'why dropout adds noise',
    ],
  },

  briefing: {
    observable: [
      'A small layer: six units u1 … u6, each with an output h and a weight v into one output. The same single input flows through five times; h and v never change — only the mask does.',
      'Step 0 has no mask: every unit is on, each unit\'s share is h·v and the output is y = 1.05.',
      'In steps 1 … 5 a mask switches some units off. An off unit\'s weight line breaks open in the middle and its share bar shrinks to 0; it adds nothing to the output.',
      'Units left on carry their share along their lines, and their bars grow to twice the dashed mark of the unscaled share h·v: "Active units carry ×2 their share", because the drop probability is p = 0.5 and the layer divides by (1 − p).',
      'The number of resting units is drawn too, so it varies: 3, 2, 4, 1, 2. The output differs every step — 2.18, 0.76, 0.30, 1.56, 1.50 — and past outputs stay as ticks under the output bar.',
      'A grid on the left keeps the trail of past masks. After five steps every one of the six units has rested exactly twice and been on at least once: "Rested at least once: 6/6". No unit is always there.',
      'Premises the screen does not footnote: the data are toy values and the masks are one recorded random draw; the five outputs average 1.26, not the all-on 1.05 — the doubling aims at the expected value, which five draws cannot establish; no weight update and no test-time pass are shown.',
    ],

    screen: {
      affordances: [
        'The screen plays by itself, one mask per step, and stops after the fifth mask — six steps including the unmasked start.',
        'A Replay button and a playback strip sit below it. Scrubbing between steps 2 and 3 shows the same input going from 0.76 to 0.30 as a different set of units rests.',
        'Every mask, share and output is fixed, so the resting counts 3 · 2 · 4 · 1 · 2 and outputs can be quoted exactly.',
      ],
    },

    useWhen: [
      'The article introduces dropout and wants the first thing a reader must picture: on each training step a different random set of hidden units is switched off, and the output for the very same input changes.',
      'A reader asks how dropout stops units from depending on one another; a trail in which all six units rest twice in five steps shows that no unit can count on any particular neighbour being there.',
    ],

    avoidWhen: [
      'The article is about why survivors are scaled by 1/(1 − p) or what the output equals on average. The doubling is visible, but five draws do not show the average it protects.',
      'The subject is the effect of dropout on overfitting or test accuracy. No training and no test pass appear.',
      'The discussion is about choosing the dropout rate. The rate is fixed at 0.5 here.',
    ],

    contrastWith: [
      {
        concept: 'dropout',
        note: 'That each pass uses a different random mask is the mechanism; what the outputs centre on over many masks, how the drop rate widens them, and why survivors are rescaled are the claims about its statistics.',
      },
      {
        concept: 'rescaleEachBatch',
        note: 'Both make training depend on something beyond the single example: here a random mask decides which units exist, there the other examples in the batch decide how each value is standardised.',
      },
      {
        concept: 'baggingSample',
        note: 'Both train on random variations — bagging resamples the data for separate models, dropout samples a different subnetwork inside one model on every step.',
      },
    ],
  },
};
