/**
 * @piece — 방문 표시 조각.
 *
 * 답하는 질문 하나: **다녀간 자리에 표시를 남기지 않으면 어떻게 되는가.**
 *
 * 블록은 둘뿐이라 `layout` 을 적지 않는다 — 러너가 `column · gap 8 · blocks 키
 * 순서` 로 만든다. 제목 블록도, 메트릭도 두지 않는다 (S-piece).
 *
 * 자료는 구조만 적는다. 걸음 수 · 닿은 자리 수 · 닿지 못한 자리는 알고리즘이
 * 이 구조에서 셈해 화면으로 보낸다 — 적어 둔 수를 화면이 되뇌지 않는다.
 *
 * `adjacency` 의 배열 순서가 곧 "이웃을 보는 순서" 다. C 의 첫 칸이 A 이기
 * 때문에 표시가 없으면 A→B→C 를 되풀이하고, 표시가 있으면 그 A 를 건너뛰어
 * D 로 나간다. 순서를 바꾸면 조각의 주장이 성립하지 않는다.
 *
 * `shuffleOnReset` 을 켜지 않는다 — 섞는 순간 그 순서가 무너진다.
 *
 * 식별자 (C1): `node:<id>`.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

export const markVisitedOrLoopFacet: FacetJson = {
  id: 'facet:markVisitedOrLoop',
  title: {
    en: 'Marking Visited',
    ko: '방문 표시',
  },
  description: {
    en: 'Without a mark on the places already seen, the walk circles the same three forever.',
    ko: '다녀간 자리에 표시를 남기지 않으면 탐색이 같은 세 자리를 영영 맴돈다',
  },
  algorithm: 'module:markVisitedOrLoop',
  projector: 'module:markVisitedOrLoopProjector',
  initialData: {
    type: 'graph-walk',
    nodes: ['A', 'B', 'C', 'D'],
    // 무방향 간선 넷 (A–B · B–C · C–A · C–D) 이 이 목록에 그대로 들어 있다.
    // 이웃을 보는 순서는 저작 결정이다.
    adjacency: {
      A: ['B'],
      B: ['C'],
      C: ['A', 'D'],
      D: ['C'],
    },
    start: 'A',
    // 표시 없는 회차를 끊는 자리. 열두 걸음이면 같은 고리를 네 바퀴 돈다 —
    // 되풀이라는 것을 알아보기에 충분하고, 지루해지기 전이다.
    maxSteps: 12,
    stepMs: 650,
  },
  blocks: {
    stage: { type: 'mark-visited-or-loop-stage' },
    controls: {
      type: 'control-bar',
      // 다시 보기 · 한 걸음. 둘 다 눌러야 완성되는 조작이 아니다 (S-piece).
      controls: CONTROL_SET.piece,
    },
  },
  messages: {
    'caption.noMarks': {
      en: 'No marks. From each place, take the first neighbor.',
      ko: '표시가 없다. 자리마다 이웃 목록의 첫 칸으로 간다',
    },
    'caption.stillInside': {
      en: '{steps} steps, only {reached} places. {missed} was never reached.',
      ko: '{steps} 걸음, 밟은 자리는 {reached} 곳뿐. {missed} 에는 끝내 닿지 못했다',
    },
    'caption.marksOn': {
      en: 'Now every place visited leaves a mark.',
      ko: '이제 다녀간 자리마다 표시를 남긴다',
    },
    'caption.alreadyMarked': {
      en: '{to} already carries a mark — skip it.',
      ko: '{to} 에는 이미 표시가 있다 — 건너뛴다',
    },
    'caption.wentOut': {
      en: '{steps} steps, all {reached} places. The walk went outside.',
      ko: '{steps} 걸음, 자리 {reached} 곳 모두. 고리 바깥으로 나갔다',
    },
  },
};
