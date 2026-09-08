/**
 * HeapSortExtract facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "정렬된 결과를 담을 자리를 따로 빌려야 하는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 · 한 걸음) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / layout 선언 없음 / 캔버스 폭은 러너가 정한다.
 *
 * 데이터는 이미 최대 힙인 [9, 7, 8, 3, 4] 하나뿐이다. 꺼내는 순서도, 새 꼭대기도,
 * 끝난 줄도 알고리즘이 이 배열에서 셈한다 — 화면에 박아 둔 값이 없다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const heapSortExtractFacet: FacetJson = {
  id: 'facet:heapSortExtract',
  title: { en: 'Heap Extract', ko: '힙 추출' },
  description: {
    en: 'Taking the top out frees the last slot of the heap, and that is where the result goes',
    ko: '꼭대기를 꺼내면 힙의 마지막 칸이 비고, 결과는 바로 그 칸에 앉는다',
  },
  algorithm: 'module:heapSortExtract',
  projector: 'module:heapSortExtractProjector',
  initialData: {
    type: 'heap-sort-extract',
    // 이미 최대 힙이다: 9 위에 7·8, 7 아래에 3·4.
    values: [9, 7, 8, 3, 4],
    // 걸음 하나는 여기에 stage 의 이동 애니메이션이 더해진다 (S-piece).
    stepMs: 750,
  },
  shuffleOnReset: false,
  messages: {
    'caption.heap': {
      en: 'A max heap laid out in one row — the biggest value sits on top.',
      ko: '한 줄에 늘어놓은 최대 힙 — 가장 큰 값이 꼭대기에 있다.',
    },
    'caption.take': {
      en: 'Take out the top — {value}.',
      ko: '꼭대기를 꺼낸다 — {value}.',
    },
    'caption.place': {
      en: 'The heap hands back its last slot, and that is exactly where {value} sits down.',
      ko: '힙이 마지막 칸을 내놓고, 꺼낸 {value} 가 바로 그 칸에 앉는다.',
    },
    'caption.done': {
      en: 'Sorted inside the same row — not one extra slot was borrowed.',
      ko: '같은 줄 안에서 정렬이 끝났다 — 자리를 하나도 빌리지 않았다.',
    },
    'label.heap': { en: 'heap', ko: '힙' },
    'label.done': { en: 'sorted', ko: '정렬 끝' },
  },
  blocks: {
    stage: { type: 'heap-sort-extract-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
