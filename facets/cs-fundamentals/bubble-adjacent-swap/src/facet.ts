/**
 * @piece 인접 교환 — 옆끼리만 견주는데도 가장 큰 것이 끝까지 밀려간다.
 *
 * 답하는 질문 하나: 가장 큰 값을 찾는 걸음이 따로 없는데 어떻게 그것이 끝에
 * 가 있는가. 답: 견줌 한 번마다 선두가 한 칸씩 오른쪽으로 옮겨 가고, 왼쪽 끝에서
 * 오른쪽 끝까지 한 번 훑으면 선두는 반드시 오른쪽 끝에 있다.
 *
 * 조각이므로 title-block 도 metrics 도 layout 도 두지 않는다. 제목은 이 조각을
 * 안은 문단이 주고, 셀 것은 견줌 횟수 하나뿐이라 패널을 세우지 않으며, 블록이
 * stage 와 controls 둘뿐이라 배치는 러너에게 맡긴다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const bubbleAdjacentSwapFacet: FacetJson = {
  id: 'facet:bubbleAdjacentSwap',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'Adjacent Swap', ko: '인접 교환' },
  description: {
    en: 'One left-to-right sweep of adjacent comparisons carries the running largest one slot at a time until it sits at the far right.',
    ko: '옆끼리 견주며 왼쪽에서 오른쪽으로 한 번 훑으면 선두가 한 칸씩 밀려가 오른쪽 끝에 닿는다.',
  },
  algorithm: 'module:bubbleAdjacentSwap',
  projector: 'module:bubbleAdjacentSwapProjector',
  initialData: {
    type: 'bubble-adjacent-swap',
    // 한 값이 옆칸 맞바꿈을 **연달아** 하며 끝까지 가는 장면이 이 조각의 논증이다.
    // [4, 7, 2, 9, 1] 로는 그 장면이 안 나온다 — 7 도 9 도 한 칸씩만 가고 만다.
    // 여기서는 9 가 자리 1 에서 4 까지 세 번을 잇달아 밀려간다.
    values: [4, 9, 2, 7, 1],
    /** 걸음 사이에 읽을 시간 (S-piece — 간격도 저작 결정이다). */
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'bubble-adjacent-swap-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.compare': {
      en: 'Compare {a} and {b} — only these two, side by side.',
      ko: '{a} 와 {b} 를 견준다 — 나란한 이 둘만.',
    },
    'caption.swap': {
      en: '{big} is larger — it rises over its neighbour, one slot right.',
      ko: '{big} 이 더 크다 — 이웃을 넘어 한 칸 오른쪽으로.',
    },
    'caption.keep': {
      en: '{b} is already larger — nothing moves, and the lead is now {b}.',
      ko: '{b} 가 이미 더 크다 — 아무것도 옮기지 않고 선두만 {b} 에게 넘어간다.',
    },
    'caption.settled': {
      en: '{n} neighbour comparisons, and {max} is at the far right. No step ever went looking for it.',
      ko: '옆끼리 {n} 번 견줬을 뿐인데 {max} 가 오른쪽 끝에 와 있다. 그것을 찾아 나선 걸음은 없었다.',
    },
  },
};
