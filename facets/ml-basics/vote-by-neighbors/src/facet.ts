/**
 * @piece 최근접 이웃 투표 — 이름표 없는 새 점의 부류를 어떻게 정하는가.
 *
 * 가까운 순으로 다섯이 하나씩 불려 나와 자기 쪽에 표를 놓는다. 나머지는 아무
 * 말도 하지 못한다 — 멀다는 이유 하나로. 답은 표를 더 많이 받은 쪽이다.
 *
 * 선언에 두는 것은 구조뿐이다 — 점의 좌표와 이름표, 부를 수 k, 걸음 간격.
 * 거리 · 순위 · 표 수 · 승자는 algorithm 이 좌표에서 셈하고, 화면의 자리는
 * stage 가 캔버스에서 역산한다 (S-piece).
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const voteByNeighborsFacet: FacetJson = {
  id: 'facet:voteByNeighbors',
  title: {
    en: 'Vote by neighbors',
    ko: '최근접 이웃 투표',
  },
  description: {
    en: 'The five nearest neighbors are called out one by one and each drops a vote.',
    ko: '가까운 다섯이 하나씩 불려 나와 각자 자기 쪽에 표를 놓는다.',
  },
  algorithm: 'module:voteByNeighbors',
  projector: 'module:voteByNeighborsProjector',
  initialData: {
    type: 'vote-by-neighbors',
    query: { x: 4, y: 4 },
    points: [
      { x: 2.9, y: 4.2, label: 'A' },
      { x: 4.1, y: 2.55, label: 'A' },
      { x: 1.2, y: 1.4, label: 'A' },
      { x: 1.6, y: 6.6, label: 'A' },
      { x: 6.9, y: 6.8, label: 'A' },
      { x: 4.8, y: 4.3, label: 'B' },
      { x: 3.4, y: 3.2, label: 'B' },
      { x: 4.5, y: 5.2, label: 'B' },
      { x: 6.7, y: 1.3, label: 'B' },
    ],
    k: 5,
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'vote-by-neighbors-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.seats': { en: 'Neighbors', ko: '이웃' },
    'label.votes': { en: 'Ballot boxes', ko: '표 상자' },

    'caption.arrive': {
      en: 'A new point arrives with no label of its own.',
      ko: '이름표 없는 점 하나가 들어왔다.',
    },
    'caption.ranked': {
      en: 'Every neighbor is measured and lined up, nearest first.',
      ko: '이웃까지의 거리를 재어 가까운 순으로 줄 세운다.',
    },
    'caption.call': {
      en: 'Neighbor #{rank} is called out and drops a vote into box {label}.',
      ko: '{rank}번째로 가까운 이웃이 불려 나와 {label} 상자에 표를 넣는다.',
    },
    'caption.silenced': {
      en: 'The rest cast nothing — for being far, and nothing else.',
      ko: '남은 이웃은 표를 내지 못한다 — 멀다는 이유 하나로.',
    },
    'caption.verdict': {
      en: 'Box {winner} holds more votes. The new point is labeled {winner}.',
      ko: '표가 더 많은 쪽은 {winner}. 새 점의 이름표가 된다.',
    },
  },
};
