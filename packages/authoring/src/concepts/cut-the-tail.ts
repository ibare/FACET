/**
 * cutTheTail 개념 선언.
 *
 * canonical facet 은 `facet:cutTheTail` — 조각이다. 문맥 "She opened the" 뒤의 후보 일곱이
 * 원 하나를 부채꼴로 나눠 쥔다. k = 3 이면 아래 넷이 부채꼴째 떨어져 나가 빈 몫 0.17 을
 * 남기고, 남은 셋의 부채꼴이 제 크기에 비례해 벌어져 그 자리를 메운다. 끝으로 바늘이 원의
 * 시작에서 u = 0.95 까지 돌아 셋 가운데 가장 작은 `box` 에 멈춘다. 스스로 한 번 재생한다.
 *
 * ── 묶음 안에서 어떻게 갈랐나
 *
 * 이 조각이 홀로 맡는 것은 **한 번 자른 뒤의 일** — 버린 몫이 어디로 가고, 뽑기가 어디에
 * 떨어질 수 있는가 — 이다. definition 의 주어는 "k 개만 남기는 일" 이고 꼬리는 "뽑기가
 * 가장 약한 생존자에 떨어질 수 있다" 다. 완제품 `topKTopP` 의 낱말(count · mass · peaked ·
 * flat · chained)과 형제 `fillToAShare` 의 낱말(summed · reaches · dominates · compete)은
 * definition 에 0 건이다 (기계 확인). 대신 draw · survivors · proportion · weakest 를 독점한다.
 *
 * ── 밝힌 전제
 *
 * 로짓은 예로 정한 값이고, 뽑기 값 u 도 난수가 아니라 정해 둔 수다. 화면은 이 각주를 달지
 * 않으므로 observable 과 avoidWhen 에서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const cutTheTailConcept: FacetConceptSource = {
  id: 'cutTheTail',
  label: 'Cut the Tail (Top-k, Then Draw)',
  canonicalFacet: 'facet:cutTheTail',

  surface: {
    definition:
      'Keeping only the k most probable tokens hands the share of the discarded ones to the survivors in proportion to their size, and the random draw that follows may still land on the weakest survivor.',
    exemplarKeywords: [
      'top-k sampling',
      'top_k parameter',
      'renormalize after truncation',
      'redistribute the probability of dropped tokens',
      'sampling from the k best tokens',
      'why top-k does not always pick the best token',
      'random draw from a truncated distribution',
      'cumulative distribution sampling with a random number',
      'block unlikely tokens from being sampled',
    ],
  },

  briefing: {
    observable: [
      'One circle is the whole probability, divided into seven slices for the words that might follow "She opened the". The logits behind them (door 2.6 down to cloud −0.9) are example values, not the output of a real language model, and the screen does not say so.',
      'With k = 3, "letter", "oven", "banana" and "cloud" fall out of the circle slice by slice, and the gap they leave is labelled as a dropped share of 0.17.',
      'The three remaining slices then widen to close the gap, each by an amount matching its own size — "door" gains the most and "box" the least — so their ratios stay as they were and together they reach 0.51, 0.28 and 0.21.',
      'A needle sweeps from the start of the circle to the draw value u = 0.95. The running total passes 0.51 at "door" and 0.79 at "window" and first exceeds 0.95 at "box", so the smallest of the three is the one chosen.',
      'The draw value is a number fixed in the data, not a fresh random number, which is why every replay lands on the same word.',
    ],

    screen: {
      affordances: [
        'The screen plays through once by itself — full circle, the fall, the widening, the needle — and stops on the chosen word.',
        'A Replay button and a playback strip sit beneath it; after the run, dragging the strip back holds any one of the four steps still.',
        'The seven words, their logits, k and u are all fixed, so an article can quote the dropped share, any widened share or the chosen word directly.',
      ],
    },

    useWhen: [
      'A reader assumes top-k means "pick the best of the top k" and needs to see that it only decides which words remain eligible; with u = 0.95 the pick is the least likely of the three.',
      'The article says the discarded probability is "given back" to the remaining tokens and the reader has to see how it is shared — not in equal thirds but in proportion, so "door" gains about twice what "box" does.',
      'The prose needs the reason for cutting at all: a bad continuation such as "banana" still holds a small slice of the full circle, and after the cut no draw value can reach it.',
    ],

    avoidWhen: [
      'The article treats the logits or the draw value as coming from a real model or a real random generator. Both are example values fixed in the data, and the draw lands in the same place on every replay.',
      'The subject is choosing a good k, or how k behaves across prompts of different shape. There is one prompt and one k here.',
      'The article is about top-p, nucleus sampling or any cutoff defined by accumulated probability. The cutoff here is a rank, set before any probability is summed.',
      'The subject is temperature or any rescaling of all the logits. Nothing here changes how the seven compare to each other before the cut.',
    ],

    contrastWith: [
      {
        concept: 'fillToAShare',
        note: 'Both leave a shortlist, but here its size is fixed in advance and the discarded probability is whatever it turns out to be; there the retained probability is fixed and the size is whatever it turns out to be.',
      },
      {
        concept: 'topKTopP',
        note: 'Comparing a cutoff by rank with one by accumulated probability, and stacking them, is a question about how to set the cutoff; this is about what a single cutoff does to the probabilities it leaves and to the pick made from them.',
      },
      {
        concept: 'alwaysTheHighest',
        note: 'Taking the top token every time is deterministic; truncating and then drawing keeps chance alive inside the shortlist, so a token other than the first can be chosen.',
      },
      {
        concept: 'flattenOrSharpen',
        note: 'Temperature changes the ratios between all candidates; renormalizing after a cut keeps the ratios among those left exactly as they were and only scales them up.',
      },
    ],
  },
};
