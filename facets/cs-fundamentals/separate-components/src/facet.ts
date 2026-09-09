/**
 * separateComponents facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "한 번의 탐색으로 그래프 전체를 볼 수 없는 이유는 무엇인가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음 / 제목 없음 / 한 주장 / 메트릭 없음 /
 * 캔버스 폭은 러너가 정함 / 코드 패널 없음 / layout 선언 없음.
 *
 * initialData 에는 **구조만** 있다. 덩어리가 몇 개인지, 각각 크기가 얼마인지,
 * 몇 번 출발해야 하는지는 전부 알고리즘이 이 구조를 훑어 셈해 화면에 올린다.
 * (셋 · 3 2 3 · 세 번이 나오지만 그 숫자는 선언 어디에도 적혀 있지 않다.)
 *
 * `holdMs` 는 한 번의 탐색이 끝난 자리에서 화면을 붙잡아 두는 시간이다. 곧바로
 * 다음 출발로 넘어가면 "남는다" 는 주장이 사라지므로, 얼마나 오래 멈춰 있을지도
 * 저작 결정으로 선언에 둔다 (걸음 간격과 같은 이유).
 *
 * title / description / messages 는 en·ko 만 채웠다 (S-piece PREFER).
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const separateComponentsFacet: FacetJson = {
  id: 'facet:separateComponents',
  title: { en: 'Separate Components', ko: '나뉜 덩어리' },
  description: {
    en: 'One search never leaves its own group — the rest stay unlit until you start over',
    ko: '한 번의 탐색은 자기 덩어리 밖으로 나가지 못한다 — 나머지는 새로 출발해야 켜진다',
  },
  algorithm: 'module:separateComponents',
  projector: 'module:separateComponentsProjector',
  initialData: {
    type: 'separate-components',
    // 정점 순서가 곧 "남은 것 중 어디서 다시 출발할지" 를 정한다. 첫 출발은 A.
    nodes: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
    // 무방향 간선. 잇지 않은 자리는 화면에서 빈 자리로 남는다.
    edges: [
      ['A', 'B'],
      ['B', 'C'],
      ['A', 'C'],
      ['D', 'E'],
      ['F', 'G'],
      ['G', 'H'],
    ],
    stepMs: 800,
    holdMs: 1500,
  },
  // 정점 순서가 출발 순서를 정하므로 섞으면 안 된다.
  shuffleOnReset: false,
  messages: {
    'caption.start': {
      en: 'The search starts at {node} and lights up whatever it reaches.',
      ko: '{node} 에서 탐색을 시작해 닿는 것을 켠다.',
    },
    'caption.remains': {
      en: 'The search is over — {lit} lit, and {remaining} stay dark.',
      ko: '탐색이 끝났다 — {lit} 개가 켜지고 {remaining} 개는 꺼진 채 남는다.',
    },
    'caption.restart': {
      en: 'It cannot cross over — only a fresh start reaches what is left.',
      ko: '건너가지 못한다 — 남은 것에서 새로 출발해야 비로소 켜진다.',
    },
    'caption.done': {
      en: '{starts} starts were needed — {starts} separate groups, sized {sizes}.',
      ko: '출발이 {starts} 번 필요했다 — 나뉜 덩어리가 {starts} 개, 크기는 {sizes}.',
    },
  },
  blocks: {
    stage: { type: 'separate-components-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
