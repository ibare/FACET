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

import type { FacetJson } from '@ffacet/core/runtime';

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
  messages: {
    'caption.base': { en: 'Linear regression threads one straight line through a cloud of points, turning each residual into the area of a square, and nudges the line a step at a time so the total of those areas shrinks.', ko: '선형 회귀는 점 무리에 직선 한 줄을 끼우되, 잔차의 제곱을 면적으로 환원해 그 면적의 합이 가장 작아지도록 직선을 매 반복마다 한 걸음씩 회전·이동시키는 학습 운동이다.' },
    'caption.converged': { en: 'Converged — it will not shrink any further.', ko: '수렴 — 더 줄지 않는다.' },
    'caption.diverged': { en: 'The learning rate is too large — the line diverged.', ko: '학습률이 너무 크다 — 직선이 발산했다.' },
    'caption.lrChanged': { en: 'learning rate → {label} (η = {eta})', ko: '학습률 → {label} (η = {eta})' },
    'concept.line1': { en: 'Linear regression threads one line through a cloud of points,', ko: '선형 회귀는 점 무리에 직선 한 줄을 끼우되, 잔차 제곱을' },
    'concept.line2': { en: 'turning each residual into an area and rotating and shifting the line', ko: '면적으로 환원해 그 면적의 합이 가장 작아지도록 직선을 매' },
    'concept.line3': { en: 'one step per iteration so those areas add up to as little as possible.', ko: '반복마다 한 걸음씩 회전·이동시키는 학습 운동이다.' },
    'label.aria': { en: 'Linear regression visualization — residual squares synchronized one-to-one with the contour map', ko: '선형 회귀 시각화 — 잔차 정사각형과 등고선의 1:1 동기' },
    'label.contour': { en: 'contours: outer = larger, centre = smaller', ko: '등고선: 바깥=큼, 중심=작음' },
    'label.converged': { en: 'converged', ko: '수렴' },
    'label.lossCurve': { en: 'loss curve — RSS over time t', ko: '손실 곡선 — 시간 t 에 따른 RSS' },
    'label.references': { en: 'See also — Setosa · ml-visualized · Google ML Crash Course · angeloyeo', ko: '참고 — Setosa · ml-visualized · Google ML Crash Course · angeloyeo' },
    'label.residualSum': { en: 'residual sum (signed)', ko: '잔차 합 (부호 포함)' },
    'label.rss': { en: 'sum of squared residuals (loss)', ko: '잔차 제곱 합 (손실)' },
    'label.title': { en: 'Linear regression — as the residual areas shrink, the dot rolls down into the valley', ko: '선형 회귀 — 잔차의 면적이 줄어들수록 점이 골짜기를 굴러간다' },
    'lr.diverge': { en: 'diverging', ko: '발산' },
    'lr.good': { en: 'just right', ko: '적정' },
    'lr.slow': { en: 'slow', ko: '느림' },
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
