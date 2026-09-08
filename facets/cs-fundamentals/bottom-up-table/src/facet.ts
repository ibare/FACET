/**
 * bottomUpTable facet JSON 선언.
 *
 * @piece 조각 — "아래에서부터 표를 채우면 재귀가 어디로 가는가" 하나에만
 * 답한다. 캔버스와 컨트롤바뿐이라 `layout` 은 러너에 맡기고, 제목(title-block)과
 * metrics 는 두지 않는다 (S-piece).
 *
 * 진행 모델은 reactive — mount 하면 스스로 표를 채우기 시작하고, 걸음 간격은
 * `initialData.stepMs` 가 정한다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL } from '@ffacet/core/runtime';

export const bottomUpTableFacet: FacetJson = {
  id: 'facet:bottomUpTable',
  title: {
    en: 'Bottom-Up Table',
    ko: '상향식 표 채우기',
  },
  description: {
    en: 'Fill the table from the small end and the recursion is simply gone',
    ko: '작은 것부터 표를 채워 올라가면 재귀가 아예 없다',
  },
  algorithm: 'module:bottomUpTable',
  projector: 'module:bottomUpTableProjector',
  initialData: {
    type: 'bottom-up-table',
    n: 5,
    stepMs: 700,
  },
  messages: {
    'caption.seed': {
      en: 'T[{i}] = {v} — the definition hands over the bottom two cells',
      ko: 'T[{i}] = {v} — 정의가 그냥 주는 바닥 두 칸',
    },
    'caption.fill': {
      en: 'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — both values already sit to the left',
      ko: 'T[{i}] = T[{a}] + T[{b}] = {x} + {y} = {v} — 두 값 모두 이미 왼쪽에 있다',
    },
    'caption.done': {
      en: '{cells} cells filled left to right in {fills} additions — {calls} recursive calls',
      ko: '칸 {cells} 개를 왼쪽부터 덧셈 {fills} 번으로 채웠다 — 재귀 호출은 {calls} 번',
    },
    'caption.doneNote': {
      en: 'Every cell looked only at the two before it, so keeping those two is enough',
      ko: '어느 칸도 바로 앞 둘만 보았다 — 그 둘만 들고 있으면 표 전체는 필요 없다',
    },
  },
  blocks: {
    stage: { type: 'bottom-up-table-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
};
