/**
 * HeapProperty facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "힙은 무엇을 약속하고 무엇을 약속하지 않는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제는 화면이 아니라 글이 밝힌다.
 *
 * 데이터는 호스트가 준 최소 힙 그대로다 (배열 인덱스 = 힙 인덱스).
 *   nodes = [3, 5, 8, 9, 6, 12, 10]
 * 부모-자식 짝 여섯은 모두 부모가 작다 (3<5, 3<8, 5<9, 5<6, 8<12, 8<10) —
 * algorithm 이 이 값을 그 자리에서 비교해 확인한다 (미리 적어 둔 판정이 아니다).
 *
 * 형제 짝은 같은 부모를 둔 자식 둘씩을 배열 구조에서 그대로 뽑는다
 * (5·8, 9·6, 12·10 — 부모가 셋이므로 셋이다). 힙은 이 짝에 아무 약속도
 * 하지 않는다: 9>6, 12>10 이 그 증거이고, 정렬이었다면 있을 수 없는 배치다.
 * 정해진 것은 가장 작은 값 3 이 꼭대기에 있다는 것 하나뿐이다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const heapPropertyFacet: FacetJson = {
  id: 'facet:heapProperty',
  title: { en: 'Heap Property', ko: '힙 성질' },
  description: {
    en: 'A parent always precedes its children — but siblings answer to no order at all',
    ko: '부모는 항상 자식보다 앞선다 — 하지만 형제끼리는 아무 순서도 약속하지 않는다',
  },
  algorithm: 'module:heapProperty',
  projector: 'module:heapPropertyProjector',
  initialData: {
    type: 'heap-property',
    nodes: [
      { id: 'n0', value: 3 },
      { id: 'n1', value: 5 },
      { id: 'n2', value: 8 },
      { id: 'n3', value: 9 },
      { id: 'n4', value: 6 },
      { id: 'n5', value: 12 },
      { id: 'n6', value: 10 },
    ],
    stepMs: 660,
  },
  shuffleOnReset: false,
  messages: {
    'caption.pairCheck': {
      en: 'Parent {p} must come before child {c}.',
      ko: '부모 {p} 가 자식 {c} 보다 앞서야 한다.',
    },
    'caption.siblingSkip': {
      en: '{a} and {b} are siblings — never compared.',
      ko: '{a} 와 {b} 는 형제 — 한 번도 견주지 않는다.',
    },
    'caption.confirmed': {
      en: 'The smallest value, {v}, sits at the top.',
      ko: '가장 작은 값 {v} 이 꼭대기에 있다.',
    },
  },
  blocks: {
    stage: { type: 'heap-property-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
