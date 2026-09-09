/**
 * @piece 가장 가까운 것부터 확정하기 — 왜 지금 굳혀도 되는가.
 *
 * 정점 자리(x/y)는 0~1 로 적은 저작 결정이다. 픽셀 환산은 stage 가 캔버스
 * 크기에서 하므로 캔버스가 넓어지면 그림도 함께 커진다.
 *
 * 간선은 무방향이며 from/to 는 적는 순서일 뿐이다. 걸리는 수(무게)만 사실이고,
 * 각 정점이 이게 될 수는 알고리즘이 이 구조에서 셈한다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const pickNearestUnsettledFacet: FacetJson = {
  id: 'facet:pickNearestUnsettled',
  title: {
    en: 'Settle the nearest first',
    ko: '가장 가까운 것부터 굳힌다',
  },
  description: {
    en: 'The loose one carrying the smallest number cannot drop any further — so it hardens, and nothing can shake it afterwards.',
    ko: '흔들리는 것 중 가장 작은 수를 인 것은 더 줄어들 수 없다. 그래서 굳고, 굳은 뒤에는 무엇이 닿아도 다시 흔들리지 않는다.',
  },
  algorithm: 'module:pickNearestUnsettled',
  projector: 'module:pickNearestUnsettledProjector',
  initialData: {
    type: 'weighted-graph',
    // 자리는 여기 없다 — 어디에 놓을지는 그림의 결정이라 stage 가 정한다 (S-piece).
    nodes: [{ id: 'S' }, { id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    edges: [
      { from: 'S', to: 'A', weight: 4 },
      { from: 'S', to: 'B', weight: 1 },
      { from: 'B', to: 'A', weight: 2 },
      { from: 'B', to: 'C', weight: 5 },
      { from: 'A', to: 'C', weight: 3 },
      { from: 'C', to: 'D', weight: 2 },
    ],
    source: 'S',
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'pick-nearest-unsettled-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.start': {
      en: 'Nothing has hardened yet.',
      ko: '아직 아무것도 굳지 않았다.',
    },
    'caption.seed': {
      en: 'Start at {node} with 0.',
      ko: '{node} 에서 시작한다 — 0.',
    },
    'caption.harden': {
      en: '{node} holds the smallest, {value} — it can drop no further.',
      ko: '가장 작은 수를 인 것은 {node}, 그 수는 {value}. 더 줄어들 수 없으니 굳는다.',
    },
    'caption.spreadBoth': {
      en: 'The hardened repel it; the loose take it and drop.',
      ko: '굳은 것은 튕겨내고, 흔들리는 것은 받아 수를 내린다.',
    },
    'caption.spreadReach': {
      en: 'Numbers cross from {node} to its neighbours.',
      ko: '{node} 를 지나 이웃으로 수가 건너간다.',
    },
    'caption.spreadBlocked': {
      en: 'It hits stone — nothing budges.',
      ko: '굳은 것에 닿는다 — 꿈쩍하지 않는다.',
    },
    'caption.spreadNone': {
      en: 'It reaches them, but no number changes.',
      ko: '닿기는 하지만 아무 수도 바뀌지 않는다.',
    },
    'caption.done': {
      en: 'All hardened. Nothing is loose.',
      ko: '모두 굳었다. 흔들리는 것이 남지 않았다.',
    },
  },
};
