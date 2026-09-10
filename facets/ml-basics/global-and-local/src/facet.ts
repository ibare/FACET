/**
 * 전역과 지역 구조 조각 facet JSON 선언.
 *
 * @piece — 질문 하나에 답하고 멈추는 조각 (S-piece).
 *
 * 질문: 편 그림에서 무리 사이가 가까워 보이면 정말 가까운 것인가.
 *
 * 선언이 담는 것은 구조뿐이다 — 세 무리의 좌표와 펴는 법(무리 폭 · 무리 사이
 * 틈). 주성분 축도 · 무리 가운데도 · 사이의 몫도 여기 없다. 전부 파생값이라
 * algorithm 이 좌표에서 셈하고, 자 위의 자리는 stage 가 캔버스에서 역산한다.
 */

import type { FacetJson } from '@ffacet/core/runtime';
import { CONTROL_SET } from '@ffacet/core/runtime';

/**
 * 세 무리, 각 넷.
 *
 * A 와 B 는 가깝고 C 는 멀리 떨어져 있다. 그 "멀다" 가 편 뒤에도 남는지가
 * 이 조각이 묻는 것이다.
 */
const GROUPS: ReadonlyArray<{
  name: string;
  points: ReadonlyArray<{ id: string; x: number; y: number }>;
}> = [
  {
    name: 'A',
    points: [
      { id: 'a1', x: 1.0, y: 1.0 },
      { id: 'a2', x: 1.6, y: 1.4 },
      { id: 'a3', x: 1.2, y: 1.9 },
      { id: 'a4', x: 1.9, y: 0.9 },
    ],
  },
  {
    name: 'B',
    points: [
      { id: 'b1', x: 4.0, y: 1.2 },
      { id: 'b2', x: 4.7, y: 1.6 },
      { id: 'b3', x: 4.2, y: 2.1 },
      { id: 'b4', x: 4.9, y: 1.0 },
    ],
  },
  {
    name: 'C',
    points: [
      { id: 'c1', x: 13.0, y: 1.1 },
      { id: 'c2', x: 13.7, y: 1.5 },
      { id: 'c3', x: 13.2, y: 2.0 },
      { id: 'c4', x: 13.9, y: 0.9 },
    ],
  },
];

export const globalAndLocalFacet: FacetJson = {
  id: 'facet:globalAndLocal',
  title: {
    en: 'Global and local — two flattenings, side by side',
    ko: '전역과 지역 — 두 가지로 펴서 나란히',
  },
  description: {
    en: 'Cluster gaps that look equal may not be equal at all',
    ko: '고르게 벌어져 보이는 무리 사이가 정말 고른 것은 아니다',
  },
  algorithm: 'module:globalAndLocal',
  projector: 'module:globalAndLocalProjector',
  initialData: {
    type: 'global-and-local',
    groups: GROUPS.map((g) => ({ name: g.name, points: g.points.map((p) => ({ ...p })) })),
    local: { clusterSpan: 4, clusterGap: 3 },
    stepMs: 850,
  },
  blocks: {
    stage: { type: 'global-and-local-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'label.global': {
      en: 'Keeps the long distances — projected onto the widest direction',
      ko: '큰 거리를 지킨다 — 가장 넓게 퍼진 방향에 내려 찍기',
    },
    'label.local': {
      en: 'Keeps only the neighbours — order inside a cluster, clusters evenly spaced',
      ko: '이웃만 지킨다 — 무리 안의 차례만 지키고 고르게 늘어놓기',
    },
    'label.ratio': {
      en: 'gap ratio 1 : {r}',
      ko: '무리 사이의 비 1 : {r}',
    },
    'caption.rulers': {
      en: 'The same data, flattened two ways. Two rulers side by side, with the end clusters pinned to the same spots on both.',
      ko: '같은 자료를 두 가지로 편다. 자 둘을 나란히 놓고, 양 끝 무리를 두 자에서 같은 자리에 맞춘다.',
    },
    'caption.spreadGlobal': {
      en: 'Top ruler — every point drops onto the widest direction. The long distances survive.',
      ko: '위 자 — 가장 넓게 퍼진 방향에 하나씩 내려 찍는다. 먼 거리가 그대로 남는다.',
    },
    'caption.spreadLocal': {
      en: 'Bottom ruler — only the order inside each cluster is kept, and the clusters are laid out at equal steps.',
      ko: '아래 자 — 무리 안의 차례만 지키고, 무리끼리는 같은 간격으로 늘어놓는다.',
    },
    'caption.tie': {
      en: 'Tie the same items together. Both ends are pinned, so what is left is the middle — it slid by {shift}.',
      ko: '같은 자리끼리 잇는다. 양 끝은 맞춰 두었으니 남는 것은 가운데다. 밀린 폭: {shift}.',
    },
    'caption.inside': {
      en: 'Look inside a cluster — the room one cluster gets is {g} on top and {l} below. Below, the four are readable.',
      ko: '무리 안을 본다. 무리 하나가 차지하는 몫은 위 {g}, 아래 {l}. 아래에서는 넷이 보인다.',
    },
    'caption.gap': {
      en: 'Now the gap between clusters — {from}–{to}. Originally {o} of the whole, top {g}, bottom {l}.',
      ko: '이번에는 무리 사이 — {from}–{to}. 원래는 전체의 {o}, 위 {g}, 아래 {l}.',
    },
    'caption.ratio': {
      en: 'Second gap over first — originally 1 : {o}, top 1 : {g}, bottom 1 : {l}.',
      ko: '뒤 사이를 앞 사이로 나눈 값 — 원래 1 : {o}, 위 1 : {g}, 아래 1 : {l}.',
    },
    'caption.verdict': {
      en: 'Three times apart became the same. Do not read cluster-to-cluster distance off the bottom ruler.',
      ko: '세 배였던 것이 같아졌다. 아래 자에서 무리 사이 거리를 읽으면 안 된다.',
    },
    'caption.done': {
      en: 'Looking close and being close are not the same thing.',
      ko: '가까워 보이는 것과 가까운 것은 다르다.',
    },
  },
};
