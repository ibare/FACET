/**
 * depth-doubles-count 선언.
 *
 * @piece 조각 — "깊이가 하나 늘면 자리는 두 배" 라는 주장 하나에만 답한다.
 * 제목은 글의 문단이 주므로 title-block 을 두지 않고, 셀 것이 없으므로
 * metrics 도 두지 않는다 (S-piece).
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const depthDoublesCountFacet: FacetJson = {
  id: 'facet:depthDoublesCount',
  title: {
    en: 'Depth doubles the count',
    ko: '깊이가 늘면 자리는 두 배',
  },
  description: {
    en: 'One level deeper doubles how many slots a tree can hold.',
    ko: '한 층 내려갈 때마다 트리가 담을 수 있는 자리가 두 배가 된다.',
  },
  algorithm: 'module:depthDoublesCount',
  projector: 'module:depthDoublesCount',
  initialData: {
    type: 'depth-doubles-count',
    /** 0층부터 9층까지. 합이 2^10 - 1 = 1023 이 되는 깊이다. */
    maxDepth: 9,
    /** 걸음 간격. 한 층이 벌어지는 것을 읽을 시간을 준다. */
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'depth-doubles-count-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.root': {
      en: 'Depth 0 holds one slot.',
      ko: '0층에는 자리가 하나다.',
    },
    'caption.split': {
      en: 'One level down: every slot splits in two — {count} slots.',
      ko: '한 층 내려가면 자리마다 둘로 갈라진다 — 자리 {count}개.',
    },
    'caption.total': {
      en: 'Only {depth} levels down, and already {total} slots.',
      ko: '{depth}층까지 내려갔을 뿐인데 자리는 모두 {total}개다.',
    },
  },
};
