/**
 * @piece 가운데를 거치면 짧아지는가 — 플로이드-워셜이 되풀이하는 물음 하나.
 *
 * 답하는 질문: **두 점 사이의 길을 고칠 때 묻는 것은 무엇인가.**
 * 하나다 — 이 정점을 거치면 짧아지는가. 그 물음이 가운데 후보마다, 그 안에서
 * 모든 짝마다 되풀이되고, 그중 몇 번만 답이 "그렇다" 다. 묻는 자리가 얼마나
 * 많은지가 보여야 세 겹 반복문이 화면에서 나온다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const throughMiddleNodeFacet: FacetJson = {
  id: 'facet:throughMiddleNode',
  title: {
    en: 'Shorter through the middle?',
    ko: '가운데를 거치면 짧아지는가',
  },
  description: {
    en: 'The one question a shortest-path table keeps asking, pair after pair.',
    ko: '최단 거리표가 짝마다 되풀이해 던지는 물음 하나.',
  },
  algorithm: 'module:throughMiddleNode',
  projector: 'module:throughMiddleNodeProjector',
  initialData: {
    type: 'through-middle-node',
    nodes: ['A', 'B', 'C', 'D'],
    edges: [
      { from: 'A', to: 'B', weight: 9 },
      { from: 'A', to: 'C', weight: 2 },
      { from: 'C', to: 'B', weight: 3 },
      { from: 'B', to: 'D', weight: 1 },
      { from: 'C', to: 'D', weight: 8 },
      { from: 'B', to: 'C', weight: 7 },
    ],
    stepMs: 900,
  },
  blocks: {
    stage: { type: 'through-middle-node-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.roads': {
      en: '{count} one-way roads to begin with.',
      ko: '한쪽으로만 난 길 {count} 갈래로 시작한다.',
    },
    'caption.middle': {
      en: 'Now {middle} stands in the middle.',
      ko: '이제 {middle} 를 가운데 세운다.',
    },
    'caption.question': {
      en: '{from}→{to}: shorter through {middle}?',
      ko: '{from}→{to}, {middle} 를 거치면 짧아지는가?',
    },
    'caption.noWayIn': {
      en: 'No road from {from} to {middle}.',
      ko: '{from} 에서 {middle} 로 가는 길이 없다.',
    },
    'caption.noWayOut': {
      en: 'No road from {middle} to {to}.',
      ko: '{middle} 에서 {to} 로 나가는 길이 없다.',
    },
    'caption.notShorter': {
      en: 'The detour is {sum} — longer than the {current} already known. Leave it.',
      ko: '거쳐 가면 {sum}. 이미 아는 {current} 보다 멀다. 그대로 둔다.',
    },
    'caption.shorter': {
      en: 'Shorter. {from}→{to} drops from {current} to {sum}.',
      ko: '짧아진다. {from}→{to} 의 거리: {current} → {sum}.',
    },
    'caption.opened': {
      en: 'A road appears. {from}→{to} = {sum}.',
      ko: '없던 길이 생긴다. {from}→{to} = {sum}.',
    },
    'caption.done': {
      en: '{asked} questions asked. Only {improved} said yes.',
      ko: '물음 {asked} 번. 그중 {improved} 번만 그렇다.',
    },
    'label.ledger': {
      en: 'questions asked',
      ko: '물은 자리',
    },
  },
};
