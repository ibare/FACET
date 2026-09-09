/**
 * @piece — 조각(piece) facet. 질문 하나에 답하고 멈춘다 (S-piece).
 *
 * 답하는 질문: **같은 선이라도 화살이 붙으면 무엇이 달라지는가.**
 *
 * 다섯 정점이 고리로 이어져 있다. 무방향일 때 S 에서 다섯 모두에 닿지만,
 * 같은 다섯 선에 방향이 붙으면 C 로 들어가는 화살이 하나도 없어 C 가 닿지
 * 못하는 자리로 밀려난다.
 *
 * header(title-block) 도 metrics 도 layout 도 두지 않는다 — 제목은 글의
 * 문단이 주고, 조각은 셀 것이 없으며, 배치는 stage 와 controls 뿐이라 러너의
 * 기본 배치로 족하다.
 */

import { CONTROL } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';
import type { OneWayEdgeData } from './algorithm.js';

export const oneWayEdgeFacet: FacetJson = {
  id: 'facet:oneWayEdge',
  title: { en: 'Directed edge', ko: '방향 간선' },
  description: {
    en: 'The same line, once it carries an arrow, loses the way back.',
    ko: '같은 선이라도 화살이 붙으면 되돌아오는 길이 사라진다.',
  },
  algorithm: 'module:oneWayEdge',
  projector: 'module:oneWayEdgeProjector',
  initialData: {
    type: 'one-way-edge',
    // 다섯 정점이 이룬 고리. 아래 다섯 선은 무방향으로 먼저 놓이고,
    // 2단계에서 `dir` 이 가리키는 한 방향씩만 남는다.
    //   'uv' → u 에서 v 로,  'vu' → v 에서 u 로.
    nodes: ['S', 'A', 'B', 'T', 'C'],
    edges: [
      { u: 'S', v: 'A', dir: 'uv' },
      { u: 'A', v: 'B', dir: 'uv' },
      { u: 'B', v: 'T', dir: 'uv' },
      { u: 'S', v: 'C', dir: 'vu' },
      { u: 'C', v: 'T', dir: 'uv' },
    ],
    source: 'S',
    // 걸음 간격. stage 의 이동 애니메이션이 이 위에 더해진다 (S-piece).
    stepMs: 800,
  } satisfies OneWayEdgeData,
  blocks: {
    stage: { type: 'one-way-edge-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.undirected': {
      en: 'No arrows yet — every line runs both ways.',
      ko: '아직 화살이 없다 — 모든 선이 양쪽으로 통한다.',
    },
    'caption.openReach': {
      en: 'From {source}, every one of the {total} vertices is reachable.',
      ko: '{source} 에서 {total} 개 정점 모두에 닿는다.',
    },
    'caption.directed': {
      en: 'The same {lines} lines take arrows. Each keeps one way only.',
      ko: '같은 {lines} 개의 선에 화살이 붙는다. 한 방향만 남는다.',
    },
    'caption.blocked': {
      en: 'Every line at {node} points away — nothing arrives.',
      ko: '{node} 에 닿은 선은 모두 밖으로 향한다 — 들어오는 화살이 없다.',
    },
    'caption.stranded': {
      en: 'From {source}: {reached} of {total}. {nodes} is out of reach.',
      ko: '{source} 에서 {total} 중 {reached} — {nodes} 는 닿지 못한다.',
    },
  },
};
