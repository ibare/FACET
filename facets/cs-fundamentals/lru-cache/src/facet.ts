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

import type { FacetJson } from '@ffacet/core/runtime';

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
  messages: {
    'caption.base': { en: 'An LRU cache shares one set of nodes between a hash map (key → node) and a doubly linked list (recency order) — every call drags a node to the MRU end, and on overflow the LRU end vanishes from both areas at once.', ko: 'LRU 캐시는 hash map (키 → 노드) 과 doubly linked list (사용 순서) 를 같은 노드로 공유한다 — 모든 호출이 노드를 MRU 끝으로 끌어올리고, 용량 초과면 LRU 끝이 두 영역에서 동시에 사라진다.' },
    'caption.evict': { en: 'Over capacity — {key} at the LRU end disappears from both areas together.', ko: '용량 초과 — LRU 끝의 {key} 가 두 영역에서 함께 사라진다.' },
    'caption.getHit': { en: '{key} was dragged to the MRU end — even a get rotates the list.', ko: '{key} 가 MRU 끝으로 끌려 올라갔다 — get 도 list 를 회전시킨다.' },
    'caption.getMiss': { en: '{key} is not in the cache — the list stays as it was.', ko: '{key} 는 캐시에 없다 — list 는 변하지 않는다.' },
    'caption.handover': { en: 'Your turn — type a key and value, then press get or put.', ko: '이제 직접 — 키와 값을 입력하고 get / put 를 눌러 보세요.' },
    'caption.invalidKey': { en: '{op}: only short alphanumeric keys (values) are accepted — got "{raw}"', ko: '{op}: 짧은 영숫자 키 (값) 만 받는다 — 입력: "{raw}"' },
    'caption.missMark': { en: '{key} ?  absent', ko: '{key} ?  미존재' },
    'caption.putInsert': { en: 'New key {key} entered at the MRU end (room to spare).', ko: '새 키 {key} 가 MRU 끝에 들어왔다 (여유 있음).' },
    'caption.putUpdate': { en: 'The value for {key} was updated and dragged to the MRU end.', ko: '{key} 의 값이 갱신되며 MRU 끝으로 끌려 올라갔다.' },
    'label.dllArea': { en: 'doubly linked list  (recency order)', ko: 'doubly linked list  (사용 순서)' },
    'label.hashArea': { en: 'hash map  (key → node pointer)', ko: 'hash map  (key → 노드 포인터)' },
    'label.lruEnd': { en: '◀ LRU (least recently seen)', ko: '◀ LRU (가장 오래 안 본 것)' },
    'label.mruEnd': { en: '(just seen) MRU ▶', ko: '(방금 본 것) MRU ▶' },
    'label.references': { en: 'See also: NeetCode 146 · dev.to LRU illustrated · GeeksforGeeks LRU', ko: '참고: NeetCode 146 · dev.to LRU illustrated · GeeksforGeeks LRU' },
    'label.traceTitle': { en: 'Call trace', ko: '호출 트레이스' },
    'narrative.line1': { en: 'An LRU cache carves a "recency order" onto a plain key-value store.', ko: 'LRU 캐시는 키-값 저장소 위에 "최근 사용 순서" 라는 추상을 새긴다.' },
    'narrative.line2': { en: 'The hash slots on top give fast key → node pointer lookup,', ko: '위쪽 hash 슬롯은 키 → 노드 포인터의 빠른 조회를,' },
    'narrative.line3': { en: 'while the doubly linked list below carries the order of use.', ko: '아래쪽 doubly linked list 는 사용 순서를 담당한다.' },
    'narrative.line4': { en: 'Both areas share the same nodes, so every call updates the two at once.', ko: '두 영역은 같은 노드를 공유하므로 모든 호출이 두 곳을 동시에 갱신한다.' },
    'narrative.line5': { en: 'Even a get is a write in effect — it drags its node to the MRU end.', ko: 'get 도 단순 조회가 아니라 노드를 MRU 끝으로 끌어올리는 쓰기성 행위다.' },
    'narrative.line6': { en: 'A put on a full cache makes the node at the LRU end vanish from both areas together.', ko: 'capacity 가 꽉 찬 상태에서 새 키 put → LRU 끝의 노드가 두 영역에서 동기 소멸.' },
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
          placeholder: { en: 'e.g. k4', ko: '예: k4' },
          default: '',
        },
        {
          widget: 'value-input',
          name: 'value',
          action: 'input',
          label: { en: 'value', ko: 'value' },
          placeholder: { en: 'e.g. v4', ko: '예: v4' },
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
