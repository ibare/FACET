/**
 * 최대 마진 — 가장 넓은 틈을 낸다.
 *
 * @piece 질문 하나에 답하고 멈춘다 (S-piece).
 *   두 무리를 가르는 선이 무수히 많은데 어느 것을 고르는가.
 *
 * `initialData` 에는 구조만 둔다 — 점의 좌표와 이름표, 견줄 후보 기울기,
 * 걸음 간격. 자리·축척·색은 stage 가 캔버스에서 역산하고, 띠의 두께와 어느
 * 점이 띠를 멈췄는지는 algorithm 이 좌표에서 셈한다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const widestMarginFacet: FacetJson = {
  id: 'facet:widestMargin',
  title: { en: 'Widest margin', ko: '최대 마진' },
  description: {
    en: 'Among the lines that separate two labeled groups, the one that opens the widest band wins.',
    ko: '두 무리를 가르는 선 가운데 띠가 가장 두껍게 벌어지는 것을 고른다.',
  },
  algorithm: 'module:widestMargin',
  projector: 'module:widestMarginProjector',
  initialData: {
    type: 'widest-margin',
    points: [
      { x: 1, y: 1, group: 'A' },
      { x: 2, y: 2, group: 'A' },
      { x: 4, y: 1, group: 'A' },
      { x: 1, y: 5, group: 'B' },
      { x: 3, y: 4, group: 'B' },
      { x: 5, y: 5, group: 'B' },
    ],
    candidateSlopes: [-0.6, -0.3, 0, 0.3, 0.6],
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'widest-margin-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.points': {
      en: 'Points carrying two different labels.',
      ko: '이름표가 서로 다른 점들이 놓인다.',
    },
    'caption.candidates': {
      en: 'Every one of these lines separates the two groups.',
      ko: '이 선들은 모두 두 무리를 가른다.',
    },
    'caption.grow': {
      en: 'Slope {slope}: the band widens until it touches a point, then stops.',
      ko: '기울기 {slope}: 띠가 벌어지다 점에 닿아 멈춘다.',
    },
    'caption.pivot': {
      en: 'Turning to the slope that lets the band open widest.',
      ko: '띠가 가장 두껍게 벌어질 기울기로 돌린다.',
    },
    'caption.growBest': {
      en: 'Slope {slope}: this band opens wider than any candidate.',
      ko: '기울기 {slope}: 어느 후보보다 두껍게 벌어진다.',
    },
    'caption.contacts': {
      en: 'The points the band touched are what fix this line.',
      ko: '띠에 닿은 점들이 이 선을 정했다.',
    },
    'caption.done': {
      en: 'The widest gap wins. Thickness: {thickness}',
      ko: '가장 넓은 틈을 낸 것이 답이다. 두께: {thickness}',
    },
    'label.thickness': { en: 'band thickness', ko: '띠의 두께' },
  },
};
