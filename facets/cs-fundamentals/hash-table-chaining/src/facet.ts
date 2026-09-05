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

import type { FacetJson } from '@ffacet/core/runtime';

export const hashTableFacet: FacetJson = {
  id: 'facet:hashTableChaining',
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
  messages: {
    'caption.alphaWarn': { en: 'The table is getting cramped — it will need to grow soon.', ko: '표가 답답해지고 있다 — 곧 표를 키워야 한다.' },
    'caption.base': { en: 'A hash table lays out a row of identical slots and a function box throws each key into the one slot it picks — when two land on the same slot, a chain grows there.', ko: '해시 테이블은 같은 모양의 칸을 여러 개 늘어놓고 함수 박스가 키마다 한 자리를 정해 던진다 — 같은 자리에 둘이 떨어지면 그 자리에 사슬을 늘인다.' },
    'caption.collision': { en: 'Two landed on the same slot — the chain grows by one.', ko: '같은 자리에 둘이 떨어졌다 — 사슬이 한 칸 자란다.' },
    'caption.duplicate': { en: 'key {key} is already on that chain.', ko: 'key {key} 는 이미 그 자리 사슬에 있다.' },
    'caption.emptyTable': { en: 'The table is empty.', ko: '표가 비어 있다.' },
    'caption.emptyTableOp': { en: 'The table is empty — there is no key to search for or remove.', ko: '표가 비어 있다 — 검색·삭제할 키가 없다.' },
    'caption.handover': { en: 'Your turn — type a key, then press Insert, Search or Remove.', ko: '이제 직접 — 키를 입력하고 삽입·검색·삭제를 눌러보세요.' },
    'caption.insert': { en: 'Threw the key into the slot the function chose.', ko: '키를 정해진 자리로 던져 넣었다.' },
    'caption.invalidKey': { en: 'Only integer keys are accepted (got "{raw}").', ko: '정수 키만 받는다 (입력: "{raw}").' },
    'caption.rehashBegin': { en: 'The table got cramped — growing it and throwing everything again.', ko: '표가 답답해졌다 — 표를 키우고 모두 다시 던진다.' },
    'caption.rehashEnd': { en: 'Grew the table and threw everything again — α is back in the safe range.', ko: '표를 키우고 모두 다시 던졌다 — α 가 다시 안전 구간이다.' },
    'caption.removeStart': { en: 'The function box points at a slot — taking it off there.', ko: '함수 박스가 자리를 가리킨다 — 그 자리에서 떼어낸다.' },
    'caption.removed': { en: 'Took only {key} off the chain.', ko: '사슬에서 {key} 만 떼어냈다.' },
    'caption.searchFound': { en: 'One jump plus {walked} comparisons — arrived at {key} in index {index}.', ko: '한 번의 점프 + {walked} 칸 비교 — 인덱스 {index} 의 {key} 도착.' },
    'caption.searchMiss': { en: 'That key is not on this slot\'s chain.', ko: '이 자리 사슬에 그 키는 없다.' },
    'caption.searchStart': { en: 'The function box points at a slot — now walking that slot\'s chain.', ko: '함수 박스가 자리를 가리킨다 — 그 자리의 사슬을 짚어 본다.' },
    'label.auxChaining': { en: 'side by side — separate chaining', ko: '보조 비교 — 분리 체이닝' },
    'label.auxChainingNote': { en: 'the chain hangs downward', ko: '아래로 사슬이 늘어진다' },
    'label.auxProbing': { en: 'in contrast — linear probing', ko: '대비 — 선형 탐사' },
    'label.auxProbingNote': { en: 'it squeezes sideways and moves on', ko: '옆으로 비집고 전진한다' },
    'label.auxRehashNote': { en: 'the main view shows the new table, the side panel the old one', ko: '본 시각은 새 표로, 보조는 옛 표 비교용' },
    'label.distEmpty': { en: 'distribution: —', ko: '분포: —' },
    'label.distribution': { en: 'distribution: empty {empty} · length 1: {len1} · length 2: {len2} · length 3+: {len3plus}', ko: '분포: 비어 {empty} · 길이 1: {len1} · 길이 2: {len2} · 길이 3+: {len3plus}' },
    'label.loadFactor': { en: 'load factor', ko: '적재율 (load factor)' },
    'line.removeKey': { en: 'key to remove = {key}', ko: '삭제할 key={key}' },
    'line.searchKey': { en: 'key to find = {key}', ko: '찾을 key={key}' },
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
          placeholder: { en: 'e.g. 42', ko: '예: 42' },
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
