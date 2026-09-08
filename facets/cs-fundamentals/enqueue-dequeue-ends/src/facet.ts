/**
 * enqueue-dequeue-ends facet 선언 (조각).
 *
 * @piece 한쪽으로 넣고 반대쪽으로 뺀다 — 드나드는 문이 서로 반대편이면 차례가 어떻게 되는가.
 *
 * 조각이므로 header 도 metrics 도 layout 도 두지 않는다. 러너가 `column · gap 8 ·
 * blocks 키 순서` 로 배치하고, 가로는 `PIECE_CANVAS_W` 로 정한다 (S-piece).
 * 컨트롤 둘은 눌러야 완성되는 조작이 아니다 — 자동 재생만 보고 지나가도 화면은 할 말을 마친다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const enqueueDequeueEndsFacet: FacetJson = {
  id: 'facet:enqueueDequeueEnds',
  title: {
    en: 'In one end, out the other',
    ko: '한쪽으로 넣고 반대쪽으로 뺀다',
  },
  description: {
    en: 'The two doors sit at opposite ends, so the first one in is the first one out.',
    ko: '드나드는 문이 서로 반대편이라, 먼저 들어온 것이 먼저 나온다.',
  },
  algorithm: 'module:enqueueDequeueEnds',
  projector: 'module:enqueueDequeueEndsProjector',
  initialData: {
    type: 'enqueue-dequeue-ends',
    values: [3, 7, 1],
    stepMs: 620,
  },
  blocks: {
    stage: { type: 'enqueue-dequeue-ends-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.doors': {
      en: 'Two doors, one at each end.',
      ko: '드나드는 문이 둘, 서로 반대편에 있다.',
    },
    'caption.in': {
      en: 'In through the back door — {value}',
      ko: '뒤쪽 문으로 들어간다 — {value}',
    },
    'caption.out': {
      en: 'Out through the front door — {value}',
      ko: '앞쪽 문으로 나온다 — {value}',
    },
    'caption.sameOrder': {
      en: 'In {inOrder} — out {outOrder}. The order held.',
      ko: '들어간 차례 {inOrder} — 나온 차례 {outOrder}. 차례가 그대로다.',
    },
  },
};
