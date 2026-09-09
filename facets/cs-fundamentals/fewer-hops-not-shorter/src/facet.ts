/**
 * @piece 가중 그래프에서 간선을 적게 거치는 길이 짧은 길은 아니다.
 *
 * 답하는 질문 하나 — "정점을 적게 거치면 더 짧은 길인가?"
 *
 * `initialData` 는 구조만 선언한다. 길이 몇 갈래인지, 각 길의 간선 수와 무게 합이
 * 얼마인지는 algorithm 이 이 구조에서 셈한다 (파생값을 손으로 적지 않는다).
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const fewerHopsNotShorterFacet: FacetJson = {
  id: 'facet:fewerHopsNotShorter',
  title: {
    en: 'Fewer hops is not shorter',
    ko: '적게 거친다고 짧은 길은 아니다',
  },
  description: {
    en: 'Two routes join the same pair of vertices. The one crossing fewer edges is the heavier one.',
    ko: '같은 두 정점을 잇는 길 둘. 간선을 적게 거치는 쪽이 무게로는 더 먼 길이다.',
  },
  algorithm: 'module:fewerHopsNotShorter',
  projector: 'module:fewerHopsNotShorterProjector',
  initialData: {
    type: 'fewer-hops-not-shorter',
    nodes: ['S', 'A', 'T', 'B', 'C', 'D'],
    edges: [
      { from: 'S', to: 'A', weight: 9 },
      { from: 'A', to: 'T', weight: 9 },
      { from: 'S', to: 'B', weight: 2 },
      { from: 'B', to: 'C', weight: 3 },
      { from: 'C', to: 'D', weight: 2 },
      { from: 'D', to: 'T', weight: 4 },
    ],
    source: 'S',
    target: 'T',
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'fewer-hops-not-shorter-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.twoRoutes': {
      en: 'Two routes lead from {source} to {target}.',
      ko: '{source} 에서 {target} 로 가는 길은 둘이다.',
    },
    'caption.countHops': {
      en: 'First, count only the edges each route crosses.',
      ko: '먼저 각 길이 지나는 간선만 센다.',
    },
    'caption.fewerHops': {
      en: 'Edges: {route} = {hops}, {rival} = {rivalHops}. Fewer here.',
      ko: '간선 수: {route} = {hops}, {rival} = {rivalHops}. 이쪽이 적게 거친다.',
    },
    'caption.weighing': {
      en: 'Weighing {route}: {total} so far.',
      ko: '{route} 의 무게를 잰다 — 지금까지 {total}.',
    },
    'caption.reversed': {
      en: 'Weight: {route} = {total}, {rival} = {rivalTotal}. The order reverses.',
      ko: '무게: {route} = {total}, {rival} = {rivalTotal}. 순위가 뒤집힌다.',
    },
    'label.hops': {
      en: '{n} hops',
      ko: '간선 {n}개',
    },
    'label.weight': {
      en: 'weight {w}',
      ko: '무게 {w}',
    },
  },
};
