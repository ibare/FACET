/**
 * splitByQuestion — 분기 기준. 어떤 질문이 좋은 질문인가.
 *
 * 자름선이 한 축 위를 미끄러져 봐야 양쪽이 늘 반반이고, 축을 갈아 세우면 첫
 * 자리에서 한 번에 갈린다. 좋은 질문은 자리를 잘 고른 질문이 아니라 축을 잘
 * 고른 질문이다.
 *
 * @piece
 */

import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const splitByQuestionFacet: FacetJson = {
  id: 'facet:splitByQuestion',
  title: {
    en: 'What makes a good question',
    ko: '어떤 질문이 좋은 질문인가',
  },
  description: {
    en: 'A cut line slides along one axis and never separates the labels. Turn it onto the other axis and the first position splits them clean.',
    ko: '자름선이 한 축을 따라 옮겨 다녀도 이름표가 갈리지 않는다. 축을 갈아 세우면 첫 자리에서 갈린다.',
  },
  algorithm: 'module:splitByQuestion',
  projector: 'module:splitByQuestionProjector',
  initialData: {
    type: 'split-by-question',
    points: [
      { x: 1, y: 1, label: 'A' },
      { x: 2, y: 1.5, label: 'A' },
      { x: 3, y: 1, label: 'A' },
      { x: 4, y: 1.5, label: 'A' },
      { x: 5, y: 1, label: 'A' },
      { x: 1, y: 4, label: 'B' },
      { x: 2, y: 4.5, label: 'B' },
      { x: 3, y: 4, label: 'B' },
      { x: 4, y: 4.5, label: 'B' },
      { x: 5, y: 4, label: 'B' },
    ],
    classes: ['A', 'B'],
    xCuts: [1.5, 2.5, 3.5, 4.5],
    yCuts: [2.5],
    stepMs: 800,
  },
  blocks: {
    stage: { type: 'split-by-question-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.start': {
      en: 'Every point carries a label. A sits low, B sits high.',
      ko: '점마다 이름표가 붙어 있다. 아래쪽이 A, 위쪽이 B.',
    },
    'caption.axisX': {
      en: 'Stand one cut line on the horizontal axis.',
      ko: '가로축 위에 자름선 하나를 세운다.',
    },
    'caption.mixed': {
      en: 'Cut at {t}. Each side is still half A, half B.',
      ko: '자름선의 자리: {t}. 양쪽 다 절반은 A, 절반은 B.',
    },
    'caption.exhausted': {
      en: 'Positions tried on this axis: {n}. Sliding never separates them.',
      ko: '이 축에서 옮겨 본 자리: {n}. 미끄러뜨려서는 갈리지 않는다.',
    },
    'caption.axisY': {
      en: 'Turn the cut line over onto the vertical axis.',
      ko: '자름선을 세로축으로 갈아 세운다.',
    },
    'caption.pure': {
      en: 'Cut at {t}. One side is all A, the other all B.',
      ko: '자름선의 자리: {t}. 한쪽은 A 뿐, 다른 쪽은 B 뿐.',
    },
    'caption.done': {
      en: 'What separated them was the axis, not the position.',
      ko: '가른 것은 자리가 아니라 축이다.',
    },
  },
};
