/**
 * halveTheRange facet 선언.
 *
 * @piece 한 번의 견줌으로 후보에서 정확히 몇이 빠지는가 — 조각(piece) facet.
 *
 * 자동으로 재생되고 멈춘다. 다시 보기와 한 걸음 외에 조작은 받지 않으며,
 * 아무것도 누르지 않아도 화면은 할 말을 마친다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const halveTheRangeFacet: FacetJson = {
  id: 'facet:halveTheRange',
  title: { en: 'Halving the range', ko: '구간 반분' },
  description: {
    en: 'One comparison, and exactly this many candidates are gone.',
    ko: '한 번의 견줌에 정확히 이만큼이 후보에서 빠진다.',
  },
  algorithm: 'module:halveTheRange',
  projector: 'module:halveTheRangeProjector',
  initialData: {
    type: 'halve-the-range',
    values: [1, 3, 5, 7, 9, 11, 13],
    target: 11,
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'halve-the-range-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.start': {
      en: 'A sorted range of {n}. Looking for {target}.',
      ko: '줄이 선 {n}개. {target} 을 찾는다.',
    },
    'caption.probe': {
      en: '{n} candidates left. The middle one is {mid}.',
      ko: '남은 후보 {n}개. 그 가운데는 {mid}.',
    },
    'caption.narrow': {
      en: '{mid} {rel} {target} — {swept} candidates leave at once. {left} left.',
      ko: '{mid} {rel} {target} — 후보 {swept}개가 한 번에 빠진다. 남은 {left}.',
    },
    'caption.found': {
      en: '{mid} = {target}. Found — the other {swept} leave. {left} left.',
      ko: '{mid} = {target}. 찾았다 — 나머지 {swept}개도 빠진다. 남은 {left}.',
    },
    'caption.done': {
      en: '{comparisons} comparisons cut {n} candidates down to {left}.',
      ko: '견줌 {comparisons}번이 후보를 {n}에서 {left}로 줄였다.',
    },
    'label.remaining': { en: '{n} candidates', ko: '후보 {n}개' },
    'label.gone': { en: '{n} gone', ko: '{n}개 빠짐' },
  },
};
