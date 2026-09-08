/**
 * SplitWhenFull facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "노드가 꽉 찬 채로 하나가 더 들어오면 무슨 일이 일어나는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나 + 되짚기 하나) / 제목 없음 /
 * 메트릭 없음 / 캔버스 폭 620.
 *
 * 데이터: 자식 하나가 이미 셋(용량)을 채운 상태에서 25 를 넣는다. 넘친 자리의
 * 가운데(넷 중 둘째, 20)가 부모로 올라가 부모 키가 1→2 로, 자식이 2→3 으로
 * 는다. 층수는 그대로다 — algorithm.ts 가 이 전부를 계산하지 결과를 미리
 * 적어 두지 않는다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const splitWhenFullFacet: FacetJson = {
  id: 'facet:splitWhenFull',
  title: { en: 'Split When Full', ko: '꽉 차면 쪼갠다' },
  description: {
    en: 'A full node overflows, its middle key rises to the parent, and the rest splits in two',
    ko: '꽉 찬 노드가 넘치면 가운데 키가 부모로 올라가고 나머지는 둘로 갈라진다',
  },
  algorithm: 'module:splitWhenFull',
  projector: 'module:splitWhenFullProjector',
  initialData: {
    type: 'split-when-full',
    capacity: 3,
    parent: { keys: [40] },
    children: [{ keys: [10, 20, 30] }, { keys: [50, 60] }],
    insertKey: 25,
    stepMs: 780,
  },
  shuffleOnReset: false,
  messages: {
    'caption.descend': {
      en: '{key} is less than {compared}, so it heads into this child.',
      ko: '{key} 는 {compared} 보다 작아 이 자식으로 내려간다.',
    },
    'caption.overflow': {
      en: 'This slot already holds {capacity} keys — adding one overflows it to {count}.',
      ko: '이 자리는 이미 {capacity}개가 차 있다 — 하나가 더 들어와 {count}개로 넘친다.',
    },
    'caption.promote': {
      en: 'The middle key {key} rises into the parent.',
      ko: '가운데 키 {key} 가 부모로 올라간다.',
    },
    'caption.divide': {
      en: 'What remains splits in two — {left} and {right}.',
      ko: '남은 것이 둘로 갈라진다 — {left} 와 {right}.',
    },
  },
  blocks: {
    stage: { type: 'split-when-full-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
