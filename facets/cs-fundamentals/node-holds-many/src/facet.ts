/**
 * node-holds-many — 다분기 노드 조각(piece) 선언.
 *
 * @piece 한 자리가 키를 여럿 담고, 그 키들 사이의 틈마다 아래로 갈 길이
 * 하나씩 열린다. 그래서 내려갈 곳을 고르는 일이 자리 안에서 벌어진다 —
 * 자리 하나가 갈림길 여럿을 품는다. 이 한 가지만 말하고 멈춘다.
 *
 * 제목 블록도 메트릭도 두지 않는다. 제목은 글의 문단이 주고, 조각은 셀 것이
 * 없다 (S-piece). layout 은 stage 와 controls 뿐이라 러너에 맡긴다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const nodeHoldsManyFacet: FacetJson = {
  id: 'facet:nodeHoldsMany',
  title: { en: 'Node Holds Many', ko: '다분기 노드' },
  description: { en: 'One node holds several keys.', ko: '한 자리에 여럿을 담는다.' },
  algorithm: 'module:nodeHoldsMany',
  projector: 'module:nodeHoldsManyProjector',
  initialData: {
    type: 'node-holds-many',
    stepMs: 720,
    target: 50,
    rootId: 'root',
    nodes: {
      root: { keys: [30, 60], children: ['c1', 'c2', 'c3'] },
      c1: { keys: [10, 20] },
      c2: { keys: [40, 50] },
      c3: { keys: [70, 80, 90] },
    },
  },
  blocks: {
    stage: { type: 'node-holds-many-stage' },
    controls: {
      type: 'control-bar',
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'label.target': { en: 'target {value}', ko: '찾는 값 {value}' },
    'stat.keysInNodes': { en: '{keys} keys in {nodes} nodes', ko: '키 {keys}개, 자리 {nodes}개' },
    'caption.sweepGt': { en: '{target} > {key} → next key', ko: '{target} > {key} → 다음 키로' },
    'caption.sweepLt': {
      en: '{target} < {key} → into the gap before it',
      ko: '{target} < {key} → 그 앞의 틈으로',
    },
    'caption.sweepEq': { en: '{target} = {key}', ko: '{target} = {key}' },
    'caption.descend': { en: 'goes down one level', ko: '한 층 내려간다' },
    'caption.found': { en: '{target} found', ko: '{target} 찾음' },
  },
};
