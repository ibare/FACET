/**
 * @piece 피벗 분할 — 가르고 나면 정렬된 것인가?
 *
 * 질문 하나에 답하고 멈춘다. 값들이 같은 기준 하나와 한 번씩 견주어 좌우로
 * 건너가고, 기준은 건너지 않고 경계에 남아 자리가 확정된다. 각 쪽 안은 여전히
 * 들어온 순서 그대로다.
 *
 * 조각이므로 header / metrics / layout 을 두지 않는다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const partitionAroundPivotFacet: FacetJson = {
  id: 'facet:partitionAroundPivot',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'Partitioning', ko: '피벗 분할' },
  description: {
    en: 'Each value is compared with the same pivot and crosses to one side. The pivot itself stays on the line.',
    ko: '값마다 같은 기준 하나와 견주어 한쪽으로 건너간다. 기준 자신은 선에 남는다.',
  },
  algorithm: 'module:partitionAroundPivot',
  projector: 'module:partitionAroundPivotProjector',
  initialData: {
    type: 'partition-around-pivot',
    values: [7, 2, 9, 3, 8],
    pivot: 5,
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'partition-around-pivot-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.intro': {
      en: 'Every value meets the same pivot {pivot}.',
      ko: '값마다 같은 기준 {pivot} 하나와 견준다.',
    },
    'caption.less': {
      en: '{value} < {pivot} — it crosses to the left.',
      ko: '{value} < {pivot} — 왼쪽으로 건너간다.',
    },
    'caption.greater': {
      en: '{value} > {pivot} — it crosses to the right.',
      ko: '{value} > {pivot} — 오른쪽으로 건너간다.',
    },
    'caption.pivotFinal': {
      en: 'The pivot never crossed. Its place is settled.',
      ko: '기준은 건너지 않았다. 이 자리가 확정된다.',
    },
    'caption.done': {
      en: '{less} on the left, {greater} on the right — split, not sorted.',
      ko: '왼쪽 {less}개, 오른쪽 {greater}개 — 갈렸을 뿐 정렬은 아니다.',
    },
  },
};
