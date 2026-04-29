/**
 * HashTable facet JSON 선언.
 *
 * 진행 모델 입력 반응형 — algorithm 등록 시 mechanismKind: 'reactive' 사용.
 * mount 즉시 자동 시연 (키 7개 흘려 넣음, 충돌 1회 의도) 후 학습자 입력 대기.
 *
 * 컨트롤바 어휘 (기획 §6 § 7 컨트롤 영역):
 *   [ key ] [ 삽입 ] [ 검색 ] [ 삭제 ] [ 초기화 ]
 *
 * 코드 패널은 1차 구현에서 생략 (기획 §6 보조 요소 미언급).
 *
 * 식별자 (C1): `index:<n>` 표준 prefix 만 사용.
 *
 * 자동 시연 키 시퀀스 (h(k) = k mod 11):
 *   14 → 3, 7 → 7, 25 → 3 (충돌), 11 → 0, 5 → 5, 19 → 8, 6 → 6
 *   결과: size=7, α=7/11≈0.636 (caution). 학습자가 두 키만 더 넣으면 임계 발화.
 */

import type { FacetJson } from '@facet/core/runtime';

export const hashTableFacet: FacetJson = {
  id: 'facet:hashTable',
  title: { en: 'Hash Table', ko: '해시 테이블' },
  description: {
    en: 'Keys land in slots picked by a deterministic function — same-slot collisions grow chains, not chaos',
    ko: '키는 함수가 정해 준 한 자리로 던져진다 — 같은 자리에 둘이 떨어지면 사슬이 한 칸 자란다',
  },
  algorithm: 'module:hashTable',
  projector: 'module:hashTableProjector',
  initialData: {
    type: 'hash-table',
    initialM: 11,
    rehashM: 23,
    rehashThreshold: 0.75,
    autoDemoIntervalMs: 900,
    chainStepMs: 280,
    rehashStepMs: 360,
    autoDemoKeys: ['14', '7', '25', '11', '5', '19', '6'],
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
      type: 'hash-table-stage',
    },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'value-input',
          name: 'key',
          action: 'input',
          label: { en: 'key', ko: 'key' },
          placeholder: '예: 42',
          default: '',
        },
        { widget: 'button', action: 'insert', label: { en: 'Insert', ko: '삽입' } },
        { widget: 'button', action: 'search', label: { en: 'Search', ko: '검색' } },
        { widget: 'button', action: 'remove', label: { en: 'Remove', ko: '삭제' } },
        { widget: 'button', action: 'reset', label: { en: 'Reset', ko: '초기화' } },
      ],
      metrics: [
        { name: 'insert-count', label: { en: 'Insert', ko: '삽입' }, initial: 0 },
        { name: 'collision-count', label: { en: 'Collision', ko: '충돌' }, initial: 0 },
        { name: 'search-count', label: { en: 'Search', ko: '검색' }, initial: 0 },
        { name: 'remove-count', label: { en: 'Remove', ko: '삭제' }, initial: 0 },
        { name: 'walk-count', label: { en: 'Walk', ko: '걸음' }, initial: 0 },
        { name: 'rehash-count', label: { en: 'Rehash', ko: '이사' }, initial: 0 },
      ],
    },
  },
};
