/**
 * LinkedList facet JSON 선언.
 *
 * 진행 모델 입력 반응형 — algorithm 등록 시 mechanismKind: 'reactive' 사용.
 * mount 즉시 자동 시연 (insert(2, "25")) 후 학습자 입력 대기.
 *
 * 컨트롤바 어휘 (기획 §6 § 7 컨트롤 영역):
 *   [ i ] [ v ] [ 삽입 ] [ 삭제 ] [ 검색 ] [ 초기화 ]
 *
 * 코드 패널은 1차 구현에서 생략 (기획 §6 보조 요소 미언급).
 *
 * 식별자 (C1): `index:<n>` 표준 prefix 만 사용.
 */

import type { FacetJson } from '@facet/core/runtime';

export const linkedListFacet: FacetJson = {
  id: 'facet:linkedList',
  title: { en: 'Linked List', ko: '연결 리스트' },
  description: {
    en: 'Each node has a single finger pointing only at its next — insert/remove rewires arrows, not cards',
    ko: '노드는 자기 다음 한 명만 가리킨다 — 끼우거나 빼는 일은 카드를 옮기는 게 아니라 손가락을 다시 잇는 일이다',
  },
  algorithm: 'module:linkedList',
  projector: 'module:linkedListProjector',
  initialData: {
    type: 'linked-list',
    initialValues: ['10', '20', '30'],
    autoDemoIntervalMs: 1000,
    searchStepMs: 280,
    maxSize: 7,
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: {
      type: 'linked-list-stage',
    },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'value-input',
          name: 'index',
          action: 'input',
          label: { en: 'i', ko: 'i' },
          placeholder: '예: 2',
          default: '',
        },
        {
          widget: 'value-input',
          name: 'value',
          action: 'input',
          label: { en: 'v', ko: 'v' },
          placeholder: '예: 25',
          default: '',
        },
        { widget: 'button', action: 'insert', label: { en: 'Insert', ko: '삽입' } },
        { widget: 'button', action: 'remove', label: { en: 'Remove', ko: '삭제' } },
        { widget: 'button', action: 'search', label: { en: 'Search', ko: '검색' } },
        { widget: 'button', action: 'reset', label: { en: 'Reset', ko: '초기화' } },
      ],
      metrics: [
        { name: 'insert-count', label: { en: 'Insert', ko: '삽입' }, initial: 0 },
        { name: 'remove-count', label: { en: 'Remove', ko: '삭제' }, initial: 0 },
        { name: 'search-count', label: { en: 'Search', ko: '검색' }, initial: 0 },
        { name: 'walk-count', label: { en: 'Walk', ko: '걸음' }, initial: 0 },
      ],
    },
  },
};
