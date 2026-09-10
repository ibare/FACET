/**
 * @piece 덴드로그램 절단 — 나무를 다 만들어 놓고, 무리 수는 어떻게 정하는가.
 *
 * 가로선 하나가 나무를 가로질러 위아래로 옮겨 다닌다. 그 선이 지나는 세로
 * 가지의 수가 곧 무리 수다. 자르는 일에는 셈이 없다 — 높이 하나를 고르는
 * 것뿐이고, 고르는 것은 사람이다.
 *
 * `initialData` 에는 구조만 둔다 — 잎이 될 점 여덟과 걸음 간격. 나무의 모양도
 * 자를 높이도 알고리즘이 좌표에서 셈하고, 화면의 자리는 무대가 캔버스에서
 * 역산한다 (S-piece).
 */

import { CONTROL_SET } from '@ffacet/core/runtime';
import type { FacetJson } from '@ffacet/core/runtime';

export const dendrogramCutFacet: FacetJson = {
  id: 'facet:dendrogramCut',
  title: { en: 'Cutting the dendrogram', ko: '덴드로그램 절단' },
  description: {
    en: 'Where you cut the tree is what decides how many clusters you get.',
    ko: '어디서 자르느냐로 무리 수가 정해진다.',
  },
  algorithm: 'module:dendrogramCut',
  projector: 'module:dendrogramCutProjector',
  initialData: {
    type: 'dendrogram-cut',
    points: [
      { id: 'a', x: 0.0, y: 0.0 },
      { id: 'b', x: 0.5, y: 0.0 },
      { id: 'c', x: 0.0, y: 2.0 },
      { id: 'd', x: 0.62, y: 2.0 },
      { id: 'e', x: 5.0, y: 0.0 },
      { id: 'f', x: 5.74, y: 0.0 },
      { id: 'g', x: 5.0, y: 2.4 },
      { id: 'h', x: 5.86, y: 2.4 },
    ],
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'dendrogram-cut-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.grown': {
      en: 'The tree is already fully grown.',
      ko: '나무는 이미 다 자라 있다.',
    },
    'caption.cut': {
      en: 'Cut height {h} — clusters {n}',
      ko: '자른 높이 {h} · 무리 {n}',
    },
    'caption.bands': {
      en: 'Wide empty bands between the crossbars: {n}',
      ko: '가로대 사이가 넓게 빈 구간: {n}',
    },
    'caption.settled': {
      en: 'Cut inside a wide band — clusters {n}',
      ko: '넓은 구간 안에서 끊었다. 무리 {n}',
    },
    'caption.done': {
      en: 'The tree does not choose. A person does.',
      ko: '나무는 고르지 않는다. 고르는 것은 사람이다.',
    },
    'label.height': { en: 'height', ko: '높이' },
    'label.clusters': { en: 'clusters', ko: '무리' },
  },
};
