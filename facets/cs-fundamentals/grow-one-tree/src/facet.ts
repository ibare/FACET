/**
 * grow-one-tree — 나무 하나를 키워 나가기 (프림).
 *
 * @piece 이미 자란 나무에 닿아 있는 간선 중에서만 고른다. 그림 전체에서 가장
 * 가벼운 간선을 고르는 것이 아니라는 것, 그래서 고를 수 있는 것이 걸음마다
 * 달라진다는 것 하나만 말한다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const growOneTreeFacet: FacetJson = {
  id: 'facet:growOneTree',
  title: { en: 'Growing one tree', ko: '나무 하나를 키워 나가기' },
  description: {
    en: 'Prim picks only among the edges that already touch the tree.',
    ko: '프림은 이미 자란 나무에 닿아 있는 간선 중에서만 고른다.',
  },
  algorithm: 'module:growOneTree',
  projector: 'module:growOneTreeProjector',
  initialData: {
    type: 'grow-one-tree',
    nodes: ['A', 'B', 'C', 'D', 'E'],
    edges: [
      { id: 'A-B', u: 'A', v: 'B', w: 2 },
      { id: 'A-C', u: 'A', v: 'C', w: 3 },
      { id: 'B-C', u: 'B', v: 'C', w: 1 },
      { id: 'B-D', u: 'B', v: 'D', w: 4 },
      { id: 'C-E', u: 'C', v: 'E', w: 5 },
      { id: 'D-E', u: 'D', v: 'E', w: 2 },
    ],
    start: 'A',
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'grow-one-tree-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'lane.tree': { en: 'in tree', ko: '나무' },
    'lane.canPick': { en: 'can pick', ko: '고를 수 있다' },
    'lane.blocked': { en: 'cannot', ko: '고를 수 없다' },

    'caption.seed': {
      en: 'Start with {node} alone — that is the whole tree.',
      ko: '{node} 하나로 시작한다. 이것이 지금의 나무다.',
    },
    'caption.frontier': {
      en: 'Only the {count} edges leading out of the tree can be picked.',
      ko: '나무 밖으로 나가는 간선 {count}개. 고를 수 있는 것은 이것뿐이다.',
    },
    'caption.pick': {
      en: 'The lightest of them is {weight} — {node} joins the tree.',
      ko: '고를 수 있는 것 중 가장 가벼운 무게 {weight}. {node} 가 나무에 붙는다.',
    },
    'caption.pickBlocked': {
      en: 'The lightest of them is {weight} — {node} joins the tree.\n{edge} weighs only {blocked}, but it does not touch the tree yet.',
      ko: '고를 수 있는 것 중 가장 가벼운 무게 {weight}. {node} 가 나무에 붙는다.\n더 가벼운 {edge}, 무게 {blocked}. 아직 나무에 닿지 않아 고를 수 없다.',
    },
    'caption.done': {
      en: 'The tree is full — {count} edges, total weight {total}.',
      ko: '나무가 다 자랐다. 간선 {count}개, 무게 합 {total}.',
    },
  },
};
