/**
 * 되짚어 나오기 — 조각(piece).
 *
 * @piece 한 줄기를 끝까지 파고들었다가 막히면 왔던 길을 거슬러 나오는 걸음이,
 *        "다음 자리로 넘어가는 걸음" 과 어떻게 다른가.
 *
 * 조각이므로 header · metrics · layout · code-view 를 두지 않는다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const diveThenBacktrackFacet: FacetJson = {
  id: 'facet:diveThenBacktrack',
  title: {
    en: 'Dive, then back out',
    ko: '파고들었다 되짚어 나오기',
  },
  description: {
    en: 'A depth-first walk spends as many moves backing out as it spends going in.',
    ko: '깊이 우선 답사는 파고드는 걸음만큼 되짚어 나오는 걸음을 쓴다.',
  },
  algorithm: 'module:diveThenBacktrack',
  projector: 'module:diveThenBacktrackProjector',
  initialData: {
    type: 'dive-then-backtrack',
    vertices: ['A', 'B', 'C', 'D', 'E', 'F'],
    edges: [
      ['A', 'B'],
      ['B', 'D'],
      ['B', 'E'],
      ['A', 'C'],
      ['C', 'F'],
    ],
    start: 'A',
    stepMs: 700,
  },
  blocks: {
    stage: { type: 'dive-then-backtrack-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.start': {
      en: 'Start at {node} and take one branch as far as it goes.',
      ko: '{node} 에서 출발해 한 줄기를 끝까지 따라간다.',
    },
    'caption.dive': {
      en: 'Dig one step deeper into {node}.',
      ko: '{node} 로 한 칸 더 파고든다.',
    },
    'caption.deadEnd': {
      en: 'Nowhere left to go from {node}.',
      ko: '{node} 에서는 더 갈 곳이 없다.',
    },
    'caption.retreat': {
      en: 'Back out to {node} along the way we came.',
      ko: '왔던 길을 되짚어 {node} 로 물러난다.',
    },
    'caption.done': {
      en: 'All {visited} reached — and {backtracks} of the moves were retreats back up.',
      ko: '{visited} 곳을 모두 밟았다 — 그 걸음 가운데 {backtracks} 번은 되짚어 나온 걸음이다.',
    },
  },
};
