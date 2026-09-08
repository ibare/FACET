/**
 * guess-by-value facet 선언.
 *
 * @piece 한 질문에 답하고 멈추는 조각(piece) — "값이 고르게 퍼져 있으면 값 자체가
 * 자리에 대한 정보를 준다. 그것을 쓰면 가운데를 짚는 것보다 적게 짚는다."
 *
 * 제목은 글의 문단이 주므로 title-block 을 두지 않고, 셀 것을 패널에 두지 않으므로
 * metrics 도 없다. 배치는 stage 와 controls 뿐이라 러너의 기본 배치를 쓴다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const guessByValueFacet: FacetJson = {
  id: 'facet:guessByValue',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'Interpolation Guess', ko: '보간 추정' },
  description: {
    en: 'On evenly spread values, the value itself says where to look.',
    ko: '고르게 퍼진 값에서는 값 자체가 어디를 볼지 말해 준다.',
  },
  algorithm: 'module:guessByValue',
  projector: 'module:guessByValueProjector',
  initialData: {
    type: 'guess-by-value',
    // 고르게 퍼진 열 개. 두 줄이 같은 배열을 훑는다.
    values: [10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
    target: 90,
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'guess-by-value-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'label.laneMiddle': { en: 'Always the middle', ko: '늘 가운데를 짚는 쪽' },
    'label.laneAim': { en: 'Aim by value', ko: '값으로 겨누는 쪽' },

    'caption.begin': {
      en: 'Looking for {target} in an evenly spread array.',
      ko: '고르게 퍼진 배열에서 {target} 을 찾는다.',
    },
    'caption.midProbe': {
      en: 'The middle of what is left holds {value}.',
      ko: '남은 구간의 가운데는 {value}.',
    },
    'caption.midDropLeft': {
      en: '{value} is below {target} — the left half is out.',
      ko: '{value} 는 {target} 보다 작다 — 왼쪽 절반이 빠진다.',
    },
    'caption.midDropRight': {
      en: '{value} is above {target} — the right half is out.',
      ko: '{value} 는 {target} 보다 크다 — 오른쪽 절반이 빠진다.',
    },
    'caption.midHit': {
      en: 'The middle lands on {target}.',
      ko: '가운데가 {target} 에 떨어졌다.',
    },

    'caption.scaleSet': {
      en: 'Read the two ends as a scale — {loValue} to {hiValue}.',
      ko: '양 끝을 자로 읽는다 — {loValue} 에서 {hiValue} 까지.',
    },
    'caption.aimMeasure': {
      en: 'Where does {target} sit on that scale?',
      ko: '{target} 은 그 자 위 어디쯤인가.',
    },
    'caption.aimLand': {
      en: 'The same fraction of the slots — slot {index}.',
      ko: '자리도 같은 비율만큼 — 자리 {index}.',
    },
    'caption.aimHit': {
      en: 'Slot {index} holds {target}. Straight there.',
      ko: '자리 {index} 에 {target} 이 있다. 곧장 닿았다.',
    },
    'caption.aimMiss': {
      en: 'Slot {index} holds {value}. Narrow the scale and aim again.',
      ko: '자리 {index} 에는 {value} 가 있다. 자를 좁혀 다시 겨눈다.',
    },

    'caption.verdict': {
      en: '{aim} against {mid}. The value itself said where to look.',
      ko: '{aim} 대 {mid}. 값 자체가 어디를 볼지 말해 주었다.',
    },
  },
};
