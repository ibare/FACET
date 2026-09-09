/**
 * 서로 오갈 수 있는 무리 — 조각.
 *
 * @piece
 *
 * 답하는 질문: **한쪽으로만 갈 수 있는 사이도 한 무리인가?**
 *
 * 아니다. 오갈 수 있어야 한 무리다. 그것을 화면에서 확인시키려고 두 정점을 짚어
 * 한쪽으로 가 보고 반대쪽으로도 가 본 뒤에 판정한다. 갈린 자리는 그 판정의
 * 결과이지 미리 칠해 둔 색이 아니다.
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const mutuallyReachableFacet: FacetJson = {
  id: 'facet:mutuallyReachable',
  title: {
    en: 'Mutually reachable',
    ko: '서로 오갈 수 있는 무리',
  },
  description: {
    en: 'One-way is not enough. A group holds only when travel works both ways.',
    ko: '한쪽으로만 갈 수 있으면 한 무리가 아니다 — 오갈 수 있어야 한 무리다.',
  },
  algorithm: 'module:mutuallyReachable',
  projector: 'module:mutuallyReachableProjector',

  initialData: {
    type: 'mutually-reachable',
    nodes: ['a', 'b', 'c', 'd', 'e'],
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'a' },
      { from: 'c', to: 'd' },
      { from: 'd', to: 'e' },
      { from: 'e', to: 'd' },
    ],
    stepMs: 850,
  },

  blocks: {
    stage: { type: 'mutually-reachable-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },

  messages: {
    'caption.intro': {
      en: 'Pick two vertices and ask: can each one reach the other?',
      ko: '두 정점을 짚어 서로에게 갈 수 있는지 묻는다.',
    },
    'caption.ask': {
      en: 'Take {u} and {v}.',
      ko: '{u} 와 {v} 를 짚는다.',
    },
    'caption.reached': {
      en: '{from} to {to}: there is a way, and this is it.',
      ko: '{from} 에서 {to} 로 가는 길이 있다. 이 길이다.',
    },
    'caption.blocked': {
      en: 'No way from {from} to {to}. From {from} you only ever reach {region}.',
      ko: '{from} 에서 {to} 로 갈 길이 없다. {from} 가 닿는 곳은 {region} 뿐이다.',
    },
    'caption.mutual': {
      en: 'Both ways work, so {u} and {v} belong together.',
      ko: '양쪽 다 통한다. {u} 와 {v} 는 한 무리다.',
    },
    'caption.oneWay': {
      en: 'Only one way, so {u} and {v} are not one group.',
      ko: '한 방향뿐이다. {u} 와 {v} 는 한 무리가 아니다.',
    },
    'caption.settled': {
      en: '{members} form one group of {count}.',
      ko: '{members} 는 {count} 짜리 한 무리다.',
    },
    'caption.split': {
      en: '{groupCount} groups. Links between them: {bridgeCount}, one way only: {oneWayCount}. Cross and there is no way back.',
      ko: '무리는 {groupCount} 개. 사이를 잇는 간선은 {bridgeCount} 개이고 그중 {oneWayCount} 개가 한 방향뿐이라, 건너가면 돌아올 길이 없다.',
    },
  },
};
