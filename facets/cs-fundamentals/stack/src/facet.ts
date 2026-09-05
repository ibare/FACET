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

import type { FacetJson } from '@ffacet/core/runtime';

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
  messages: {
    'caption.base': { en: 'A stack hands back the most recently added element first — every change happens at one single place, the top.', ko: '스택은 가장 최근에 들어온 원소를 가장 먼저 꺼내는 자료구조다 — 모든 변화는 꼭대기 한 자리에서만 일어난다.' },
    'caption.feedInput': { en: 'Boxes are waiting on the input track — they will be stacked on top one by one.', ko: '입력 트랙에 박스가 대기 중 — 차례로 꼭대기에 쌓인다' },
    'caption.handover': { en: 'Your turn — type a value and press Push, Pop or Peek.', ko: '이제 직접 — 값을 입력하고 쌓기·떼기·보기를 눌러보세요' },
    'caption.overflow': { en: 'No room left to stack.', ko: '더 쌓을 자리가 없다' },
    'caption.peek': { en: 'Looked at the top value — the pile is unchanged.', ko: '꼭대기 값을 보았다 — 더미는 그대로다' },
    'caption.pop': { en: 'Took the top box off — {value}', ko: '꼭대기의 박스를 떼어냈다 — {value}' },
    'caption.push': { en: 'Placed a new box on top — {value}', ko: '꼭대기 위에 새 박스를 얹었다 — {value}' },
    'caption.underflow': { en: 'No box left to take off.', ko: '떼어낼 박스가 없다' },
    'label.empty': { en: '(empty)', ko: '비어 있음' },
    'label.inputTrack': { en: 'input', ko: '입력' },
    'label.outputTrack': { en: 'output', ko: '출력' },
    'label.top': { en: 'Top', ko: '꼭대기' },
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
          placeholder: { en: 'e.g. A', ko: '예: A' },
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
