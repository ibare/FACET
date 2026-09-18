/**
 * flattenOrSharpen 개념 선언.
 *
 * canonical facet 은 `facet:flattenOrSharpen` — 조각이다. 문맥 `The sky is` 뒤의 후보
 * 다섯(blue · clear · dark · grey · green)의 몫이 캔버스 폭을 나눈 띠 한 줄이 되고,
 * 온도가 1.0 → 0.5 → 2.0 차례로 바뀔 때마다 띠가 한 줄씩 아래로 내려오며 칸의 경계가
 * 미끄러진다. 두 줄 사이의 흐름 띠는 서로 엇갈리지 않는다. 스스로 한 바퀴 재생하고
 * 그 뒤로는 되감아 한 걸음씩 짚는다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **한 순간의 분포 모양**이다 — 뽑기도, 시간도, 다른 손잡이도
 * 없다. definition 의 주어는 "소프트맥스 앞에서 로짓을 나누는 수 하나" 이고, 꼬리는
 * "어느 후보가 앞서는지는 바꾸지 않는다" 로 `penalizeRepeats` 의 꼬리("앞서는 후보가
 * 바뀔 수 있다") 와 마주 본다 (마주 보는 짝).
 *
 * 어휘 배타: 완제품의 draw · random · sample · penalty · repeat 와, 형제 조각의 already ·
 * appear · sign · negative 를 definition 에 쓰지 않았다 (기계 확인 0 건).
 *
 * ── 전제
 *
 * 로짓(3.0 · 2.2 · 1.4 · 0.8 · −0.5)은 예로 정한 값이다. 화면의 몫은 소수 둘째 자리로
 * 반올림해 보인다 — green 의 0.00 은 참값 0.0007 이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const flattenOrSharpenConcept: FacetConceptSource = {
  id: 'flattenOrSharpen',
  label: 'Flatten or Sharpen (What Temperature Does to the Distribution)',
  canonicalFacet: 'facet:flattenOrSharpen',

  surface: {
    definition:
      'Temperature divides every logit by one number before softmax: below one it concentrates probability on the leading candidate, above one it evens the shares out, and it never changes which candidate leads.',
    exemplarKeywords: [
      'softmax temperature',
      'logits divided by temperature',
      'sharper or flatter probability distribution',
      'low temperature makes the model more confident',
      'high temperature spreads probability',
      'does temperature change the ranking',
      'temperature scaling',
      'entropy of the next-token distribution',
      'peaked versus uniform distribution',
      'what temperature 0.5 means',
    ],
  },

  briefing: {
    observable: [
      'Each temperature is one band across the canvas, divided among the five candidates in proportion to their probability and always in the same left-to-right order, with the value printed in any cell wide enough to hold it and the band labelled with its temperature and "logits ÷" that number.',
      'At temperature 1.0 blue holds 0.56 and green, in last place, 0.02 — the caption names both even where a cell is too thin to print its own value — and spells out that every logit is divided first and softmax comes after.',
      'Dropping to 0.5 pushes a new band down beneath the first and the boundaries slide right: blue widens to 0.80, and green reads 0.00 — a rounded display of about 0.0007, not an actual zero.',
      'Rising to 2.0 slides the boundaries back the other way: blue falls to 0.38 and green climbs to 0.07, so the shares spill down the list.',
      'Between consecutive bands a ribbon joins each candidate\'s old cell to its new one, and the ribbons never cross, because the ranking blue, clear, dark, grey, green holds at every temperature; the caption reports "Order unchanged" after each move.',
      'The five logits are invented for the example rather than taken from a real model.',
    ],

    screen: {
      affordances: [
        'The screen plays through its three temperatures on its own — 1.0, then 0.5, then 2.0 — and stops with all three bands stacked.',
        'Beneath it are a Replay button and a playback strip; after the run, dragging the strip back to an earlier band holds that state so two neighbouring bands can be compared.',
        'The context, the five candidates, their logits and the temperature sequence are fixed, so an article can quote any share and name the temperature it belongs to.',
      ],
    },

    useWhen: [
      'A reader believes a lower temperature makes a model pick a different, "safer" word; the ribbons never crossing show that only the size of the lead changes, never who holds it.',
      'An article says temperature makes the model more or less confident and needs that to be a number: blue\'s share goes 0.56, 0.80, 0.38 across the three settings.',
      'The prose explains why dividing before softmax matters more than it looks — halving the temperature doubles every gap, and the widening first cell is the exponential making that gap count.',
    ],

    avoidWhen: [
      'The article is about what actually gets generated — picking a word by chance, how varied the output turns out, or how often it repeats. Nothing is chosen on this screen; it stops at the probabilities.',
      'The subject is temperature exactly zero or the limit of infinite temperature. The three settings shown are 0.5, 1.0 and 2.0, and neither extreme is displayed.',
      'Temperature is meant in the sense of calibrating a classifier\'s confidence after training, or annealing in an optimiser; the words match and the subject does not.',
      'The article needs a real model\'s probabilities. The logits are chosen for the example.',
    ],

    contrastWith: [
      {
        concept: 'temperatureSampling',
        note: 'This stops at the shape of one distribution; the other begins where choices are drawn from such a shape, and where a second setting can make the first behave in the opposite way.',
      },
      {
        concept: 'penalizeRepeats',
        note: 'Both alter scores before softmax, but dividing all of them by one number preserves their ranking, whereas cutting only some of them is precisely a way to overturn it.',
      },
      {
        concept: 'alwaysTheHighest',
        note: 'Taking the top candidate outright ignores the shape of the distribution; this is entirely about that shape, and it leaves the top candidate where it was.',
      },
      {
        concept: 'cutTheTail',
        note: 'Removing low candidates changes which ones remain eligible; rescaling keeps all of them and only moves probability between them.',
      },
      {
        concept: 'squashToProbability',
        note: 'Turning one score into a probability through a fixed curve is a different step from rescaling a whole set of scores before they are normalised against each other.',
      },
    ],
  },
};
