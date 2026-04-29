/**
 * LruCache facet JSON 선언.
 *
 * 진행 모델 입력 반응형 — algorithm 등록 시 mechanismKind: 'reactive' 사용.
 * mount 즉시 자동 시연 (put k1·k2·k3 → get k1) 후 학습자 입력 대기.
 *
 * 컨트롤바 어휘 (기획 §6 §7 컨트롤 영역):
 *   [ key ] [ value ] [ get ] [ put ] [ 초기화 ]
 *
 * 코드 패널은 1차 구현에서 생략 (기획 §6 보조 요소 미언급).
 *
 * 식별자 (C1): `node:<key>` 명시 prefix 만 사용 (기획 §1 노드 기반 자료구조).
 *
 * 자동 시연 시퀀스 (capacity = 4):
 *   put(k1,v1) → put(k2,v2) → put(k3,v3) → get(k1)
 *   결과 list (LRU→MRU): [k2, k3, k1], size=3, capacity 게이지 3/4 (여유 1).
 *   다음 학습자 시도: put(k4,v4) (꽉 참 진입) → put(k5,v5) (eviction) → get(k3) (promotion).
 */

import type { FacetJson } from '@facet/core/runtime';

export const lruCacheFacet: FacetJson = {
  id: 'facet:lruCache',
  title: { en: 'LRU Cache', ko: 'LRU 캐시' },
  description: {
    en: 'A capacity-bound key-value store that pulls every touched node to the MRU end and drops the LRU end on overflow',
    ko: '용량이 정해진 키-값 저장소 — 모든 호출이 노드를 MRU 끝으로 끌어올리고 꽉 차면 LRU 끝이 두 영역에서 함께 사라진다',
  },
  algorithm: 'module:lruCache',
  projector: 'module:lruCacheProjector',
  initialData: {
    type: 'lru-cache',
    capacity: 4,
    autoDemoIntervalMs: 900,
    autoDemoSequence: [
      { op: 'put', key: 'k1', value: 'v1' },
      { op: 'put', key: 'k2', value: 'v2' },
      { op: 'put', key: 'k3', value: 'v3' },
      { op: 'get', key: 'k1' },
    ],
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
      type: 'lru-cache-stage',
    },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'value-input',
          name: 'key',
          action: 'input',
          label: { en: 'key', ko: 'key' },
          placeholder: '예: k4',
          default: '',
        },
        {
          widget: 'value-input',
          name: 'value',
          action: 'input',
          label: { en: 'value', ko: 'value' },
          placeholder: '예: v4',
          default: '',
        },
        { widget: 'button', action: 'get', label: { en: 'Get', ko: 'get' } },
        { widget: 'button', action: 'put', label: { en: 'Put', ko: 'put' } },
        { widget: 'button', action: 'reset', label: { en: 'Reset', ko: '초기화' } },
      ],
      metrics: [
        { name: 'get-count', label: { en: 'Get', ko: 'get' }, initial: 0 },
        { name: 'put-count', label: { en: 'Put', ko: 'put' }, initial: 0 },
        { name: 'hit-count', label: { en: 'Hit', ko: '적중' }, initial: 0 },
        { name: 'miss-count', label: { en: 'Miss', ko: '빗남' }, initial: 0 },
        { name: 'eviction-count', label: { en: 'Evict', ko: '축출' }, initial: 0 },
      ],
    },
  },
};
