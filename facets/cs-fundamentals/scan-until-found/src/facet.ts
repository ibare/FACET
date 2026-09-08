/**
 * scanUntilFound facet 선언.
 *
 * @piece 조각(piece) — "찾으면 멎지만, 없다고 답하려면 끝까지 봐야 한다" 하나에만
 * 답한다. 머리글도 메트릭도 두지 않고, 배치는 러너가 정한다 (S-piece).
 *
 * 데이터는 줄이 서 있지 않은 [5, 8, 2, 9, 4] 한 벌과 찾을 값 둘 뿐이다.
 * 화면에 뜨는 수 — 본 칸 수 4 와 5 — 는 여기 적지 않는다. 훑기가 실제로 세고
 * 그 값이 그대로 올라온다 (S-piece).
 */

import { CONTROL, type FacetJson } from '@ffacet/core/runtime';

export const scanUntilFoundFacet: FacetJson = {
  id: 'facet:scanUntilFound',
  // 변별어를 지지 않는 사람이 부르는 이름. 주장은 description 이 진다 (C4).
  title: { en: 'Linear Search', ko: '순차 탐색' },
  description: {
    en: 'The same gaze crosses the same row twice — once it stops early, once it runs off the end.',
    ko: '같은 눈길이 같은 줄을 두 번 지나간다 — 한 번은 도중에 멎고, 한 번은 끝을 지나 빠져나간다.',
  },
  algorithm: 'module:scanUntilFound',
  projector: 'module:scanUntilFoundProjector',
  initialData: {
    type: 'scan-until-found',
    values: [5, 8, 2, 9, 4],
    queries: [9, 6],
    stepMs: 650,
  },
  blocks: {
    stage: { type: 'scan-until-found-stage' },
    controls: {
      type: 'control-bar',
      controls: [CONTROL.replay, CONTROL.advance],
    },
  },
  messages: {
    'caption.looking': {
      en: 'Looking for {target}.',
      ko: '찾는 값 {target}.',
    },
    'caption.found': {
      en: 'Found it. {seen} cells looked at, then it stopped.',
      ko: '찾았다. {seen} 칸을 보고 멎었다.',
    },
    'caption.overrun': {
      en: 'Off the end. Saying "not here" took all {seen} — there was no place to give up.',
      ko: '끝을 지나쳤다. 없다고 답하려면 {seen} 칸을 다 봐야 했다.',
    },
    'caption.gap': {
      en: 'Stopping cost {stopped}. Answering "no" cost {exhausted}.',
      ko: '멎을 때는 {stopped} 칸, 없다고 답할 때는 {exhausted} 칸.',
    },
  },
};
