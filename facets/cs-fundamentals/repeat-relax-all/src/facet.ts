/**
 * @piece 모든 간선을 거듭 펴기 — 왜 바퀴가 여러 번 필요한가.
 *
 * 답하는 질문: 어느 간선을 먼저 볼지 모르는데, 왜 전부를 정점 수만큼 되풀이해야
 * 하는가. 간선을 보는 순서가 거꾸로 놓이면 한 바퀴에 정보가 딱 한 칸만 나아가고,
 * 나머지 살핌은 헛돈다. 그 헛수고가 보여야 "정점 수 빼기 하나" 가 넉넉히 잡은
 * 수가 아니라 필요한 수로 읽힌다.
 *
 * `edges` 의 배열 순서가 곧 간선을 펴는 순서다 — 저작이 고른 최악에 가까운
 * 순서이며, 그 전제는 `description.ts` 가 밝힌다.
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const repeatRelaxAllFacet: FacetJson = {
  id: 'facet:repeatRelaxAll',
  title: {
    en: 'Sweeping every edge, round after round',
    ko: '모든 간선을 거듭 펴기',
  },
  description: {
    en: 'Why one sweep is not enough: the front advances by exactly one node per round.',
    ko: '한 바퀴로 끝나지 않는 까닭 — 한 바퀴에 정보가 딱 한 칸만 나아간다.',
  },
  algorithm: 'module:repeatRelaxAll',
  projector: 'module:repeatRelaxAllProjector',
  initialData: {
    type: 'repeat-relax-all',
    nodes: ['S', 'A', 'B', 'C', 'D'],
    // 간선을 펴는 순서. 사슬의 진행 방향과 정반대로 놓았다 — 이 순서가
    // 한 바퀴에 한 칸씩만 나아가게 만드는 장본인이다.
    edges: [
      { from: 'C', to: 'D', weight: 1 },
      { from: 'B', to: 'C', weight: 1 },
      { from: 'A', to: 'B', weight: 1 },
      { from: 'S', to: 'A', weight: 1 },
    ],
    source: 'S',
    // 읽을 것이 있는 걸음의 간격.
    stepMs: 700,
    // 헛도는 걸음의 간격. 아무 일도 없는 장면이라 읽을 시간이 덜 들고,
    // 빨리 지나가는 것 자체가 "헛수고" 로 읽힌다.
    idleStepMs: 380,
  },
  blocks: {
    stage: { type: 'repeat-relax-all-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.rounds': { en: 'rounds', ko: '바퀴' },
    'caption.start': {
      en: 'Only {source} has a distance. Every other node is unknown.',
      ko: '{source}만 거리를 안다. 나머지는 아직 모르는 값이다.',
    },
    'caption.skipUnknown': {
      en: '{edge}: {from} is still unknown, so nothing happens.',
      ko: '{edge} — {from}를 아직 몰라 아무 일도 일어나지 않는다.',
    },
    'caption.skipNoGain': {
      en: '{edge}: no shorter route, so nothing happens.',
      ko: '{edge} — 더 짧아지지 않아 아무 일도 일어나지 않는다.',
    },
    'caption.apply': {
      en: '{edge}: {to} becomes {dist}. The front moved one node.',
      ko: '{edge} — {to} 의 거리는 {dist}. 이 바퀴가 한 칸 밀어냈다.',
    },
    'caption.roundEnd': {
      en: 'Round {round}: {applied} of {scans} scans did something.',
      ko: '{round}바퀴 끝 — {scans} 번 살펴 {applied} 번만 일이 됐다.',
    },
    'caption.done': {
      en: '{rounds} rounds for {nodes} nodes: the front moves one node per round, so only {applied} of {scans} scans mattered.',
      ko: '한 바퀴에 한 칸씩만 번지니 정점 {nodes} 개에 {rounds} 바퀴가 든다. 모두 {scans} 번 살펴 {applied} 번만 일이 됐다.',
    },
  },
};
