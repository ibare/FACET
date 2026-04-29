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

import type { FacetJson } from '@facet/core/runtime';

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
          placeholder: '예: 3',
          default: '',
        },
        {
          widget: 'value-input',
          name: 'value',
          action: 'input',
          label: { en: 'v', ko: 'v' },
          placeholder: '예: 5',
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
