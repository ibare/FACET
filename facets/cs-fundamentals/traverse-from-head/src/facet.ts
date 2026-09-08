/**
 * traverse-from-head — 순차 접근 조각(piece) 선언.
 *
 * @piece 한 주장만 말한다 — "처음부터 따라가야 닿는다".
 *
 * 제목 블록도 메트릭도 두지 않는다 (S-piece). 제목은 글의 문단이 주고, 조각은
 * 셀 것이 없다. 컨트롤은 다시 보기와 한 걸음 둘뿐이며 둘 다 눌러야 완성되는
 * 조작이 아니다 — 자동 재생만 보고 지나가도 화면은 할 말을 마친다.
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const traverseFromHeadFacet: FacetJson = {
  id: 'facet:traverseFromHead',
  title: {
    en: 'Reaching the fourth node',
    ko: '네 번째 노드에 닿기',
  },
  description: {
    en: 'To reach a node you follow the links from the head, one at a time.',
    ko: '노드에 닿으려면 head 에서부터 링크를 하나씩 따라가는 수밖에 없다.',
  },
  algorithm: 'module:traverseFromHead',
  projector: 'module:traverseFromHeadProjector',
  initialData: {
    type: 'traverse-from-head',
    /** 다섯 노드. 값은 화면에 그대로 쓰인다. */
    values: [3, 8, 1, 6, 4],
    /** 찾아갈 자리 — 값 6 이 든 네 번째 노드. 옮김 3회. */
    targetIndex: 3,
    /** 걸음 사이 읽을 시간. */
    stepMs: 900,
  },
  layout: {
    type: 'column',
    gap: 8,
    children: [{ ref: 'stage' }, { ref: 'controls' }],
  },
  blocks: {
    stage: { type: 'traverse-from-head-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.intro': {
      en: 'The list knows only where its head is.',
      ko: '목록이 아는 것은 head 가 어디인지뿐이다.',
    },
    'caption.want': {
      en: 'We need the node at index {i}.',
      ko: '필요한 것은 인덱스 {i} 의 노드다.',
    },
    'caption.noJump': {
      en: 'No address to compute, so the jump has nowhere to land.',
      ko: '셈할 주소가 없으니 건너뛸 자리도 없다.',
    },
    'caption.follow': {
      en: 'Follow one link. That is the only move there is.',
      ko: '링크를 하나 따라간다. 할 수 있는 것은 그것뿐이다.',
    },
    'caption.arrived': {
      en: 'Index {i} took {n} moves through {v} nodes.',
      ko: '인덱스 {i} 까지 {n} 번 옮겼고 노드 {v} 개를 거쳤다.',
    },
    'label.moves': {
      en: 'moves {n}',
      ko: '옮김 {n} 회',
    },
    'label.target': {
      en: 'want this one',
      ko: '찾을 것',
    },
    'label.noteArray': {
      en: 'An array would reach any element with one address calculation.',
      ko: '배열이라면 주소 한 번의 셈으로 닿는다.',
    },
    'label.noteScattered': {
      en: 'Here the addresses are scattered — nothing to compute, so you follow.',
      ko: '여기서는 주소가 흩어져 있어 셀 수 없고, 따라가는 수밖에 없다.',
    },
  },
};
