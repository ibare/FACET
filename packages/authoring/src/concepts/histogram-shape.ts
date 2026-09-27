/**
 * histogramShape 개념 선언.
 *
 * canonical facet 은 `facet:histogramShape` — 규칙 하나("주사위 둘을 던져 큰 눈")로 표본을 뽑아 여섯 칸에 쌓는다.
 * 표본 수가 0 · 1 · 2 · 3 · 10 · 30 · 100 · 300 · 1000 으로 늘며, 열 개일 때는 들쭉날쭉하고 삼백 개에서 처음
 * 1 < 2 < … < 6 의 차례가 엄격히 선다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `clt` 는 평균들의 분포를 다룬다. 이쪽은 평균을 내지 않은 **낱 표본 자체**가 쌓여 제 규칙의 모양을 드러내는
 * 한 장면이다. 그래서 definition 은 histogram · bins · ragged · sample size · 칸 높이의 차례 쪽 낱말을 쥐고,
 * average · mean · spread · bell 을 쓰지 않는다. `lawOfLargeNumbers` 는 수 하나(비율)가 흔들리는 것이고, 이쪽은
 * 칸 여섯의 모양 전체다.
 *
 * 전제 (설명 글 `histogramShape.md` 가 밝힌 것):
 *  - 한 번의 뽑기다 (mulberry32, 씨앗 5). 300 에서 차례가 섰다는 것은 이 뽑기에서 그랬다는 뜻이다.
 *  - 씨앗 · 표본 수 · "큰 눈" 규칙은 예로 정한 값이다. 참 모양 (2k − 1)/36 은 화면에 겹쳐 그리지 않는다.
 *  - 주사위는 공정하고 두 주사위는 서로 영향을 주지 않는다고 본다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const histogramShapeConcept: FacetConceptSource = {
  id: 'histogramShape',
  label: 'Histogram: Samples Pile Into a Shape',
  canonicalFacet: 'facet:histogramShape',

  surface: {
    definition:
      'A histogram of draws from one fixed rule is ragged with a few samples, and only after hundreds do its bin heights line up in the order the rule\'s probabilities dictate.',
    exemplarKeywords: [
      'histogram',
      'frequency distribution',
      'empirical distribution',
      'how many samples do I need',
      'small sample noise',
      'bins and counts',
      'observed vs expected frequencies',
      'maximum of two dice',
      'simulation converges to the true distribution',
    ],
  },

  briefing: {
    observable: [
      'Six bins labelled 1..6 sit on an axis titled "Larger of two dice", with a "Samples: n" counter. The start caption reads "No samples yet — every bin is empty."',
      'The first three steps drop one sample each and name the dice: "Dice show 5 and 5; the larger, 5, drops into its bin", then 2 and 4 → 4, then 1 and 4 → 4.',
      'Later steps pour many at once — "Samples 3 → 10: 7 more pour in at once" — at 10, 30, 100, 300 and 1000 samples. The vertical scale is reset each step to the tallest bin, so what is compared is the order of the heights, not their size.',
      'Until the order holds, a caption names the worst offending pair and a red dashed line joins the top of the lower face\'s taller bin to the higher face\'s bin: at 10 samples the counts are 0 · 0 · 1 · 3 · 4 · 2 (bin 5 above bin 6); at 30, 0 · 4 · 2 · 6 · 7 · 11 (bin 2 above bin 3); at 100, 3 · 10 · 12 · 22 · 27 · 26 (bins 5 and 6 reversed).',
      'At 300 samples (8 · 21 · 53 · 64 · 74 · 80) the caption first reads "Heights rise in order", and at 1000 (27 · 78 · 156 · 206 · 260 · 273) the order still holds.',
      'The true shape for the larger of two dice is (2k − 1)/36 — 2.8%, 8.3%, 13.9%, 19.4%, 25.0%, 30.6% — but it is not drawn; only the counted bins appear. This is one run with seed 5, so another seed would settle at a different sample count. The screen does not footnote either point.',
    ],

    screen: {
      affordances: [
        'The screen plays nine steps by itself, from empty bins to 1000 samples, and stops.',
        'A Replay button and a playback strip sit below it. After the run, stepping back through 10, 30 and 100 samples shows the out-of-order pair moving from place to place before the order settles at 300.',
        'The seed and sample counts are fixed, so an article can quote every count exactly.',
      ],
    },

    useWhen: [
      'The article warns against reading a shape into a small sample and wants to show a histogram that looks wrong at 10 and 30 draws and right only at several hundred.',
      'A reader is meeting histograms for the first time and needs to see that each bar is a count of draws that fell into that bin.',
    ],

    avoidWhen: [
      'The article is about choosing bin widths, kernel density estimates or histogram-based database statistics. The bins here are fixed to the six faces.',
      'The subject is averages of several draws or the spread of an estimate. Nothing here is averaged; each sample is one value.',
      'The reader is meant to compare the counts against the true probabilities on screen. The true shape is not drawn.',
    ],

    contrastWith: [
      {
        concept: 'lawOfLargeNumbers',
        note: 'Both say more draws bring the sample closer to the rule. The law of large numbers tracks one proportion settling on one value; a histogram needs every bin\'s share to settle at once before its shape is right.',
      },
      {
        concept: 'cltBell',
        note: 'A histogram of single draws converges to whatever the source distribution is. The bell appears only when each plotted value is itself an average of several draws.',
      },
      {
        concept: 'estimateFromStats',
        note: 'A query optimizer uses a histogram as a stored summary to estimate row counts. Before any such use, a histogram only reflects its source once enough samples have gone into it.',
      },
    ],
  },
};
