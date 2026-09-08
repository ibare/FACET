/**
 * BstCompareAndGo facet JSON 선언 — 한 주장을 말하는 조각(piece) facet.
 *
 * 이 facet 이 답하는 질문:
 *   "이진 탐색 트리는 한 번 비교할 때마다 어떻게 아래로 내려가는가?"
 *
 * @piece — 이 표식이 S-piece 의 적용 범위를 정한다.
 *
 * 조각의 규범: 필수 조작 없음(다시 보기 하나) / 제목 없음 / 한 주장 /
 * 메트릭 없음 / 캔버스 폭 620 / 전제를 각주 대신 이 설명에 남긴다.
 *
 * 데이터는 호스트가 확정한 실측 트리다. 50, 30, 70, 20, 40, 60, 80 을 이
 * 순서로 넣어 만든 이진 탐색 트리 — 노드 일곱, 높이 3층. 찾는 값은 40.
 * 비교 세 번(50 → 30 → 40), 폴드 두 번(70의 서브트리, 20)으로 찾는다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const bstCompareAndGoFacet: FacetJson = {
  id: 'facet:bstCompareAndGo',
  title: { en: 'BST: Compare and Go', ko: '이진 탐색 트리: 비교하고 내려가기' },
  description: {
    en: 'Every comparison drops a whole branch from the candidates and moves one level down',
    ko: '비교 한 번마다 가지 하나가 통째로 후보에서 빠지고 한 층 아래로 내려간다',
  },
  algorithm: 'module:bstCompareAndGo',
  projector: 'module:bstCompareAndGoProjector',
  initialData: {
    type: 'bst-compare-and-go',
    // 50, 30, 70, 20, 40, 60, 80 순서로 삽입한 실측 트리. 노드 일곱, 높이 3층.
    nodes: {
      n50: { value: 50, left: 'n30', right: 'n70' },
      n30: { value: 30, left: 'n20', right: 'n40' },
      n70: { value: 70, left: 'n60', right: 'n80' },
      n20: { value: 20, left: null, right: null },
      n40: { value: 40, left: null, right: null },
      n60: { value: 60, left: null, right: null },
      n80: { value: 80, left: null, right: null },
    },
    rootId: 'n50',
    needle: 40,
    stepMs: 700,
  },
  shuffleOnReset: false,
  messages: {
    'caption.target': {
      en: 'Looking for {needle}.',
      ko: '{needle}을 찾는다.',
    },
    'caption.compareLt': {
      en: '{needle} < {nodeValue} — smaller, go left.',
      ko: '{needle} < {nodeValue} — 작다, 왼쪽으로.',
    },
    'caption.compareGt': {
      en: '{needle} > {nodeValue} — bigger, go right.',
      ko: '{needle} > {nodeValue} — 크다, 오른쪽으로.',
    },
    'caption.compareEq': {
      en: '{needle} = {nodeValue} — found.',
      ko: '{needle} = {nodeValue} — 찾았다.',
    },
    'caption.narrowed': {
      en: 'Narrowed to {n} candidates.',
      ko: '후보가 {n}개로 좁혀졌다.',
    },
  },
  blocks: {
    stage: { type: 'bst-compare-and-go-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
};
