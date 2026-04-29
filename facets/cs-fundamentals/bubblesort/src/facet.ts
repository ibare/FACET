/**
 * BubbleSort facet JSON 선언.
 *
 * 레이아웃은 버블 정렬의 시각적 정체성을 드러내도록 구성:
 *  - 양 끝의 startPreview / goalPreview 가 항상 참조점 제공
 *  - stage 가 rising-marker / sorted-boundary 표시
 *  - passTracker 가 패스 구조를 별도 패널로 노출
 *  - snapshotStrip 이 매 패스 결과를 누적 보존
 */

import type { FacetJson } from '@facet/core/runtime';

export const bubblesortFacet: FacetJson = {
  id: 'facet:bubbleSort',
  title: { en: 'Bubble Sort', ko: '버블 정렬' },
  description: {
    en: 'Adjacent compare/swap waves push the largest value to the end each pass',
    ko: '인접 비교·교환 파도가 매 패스마다 가장 큰 값을 맨 뒤로 떠올린다',
  },
  algorithm: 'module:bubblesort',
  projector: 'module:bubblesortProjector',
  initialData: { type: 'array', values: [5, 2, 8, 1, 9, 3, 7, 4] },
  shuffleOnReset: true,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      {
        type: 'row',
        gap: 8,
        align: 'stretch',
        children: [
          { ref: 'stage', grow: 1 },
          {
            type: 'column',
            gap: 8,
            children: [
              { ref: 'startPreview' },
              { ref: 'goalPreview' },
            ],
          },
        ],
      },
      { ref: 'passTracker' },
      { ref: 'snapshotStrip' },
      { ref: 'controls' },
      { ref: 'codePanel' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    startPreview: {
      type: 'goal-preview',
      title: { en: 'Start', ko: '시작' },
      computeFrom: 'initial',
    },
    stage: {
      type: 'bar-chart',
      height: 220,
      features: ['rising-marker', 'sorted-boundary'],
    },
    goalPreview: {
      type: 'goal-preview',
      title: { en: 'Goal', ko: '목표' },
      computeFrom: 'sorted',
    },
    passTracker: { type: 'pass-tracker', maxPasses: 7 },
    snapshotStrip: { type: 'snapshot-strip', maxSnapshots: 8 },
    controls: {
      type: 'control-bar',
      controls: [{ widget: 'button', action: 'play' }, { widget: 'button', action: 'step' }, { widget: 'button', action: 'pause' }, { widget: 'button', action: 'reset' }, { widget: 'speed-slider', action: 'speed', default: 1 }],
      metrics: [
        { name: 'compare-count', label: { en: 'Compare', ko: '비교' }, initial: 0 },
        { name: 'swap-count', label: { en: 'Swap', ko: '교환' }, initial: 0 },
        { name: 'pass-count', label: { en: 'Pass', ko: '패스' }, initial: 0 },
      ],
    },
    codePanel: {
      type: 'code-view',
      label: { en: 'Code', ko: '코드' },
      ir: 'ir:bubblesort-imperative',
    },
  },
};
