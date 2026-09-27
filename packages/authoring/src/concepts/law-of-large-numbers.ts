/**
 * lawOfLargeNumbers 개념 선언.
 *
 * canonical facet 은 `facet:lawOfLargeNumbers` — 공정한 동전을 1000 번까지 던지며 앞면 비율이라는 수 하나를 구슬로
 * 축에 놓는다. 던진 수 0 · 1 · 2 · 3 · 5 · 10 · 30 · 100 · 300 · 1000 마다 한 줄씩 내려가며 그 구간의 흔들림의 폭
 * (|비율 − 1/2| 의 가장 큰 값)을 띠로 편다. 폭이 0.500 에서 0.033 으로 좁아져 깔때기가 된다. 스스로 재생하고 멈춘다.
 *
 * ── 묶음 안에서의 자리
 *
 * 완제품 `clt` 는 평균 400 개의 분포와 그 폭 σ/√n 을 다룬다. 이쪽은 **한 줄의 뽑기에서 수 하나가 참값 둘레로
 * 붙는 것** 하나를 쥐고, "매번 더 가까워지지는 않는다 — 좁아지는 것은 폭이다" 를 독점한다. 그래서 definition 은
 * running proportion · coin tosses · swings · band 쪽 낱말을 쥐고, distribution · bell · σ/√n 을 쓰지 않는다.
 *
 * 전제 (설명 글 `lawOfLargeNumbers.md` 가 밝힌 것):
 *  - 앞면 확률 1/2 인 공정한 동전, mulberry32 씨앗 60 의 한 번의 뽑기다. 수열 · 씨앗 · 동전은 예로 정한 값이다.
 *  - 한 번의 뽑기에서는 폭이 걸음마다 늘 줄지도 않는다. 이 길 하나는 경향을 보일 뿐이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const lawOfLargeNumbersConcept: FacetConceptSource = {
  id: 'lawOfLargeNumbers',
  label: 'Law of Large Numbers (Running Share of Heads)',
  canonicalFacet: 'facet:lawOfLargeNumbers',

  surface: {
    definition:
      'The running share of heads in repeated coin tosses swings widely at first and is then held in an ever narrower band around 1/2, though it does not get closer with every toss.',
    exemplarKeywords: [
      'law of large numbers',
      'running proportion',
      'relative frequency approaches probability',
      'coin toss simulation',
      'long-run frequency',
      'gambler\'s fallacy',
      'sample average converges to the expected value',
      'Monte Carlo estimate gets better with more trials',
      'more trials less fluctuation',
    ],
  },

  briefing: {
    observable: [
      'A bead on a horizontal axis titled "Heads ratio" is the share of heads so far; the true value 1/2 is marked. The start caption reads "No tosses yet. Heads probability: 1/2."',
      'The first tosses go one at a time ("Toss 1: heads."); later steps cover spans — "Tosses 31–100: farthest from 1/2 was 0.125." Rows for the spans are labelled from the start under "Tosses" — 1, 2, 3, 4–5, 6–10, 11–30, 31–100, 101–300, 301–1000 — and each step fills the next one while the bead\'s path runs down through it; every row has the same height, whether it holds one toss or seven hundred.',
      'Each row carries a band, "Widest swing": the farthest the ratio strayed from 1/2 within that span, laid out on both sides of 1/2.',
      'The first three tosses are all heads, so the ratio sits at 1.000 with a swing of 0.500. By toss 10 it has fallen to 0.300. After that the swing shrinks to 0.167, 0.125, 0.041 and 0.033, and the bands form a funnel around 1/2.',
      'A readout like "Tosses 300 · heads 146 · ratio − 1/2 = −0.013" follows each step. At toss 300 the ratio is 0.487, 0.013 from 1/2; at toss 1000 it is 0.474, 0.026 away — farther than before. The swing narrowed while the current gap grew.',
      'This is one run with seed 60; another seed gives a different path, and even the swing need not shrink at every step. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays ten steps by itself, from no tosses to 1000, and stops.',
        'A Replay button and a playback strip sit below it. After the run, comparing the steps at 300 and 1000 tosses shows the gap from 1/2 widening even as the band keeps narrowing.',
        'The seed and checkpoints are fixed, so an article can quote every ratio and swing.',
      ],
    },

    useWhen: [
      'The article explains why a frequency measured over many trials can be trusted as a probability while a few trials cannot.',
      'A reader believes a long run of tails makes heads "due", and the article needs a case where the ratio moves away from 1/2 late in the run while the room for it to stray still shrinks.',
    ],

    avoidWhen: [
      'The article is about the shape of the distribution of averages or the σ/√n rate. One sequence is shown; no distribution is built and no rate is printed.',
      'The subject is biased coins or estimating an unknown probability from data. The coin is fixed at 1/2 and marked as such.',
      'The point is random walks of the raw head-minus-tail count, which drift farther from zero over time. Only the ratio is drawn.',
    ],

    contrastWith: [
      {
        concept: 'clt',
        note: 'The law of large numbers says the average gets close to the true value. The central limit theorem adds how the remaining error is distributed and that it shrinks like 1/√n.',
      },
      {
        concept: 'histogramShape',
        note: 'One proportion settling is the simplest case of convergence. A histogram needs the proportion in every bin to settle at once before the whole shape is right.',
      },
      {
        concept: 'sgd',
        note: 'Averaging gradients over a mini-batch relies on a sample mean approaching the full mean. The law itself says nothing about optimization; it only says the average settles as samples accumulate.',
      },
    ],
  },
};
