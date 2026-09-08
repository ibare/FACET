/**
 * @piece 견줌과 맞바꿈이 다른 동작임을 말하는 조각.
 *
 * 답하는 질문 하나: **정렬이 값을 옮기는 일이라면, 옮김은 언제 일어나는가.**
 * 짝 셋을 차례로 견주는데 실제로 자리를 바꾸는 것은 하나뿐이다. 견줌은 판정이고,
 * 맞바꿈은 그 판정이 참일 때만 뒤따르는 결과다.
 *
 * header 도 metrics 도 layout 도 두지 않는다 — 제목은 글의 문단이 주고, 셀 것은
 * 없으며, 배치는 stage 와 controls 뿐이라 러너가 만든다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const compareAndSwapFacet: FacetJson = {
  id: 'facet:compareAndSwap',
  title: { en: 'Compare and swap', ko: '비교와 교환' },
  description: {
    en: 'Comparing is a judgment. Swapping is what follows only when that judgment is true.',
    ko: '견줌은 판정이고, 맞바꿈은 그 판정이 참일 때만 뒤따르는 결과다.',
  },
  algorithm: 'module:compareAndSwap',
  projector: 'module:compareAndSwapProjector',
  initialData: {
    type: 'compare-and-swap',
    // 첫 짝만 어긋나 있고, 둘째는 이미 순서가 맞고, 셋째는 두 값이 같다.
    pairs: [
      [5, 3],
      [2, 7],
      [6, 6],
    ],
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'compare-and-swap-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.compare': {
      en: 'Comparing {left} and {right} — the test itself moves nothing.',
      ko: '두 값을 견준다 — {left}, {right}. 견줌 자체는 아무것도 옮기지 않는다.',
    },
    'caption.swap': {
      en: "Out of order, so the two values cross into each other's seats.",
      ko: '어긋나 있으므로 두 값이 서로의 자리로 건너간다.',
    },
    'caption.holdOrdered': {
      en: 'Already in order — the comparison ends there and nothing moves.',
      ko: '이미 순서가 맞다 — 견줌은 여기서 끝나고 아무것도 움직이지 않는다.',
    },
    'caption.holdEqual': {
      en: 'The two are equal — there is nothing to put in order.',
      ko: '두 값이 같다 — 자리를 맞출 것이 없다.',
    },
    'caption.summary': {
      en: '{compares} comparisons, and only {swaps} of them moved anything.',
      ko: '견줌 {compares} 번, 그중 무언가를 옮긴 것은 {swaps} 번뿐이다.',
    },
  },
};
