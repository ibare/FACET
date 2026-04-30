/**
 * 선형 회귀 facet JSON 선언.
 *
 * 진행 모델: 시간 진행형 (mount 직후 자동 시연 한 호흡 — 수렴 또는 발산까지).
 * ReactiveMechanism 위에 자동 시연 + pollInput 인터럽트 패턴.
 *
 * 컨트롤바 어휘 (기획 §6 §8):
 *   [ ▶ play ] [ ⏸ pause ] [ ⏭ step ] [ ↺ reset ]
 *   [ 학습률 segmented-slider: 느림 / 적정 / 발산 ]
 *
 * 식별자 (C1): `point:` `line:` `square:` `param:` `loss:` `flag:` 명시 prefix.
 *
 * 기획서의 14점 데이터는 y = 1.8x + 0.5 + 잡음(σ ≈ 0.6) 의 고정 시드.
 * 여기서는 결정적 14점 (시드 hash 없이 직접 명시).
 */

import type { FacetJson } from '@facet/core/runtime';

// 고정 시드 14점 — y ≈ 1.8x + 0.5 + 가우시안 잡음. 잡음은 결정적 값.
const POINTS_14: Array<{ x: number; y: number }> = [
  { x: 0.30, y: 0.78 },
  { x: 0.55, y: 1.62 },
  { x: 0.85, y: 1.40 },
  { x: 1.10, y: 2.78 },
  { x: 1.40, y: 2.55 },
  { x: 1.75, y: 3.95 },
  { x: 2.05, y: 4.10 },
  { x: 2.40, y: 5.30 },
  { x: 2.70, y: 4.85 },
  { x: 3.05, y: 6.40 },
  { x: 3.40, y: 6.10 },
  { x: 3.70, y: 7.55 },
  { x: 4.05, y: 7.20 },
  { x: 4.45, y: 8.85 },
];

export const linearRegressionFacet: FacetJson = {
  id: 'facet:linearRegression',
  title: { en: 'Linear Regression — A Line Through the Points', ko: '선형 회귀 — 점들 사이를 가르는 직선' },
  description: {
    en: 'Fit a line by sliding (w, b) downhill — residual squares shrink as a point rolls into the valley',
    ko: '잔차 정사각형의 면적을 줄이며 매개변수 평면 위 점이 골짜기로 굴러가는 학습 운동',
  },
  algorithm: 'module:linearRegression',
  projector: 'module:linearRegressionProjector',
  initialData: {
    type: 'linear-regression',
    points: POINTS_14,
    initialW: -0.5,
    initialB: 3.0,
    lrSegments: [
      { value: 0.01, id: 'slow' },
      { value: 0.05, id: 'tuned' },
      { value: 0.18, id: 'diverge' },
    ],
    initialLrIndex: 1,
    timings: {
      autoStepIntervalMs: 200,
      stepDurationMs: 350,
      divergePulseMs: 420,
    },
    convergenceEpsilon: 0.005,
    maxAutoSteps: 200,
    contourLevels: 6,
    paramRange: [-1.5, 3.5, -1, 4],
  },
  shuffleOnReset: false,
  layout: {
    type: 'column',
    gap: 8,
    children: [
      { ref: 'header' },
      { ref: 'stage', padding: '8px 0' },
      { ref: 'controls' },
    ],
  },
  blocks: {
    header: { type: 'title-block' },
    stage: { type: 'linear-regression-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        { widget: 'button', action: 'play', label: { en: '▶ Play', ko: '▶ 재생' } },
        { widget: 'button', action: 'pause', label: { en: '⏸ Pause', ko: '⏸ 일시정지' } },
        { widget: 'button', action: 'step', label: { en: '⏭ Step', ko: '⏭ 한 스텝' } },
        { widget: 'button', action: 'reset', label: { en: '↺ Reset', ko: '↺ 리셋' } },
        {
          widget: 'segmented-slider',
          action: 'lr',
          name: 'lr',
          label: { en: 'Learning rate', ko: '학습률' },
          segments: [
            { value: 0.01, label: { en: 'Slow', ko: '느림' } },
            { value: 0.05, label: { en: 'Tuned', ko: '적정' }, default: true },
            { value: 0.18, label: { en: 'Diverge', ko: '발산' } },
          ],
        },
      ],
    },
  },
};
