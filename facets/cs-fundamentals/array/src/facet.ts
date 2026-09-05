/**
 * Array facet JSON 선언.
 *
 * 진행 모델 입력 반응형 — algorithm 등록 시 mechanismKind: 'reactive' 사용.
 * mount 즉시 자동 시연 (read(3) → insert(1, "5")) 후 학습자 입력 대기.
 *
 * 컨트롤바 어휘 (기획 §6 § 7 컨트롤 영역):
 *   [ i ] [ v ] [ 호명 ] [ 쓰기 ] [ 삽입 ] [ 삭제 ] [ 뒤에 추가 ] [ 검색 ] [ 초기화 ]
 *
 * 코드 패널은 1차 구현에서 생략 (기획 §6 보조 요소 미언급).
 *
 * 식별자 (C1): `index:<n>` 표준 prefix 만 사용.
 */

import type { FacetJson } from '@ffacet/core/runtime';

export const arrayFacet: FacetJson = {
  id: 'facet:array',
  title: { en: 'Array', ko: '배열' },
  description: {
    en: 'Adjacent cells called by 0-based index — one-step jump, but inserts shift the rest',
    ko: '옆자리끼리 붙어 있다 — 번호만 알면 한 번에 가지만, 가운데를 건드리면 옆 칸이 줄줄이 밀린다',
  },
  algorithm: 'module:array',
  projector: 'module:arrayProjector',
  initialData: {
    type: 'array',
    initialValues: ['7', '3', '9', '1', '4'],
    initialCapacity: 8,
    growthFactor: 2,
    autoDemoIntervalMs: 1000,
    searchStepMs: 120,
    maxSize: 15,
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
    'label.sizeCap': { en: 'size {n} / cap {cap}', ko: 'size {n} / cap {cap}' },
    'caption.append': { en: 'Laid it on the end — nothing had to shift', ko: '끝 자리에 얹었다 — 옆 칸이 밀리지 않았다' },
    'caption.base': { en: 'An array packs equal-width cells side by side with no gaps and calls each one by a number counted from 0 — know the number and you arrive in one step, but touch the middle and the neighbours shift along.', ko: '배열은 같은 너비의 칸을 옆자리끼리 빈틈 없이 붙여 놓고 0 부터 매긴 번호로 호명한다 — 번호만 알면 한 번에, 가운데를 건드리면 옆 칸이 줄줄이 밀린다.' },
    'caption.handover': { en: 'Your turn — type an index and a value, then press Read, Write, Insert, Remove, Append or Search.', ko: '이제 직접 — 인덱스와 값을 입력하고 호명·쓰기·삽입·삭제·뒤에 추가·검색을 눌러보세요' },
    'caption.insert': { en: 'Slid one in at {index} — the {shifted} cells behind it each moved one place along', ko: '{index} 자리에 끼웠다 — 뒤의 {shifted} 칸이 한 자리씩 밀렸다' },
    'caption.limitReached': { en: 'Reached the teaching limit of {maxSize} — no further {op} is possible', ko: '학습 한도 {maxSize} 개 도달 — 더 이상 {op} 할 수 없다' },
    'caption.outOfRange': { en: 'That position is out of range ({op} {index}) — nothing happens on the strip', ko: '범위를 벗어난 자리 ({op} {index}) — 띠 위에서 일어나는 일은 없다' },
    'caption.read': { en: 'Jumped straight to cell {index} — one "start + {index}" reaches {value}', ko: '번호 {index} 칸으로 곧장 점프 — 시작 + {index} 한 번이면 {value} 에 도달' },
    'caption.remove': { en: 'Emptied {index} — the {shifted} cells behind it each pulled one place back', ko: '{index} 자리를 비웠다 — 뒤의 {shifted} 칸이 한 자리씩 당겨졌다' },
    'caption.resize': { en: 'The cells are full — moving {copied} of them onto a new strip twice the size', ko: '칸이 다 찼다 — 두 배 큰 새 띠로 {copied} 칸을 옮긴다' },
    'caption.searchFound': { en: 'Found it — {value} at index {index}', ko: '찾았다 — 인덱스 {index} 에 {value}' },
    'caption.searchMiss': { en: 'Not found — scanned the whole strip', ko: '찾지 못함 — 띠를 모두 살폈다' },
    'caption.write': { en: 'Replaced the value in cell {index} — the neighbours are untouched', ko: '{index} 번 칸의 값을 바꾸었다 — 옆 칸은 그대로다' },
    'label.arith': { en: 'start + {index}', ko: '시작 + {index}' },
    'label.shifts': { en: 'Shifts', ko: '시프트' },
  },
  blocks: {
    header: { type: 'title-block' },
    stage: {
      type: 'array-stage',
    },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'value-input',
          name: 'index',
          action: 'input',
          label: { en: 'i', ko: 'i' },
          placeholder: { en: 'e.g. 3', ko: '예: 3' },
          default: '',
        },
        {
          widget: 'value-input',
          name: 'value',
          action: 'input',
          label: { en: 'v', ko: 'v' },
          placeholder: { en: 'e.g. 5', ko: '예: 5' },
          default: '',
        },
        { widget: 'button', action: 'read', label: { en: 'Read', ko: '호명' } },
        { widget: 'button', action: 'write', label: { en: 'Write', ko: '쓰기' } },
        { widget: 'button', action: 'insert', label: { en: 'Insert', ko: '삽입' } },
        { widget: 'button', action: 'remove', label: { en: 'Remove', ko: '삭제' } },
        { widget: 'button', action: 'append', label: { en: 'Append', ko: '뒤에 추가' } },
        { widget: 'button', action: 'search', label: { en: 'Search', ko: '검색' } },
        { widget: 'button', action: 'reset', label: { en: 'Reset', ko: '초기화' } },
      ],
      metrics: [
        { name: 'read-count', label: { en: 'Read', ko: '호명' }, initial: 0 },
        { name: 'write-count', label: { en: 'Write', ko: '쓰기' }, initial: 0 },
        { name: 'insert-count', label: { en: 'Insert', ko: '삽입' }, initial: 0 },
        { name: 'remove-count', label: { en: 'Remove', ko: '삭제' }, initial: 0 },
        { name: 'append-count', label: { en: 'Append', ko: '추가' }, initial: 0 },
        { name: 'search-count', label: { en: 'Search', ko: '검색' }, initial: 0 },
        { name: 'shift-count', label: { en: 'Shift', ko: '시프트' }, initial: 0 },
        { name: 'resize-count', label: { en: 'Resize', ko: '이사' }, initial: 0 },
      ],
    },
  },
};
