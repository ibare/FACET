/**
 * @piece 조각 — "남은 거리를 짐작하면 탐색이 어떻게 달라지는가"
 *
 * 답하는 질문 하나: 짐작을 더하면 같은 답에 닿기까지 열어 보는 칸이 얼마나
 * 줄어드는가. 격자 · 출발 · 목표라는 **구조**만 선언하고, 짐작값 · 꺼내는 차례 ·
 * 열어 본 칸의 수는 알고리즘이 셈한다. 그림의 자리는 stage 가 캔버스에서
 * 역산한다 (S-piece).
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const heuristicGuidesFacet: FacetJson = {
  id: 'facet:heuristicGuides',
  title: {
    en: 'A guess steers the search',
    ko: '짐작이 탐색을 이끈다',
  },
  description: {
    en: 'Adding a guess at the remaining distance skews the search toward the goal. The route is the same; the number of opened cells is not.',
    ko: '남은 거리를 짐작해 더하면 탐색이 목표 쪽으로 치우친다. 찾아낸 길은 같고, 열어 본 칸의 수가 갈린다.',
  },
  algorithm: 'module:heuristicGuides',
  projector: 'module:heuristicGuidesProjector',
  initialData: {
    type: 'heuristic-guides',
    cols: 7,
    rows: 5,
    start: { col: 0, row: 2 },
    goal: { col: 6, row: 2 },
    stepMs: 340,
  },
  blocks: {
    stage: { type: 'heuristic-guides-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.begin': {
      en: 'The same grid and the same question: from the dot to the target.',
      ko: '같은 격자, 같은 물음 — 점에서 과녁까지.',
    },
    'caption.spread': {
      en: 'The left spreads evenly; the right leans toward the target.',
      ko: '왼쪽은 사방으로 고르게, 오른쪽은 과녁 쪽으로 뻗는다.',
    },
    'caption.arrived': {
      en: 'The right one is there. The left one is still spreading.',
      ko: '오른쪽은 닿았다. 왼쪽은 아직 번지는 중.',
    },
    'caption.same': {
      en: 'Both routes are equally long. What differs is how many cells were opened.',
      ko: '두 길의 걸음 수는 같다. 갈린 것은 열어 본 칸의 수.',
    },
    'label.plainPanel': { en: 'Without the guess', ko: '짐작 없이' },
    'label.guidedPanel': { en: 'With the guess', ko: '짐작을 더해' },
    'label.opened': { en: 'Opened: {n}', ko: '열어 본 칸: {n}' },
    'label.route': {
      en: 'Route: {n} steps',
      ko: '찾아낸 길 — {n} 걸음',
    },
  },
};
