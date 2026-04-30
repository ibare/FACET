/**
 * 2D 행렬 변환 (graphics 2D matrix transform) facet JSON 선언.
 *
 * 진행 모델: 입력 반응형. ReactiveMechanism + 자동 시연(1.5초) + pollInput 인터럽트.
 * 모든 위젯 상호작용 — 셀 입력 / 화살표 끝 드래그 / 프리셋 토글 / 보조 슬라이더 /
 * 보조 점 클릭 추가 / 점 드래그 / × 제거 — 은 stage view 내부에서 발화하며
 * params.dispatch 단일 경로로 mechanism 에 흘러든다.
 *
 * 컨트롤바 어휘 (기획 §6 §8): [점 추가] [점 제거] [항등으로 리셋] [↺ 초기화].
 *   - point-add / point-remove / identity 는 facet 고유 어휘 (와일드카드 *).
 *   - reset 은 mechanism 표준.
 *
 * 식별자 (C1): `cell:` `arrow:` `grid:` `parallelogram:` `gauge:` `point:` `preset:` 명시 prefix.
 *
 * 파라미터는 기획 §9. 360×360 평면, -3~3 범위, 60px/단위, 자동 시연 12프레임 × 약 125ms,
 * 보조 점 최대 3 개, 초기 보조 점 (1.5, 0.7).
 */

import type { FacetJson } from '@facet/core/runtime';

export const matrixTransform2dFacet: FacetJson = {
  id: 'facet:matrixTransform2d',
  title: {
    en: '2D Matrix Transform — Two Columns, Two Basis Destinations',
    ko: '2D 행렬 변환 — 두 열은 두 기저의 도착지',
  },
  description: {
    en: 'A 2×2 matrix is the destinations of i-hat and j-hat — every point on the plane follows the same (u, v) coefficients into the new basis combination, lines stay lines, and the origin stays put',
    ko: '2×2 행렬은 두 기저 i-hat·j-hat 의 도착지이며, 평면의 모든 점은 같은 (u, v) 계수로 새 기저의 결합을 따라 이동하고, 직선은 직선으로 유지되고 원점은 그 자리에 박힌 채로 평면이 휘어지는 사상',
  },
  algorithm: 'module:matrixTransform',
  projector: 'module:matrixTransformProjector',
  initialData: {
    type: '2d-matrix-transform',
    demoStepMs: 500,
    demoFrames: 12,
    maxPoints: 3,
    initialMatrix: { a: 1, b: 0, c: 0, d: 1 },
    initialPoints: [{ u: 1.5, v: 0.7 }],
    axisMax: 3,
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
    stage: { type: 'matrix-transform-stage' },
    controls: {
      type: 'control-bar',
      controls: [
        { widget: 'button', action: 'point-add', label: { en: '+ Point', ko: '점 추가' } },
        { widget: 'button', action: 'point-remove', label: { en: '− Point', ko: '점 제거' } },
        { widget: 'button', action: 'identity', label: { en: 'Identity', ko: '항등 리셋' } },
        { widget: 'button', action: 'reset', label: { en: '↺ Reset', ko: '↺ 초기화' } },
      ],
    },
  },
};
