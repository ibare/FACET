/**
 * @piece — 차원을 하나 줄이면 무엇이 사라지는가.
 *
 * 이미 찾아 놓은 축 하나에 점을 수직으로 내려 찍는다. 떨어진 자리가 남는 것이고
 * 떨어진 거리가 잃는 것이다. 축을 **찾는** 일은 이웃 조각이 말한다 — 여기서는
 * 축을 주어진 것으로 두고, 내려 찍는 순간에 무엇이 사라지는지만 본다.
 */
import { CONTROL_SET, type FacetJson } from '@ffacet/core/runtime';

export const projectAndLoseFacet: FacetJson = {
  id: 'facet:projectAndLose',
  title: { en: 'Project and Lose', ko: '내려 찍고 잃기' },
  description: {
    en: 'What disappears when one dimension is dropped.',
    ko: '차원을 하나 줄이면 무엇이 사라지는가.',
  },
  algorithm: 'module:projectAndLose',
  projector: 'module:projectAndLoseProjector',
  initialData: {
    type: 'project-and-lose',
    /** 점 열둘. [x, y]. */
    points: [
      [1.0, 2.0],
      [2.0, 1.2],
      [2.4, 3.0],
      [3.2, 2.2],
      [3.8, 3.6],
      [4.4, 2.6],
      [5.0, 4.2],
      [5.6, 3.2],
      [2.8, 1.6],
      [4.0, 4.4],
      [1.6, 2.8],
      [5.2, 2.4],
    ],
    /**
     * 내려 찍을 축의 기울기(도). 축은 점들의 무게중심을 지난다 — 그 자리는
     * 알고리즘이 점에서 셈하므로 여기 적지 않는다.
     */
    axisAngleDeg: 24.9,
    stepMs: 750,
  },
  blocks: {
    stage: { type: 'project-and-lose-stage' },
    controls: { type: 'control-bar', controls: CONTROL_SET.piece },
  },
  messages: {
    'caption.axisGiven': {
      en: 'One axis, already found. The points will drop onto it.',
      ko: '이미 찾아 놓은 축 하나. 여기에 점을 내려 찍는다.',
    },
    'caption.drop': {
      en: 'Each point drops onto the axis at a right angle.',
      ko: '점이 축까지 수직으로 내려 찍힌다.',
    },
    'caption.measure': {
      en: 'The drop distance is what is lost — farthest {max}, average {mean}.',
      ko: '떨어진 거리가 잃는 것 — 가장 먼 것 {max}, 평균 {mean}.',
    },
    'caption.erase': {
      en: 'Erase the traces. Only the spots on the axis remain.',
      ko: '흔적을 지운다. 남는 것은 축 위의 자리뿐.',
    },
    'caption.ambiguous': {
      en: 'This spot on the axis looks the same from anywhere along this line.',
      ko: '축 위의 이 자리는 이 선 위 어디에서 와도 똑같다.',
    },
    'caption.done': {
      en: 'So the original spot cannot be pointed back to.',
      ko: '그래서 원래 자리는 되짚을 수 없다.',
    },
    'label.axis': { en: 'axis', ko: '축' },
    'label.kept': { en: 'Kept by the axis {pct}%', ko: '축이 담은 몫 {pct}%' },
    'label.lost': { en: 'Lost {pct}%', ko: '잃은 몫 {pct}%' },
  },
};
