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

import type { FacetJson } from '@ffacet/core/runtime';

export const linkedListFacet: FacetJson = {
  id: 'facet:linkedListSingly',
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
  messages: {
    'caption.base': { en: 'In a linked list every node holds a single finger pointing only at its own next — inserting or removing is not moving cards around but cutting and retying two or three fingers.', ko: '연결 리스트는 노드 각각이 자기 다음 한 명만 가리키는 단 하나의 손가락을 갖는다 — 끼우거나 빼는 일은 카드를 옮기는 게 아니라 두세 개의 손가락을 끊고 다시 잇는 일이다.' },
    'caption.emptyList': { en: 'The list is empty.', ko: '리스트가 비어 있다.' },
    'caption.handover': { en: 'Your turn — type an index and a value, then press Insert, Remove or Search.', ko: '이제 직접 — 인덱스와 값을 입력하고 삽입·삭제·검색을 눌러보세요.' },
    'caption.headSlideNew': { en: 'The head label glided over to the new card.', ko: 'head 라벨이 새 카드 위로 활주했다.' },
    'caption.headSlideSecond': { en: 'The head label glided over to the second card.', ko: 'head 라벨이 두 번째 카드 위로 활주했다.' },
    'caption.insertBindNext': { en: 'Tied the new card\'s finger to the next card first.', ko: '새 카드의 손가락을 다음 카드에 먼저 묶었다.' },
    'caption.insertHeadBind': { en: 'Tied the new card\'s finger to the old first card.', ko: '새 카드의 손가락을 옛 첫 카드로 묶었다.' },
    'caption.insertLimit': { en: 'Reached the teaching limit — no more cards can be threaded in.', ko: '학습 한도 도달 — 더 이상 새 카드를 끼울 수 없다.' },
    'caption.insertRewirePrev': { en: 'Moved the previous card\'s finger over to the new card.', ko: '이전 카드의 손가락을 새 카드로 옮겨 끼웠다.' },
    'caption.removeRewire': { en: 'Moved the previous card\'s finger straight on to the next card.', ko: '이전 카드의 손가락을 다음 카드로 곧장 옮겨 끼웠다.' },
    'caption.searchFound': { en: 'Found it after {walked} steps — {value} at index {index}', ko: '{walked} 칸 만에 찾았다 — 인덱스 {index} 의 {value}' },
    'caption.searchMiss': { en: 'Walked to the end, and that value was not there.', ko: '끝까지 갔지만 그 값은 없었다.' },
    'caption.searchStart': { en: 'Starting at the head — following the fingers one step at a time.', ko: '머리에서 출발 — 손가락을 한 칸씩 따라간다.' },
    'caption.unreachable': { en: 'That position cannot be reached ({op} {index}).', ko: '그 자리에 닿을 수 없다 ({op} {index}).' },
    'caption.walked': { en: 'Walked {count} steps so far.', ko: '지금까지 {count} 칸 걸었다.' },
    'label.stage': { en: 'Step', ko: '단계' },
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
          placeholder: { en: 'e.g. 2', ko: '예: 2' },
          default: '',
        },
        {
          widget: 'value-input',
          name: 'value',
          action: 'input',
          label: { en: 'v', ko: 'v' },
          placeholder: { en: 'e.g. 25', ko: '예: 25' },
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
