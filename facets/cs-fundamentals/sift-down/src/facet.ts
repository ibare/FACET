/**
 * @piece
 *
 * sift-down — 하향 재배치. 꼭대기를 빼면 자리가 비고, 맨 끝 값이 그 자리로
 * 올라가 두 자식 중 앞선 쪽과 맞바꾸며 한 칸씩 내려간다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const siftDownFacet: FacetJson = {
  id: 'facet:siftDown',
  title: { en: 'Sift Down', ko: '하향 재배치' },
  algorithm: 'module:siftDown',
  projector: 'module:siftDownProjector',
  initialData: {
    type: 'sift-down',
    values: [3, 5, 8, 9, 6, 12, 10],
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'sift-down-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.extract': { en: 'Remove the top value {v}', ko: '꼭대기 값 {v} 을 뺀다' },
    'caption.fill': {
      en: 'Move the last value {v} into the empty top',
      ko: '맨 끝 값 {v} 을 빈 자리로 올린다',
    },
    'caption.compareTwo': {
      en: 'Compare children {l} and {r} — {w} is smaller',
      ko: '두 자식 {l} · {r} 중 {w} 이 더 작다',
    },
    'caption.compareOne': {
      en: 'Only one child, {l} — compare with it',
      ko: '자식이 {l} 하나뿐이라 그쪽과 견준다',
    },
    'caption.swap': { en: 'Swap places and sink down', ko: '자리를 맞바꾸며 한 칸 내려간다' },
    'caption.settle': {
      en: 'Smaller than both children (or none left) — stop here',
      ko: '두 자식보다 앞서거나 자식이 없어 멈춘다',
    },
  },
};
