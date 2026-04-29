/**
 * Stack (LIFO) facet JSON 선언.
 *
 * 진행 모델 입력 반응형 — algorithm 등록 시 mechanismKind: 'reactive' 사용.
 * mount 즉시 자동 시연 (1·2·3 push) 후 학습자 입력 대기.
 *
 * 컨트롤바 어휘 (기획 §6 컨트롤 영역):
 *   [ 값 입력 ] [ 쌓기 ] [ 떼기 ] [ 보기 ] [ 초기화 ]
 *
 * 코드 패널은 1차 구현에서 생략 (기획 §6 § 7 본체 미언급).
 *
 * 식별자 (C1): 'stack:top' 만 사용.
 */

import type { FacetJson } from '@facet/core/runtime';

export const stackFacet: FacetJson = {
  id: 'facet:stack',
  title: { en: 'Stack (LIFO)', ko: '스택 (LIFO)' },
  description: {
    en: 'One spot to add, one spot to remove — last in, first out',
    ko: '한 자리만 만진다 — 마지막에 들어온 것이 가장 먼저 나온다',
  },
  algorithm: 'module:stack',
  projector: 'module:stackProjector',
  initialData: {
    type: 'stack',
    initialValues: ['1', '2', '3'],
    maxHeight: 8,
    autoDemoIntervalMs: 700,
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
      type: 'stack-stage',
    },
    controls: {
      type: 'control-bar',
      controls: [
        {
          widget: 'value-input',
          name: 'value',
          action: 'input',
          label: { en: 'Value', ko: '값' },
          placeholder: '예: A',
          default: '',
        },
        { widget: 'button', action: 'push', label: { en: 'Push', ko: '쌓기' } },
        { widget: 'button', action: 'pop', label: { en: 'Pop', ko: '떼기' } },
        { widget: 'button', action: 'peek', label: { en: 'Peek', ko: '보기' } },
        { widget: 'button', action: 'reset', label: { en: 'Reset', ko: '초기화' } },
      ],
      metrics: [
        { name: 'push-count', label: { en: 'Push', ko: '쌓기' }, initial: 0 },
        { name: 'pop-count', label: { en: 'Pop', ko: '떼기' }, initial: 0 },
        { name: 'peek-count', label: { en: 'Peek', ko: '보기' }, initial: 0 },
        { name: 'overflow-count', label: { en: 'Overflow', ko: '넘침' }, initial: 0 },
        { name: 'underflow-count', label: { en: 'Underflow', ko: '빔' }, initial: 0 },
      ],
    },
  },
};
