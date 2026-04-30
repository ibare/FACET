/**
 * @facet/algorithm-2d-matrix-transform — 4-layer 2D 행렬 변환 facet 번들.
 *
 * 입력 반응형 (ReactiveMechanism). mount 직후 1.5초 자동 시연 후 idle 진입.
 * 사용자 입력 (셀 직접 입력 / 화살표 끝 드래그 / 프리셋 토글 / 보조 슬라이더 /
 * 평면 클릭으로 점 추가 / 점 드래그 / × 제거 / 항등 리셋 / 초기화) 을 6 단 동시 운동
 * (셀 → 화살표 → 격자 → 평행사변형 → |det| 게이지 → 보조 점) 으로 1:1 시각 사건 매핑.
 *
 * algorithm / projector / facet JSON / description / 전용 view (matrix-transform-stage)
 * 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은 1차 구현에서 생략.
 */

export {
  matrixTransform,
  type MatrixTransformData,
  type MatrixInputEvent,
  type Matrix2x2,
  type PresetMode,
  type PresetParams,
  type ReflectAxis,
  type HelperPoint,
} from './algorithm.js';
export { matrixTransformProjector } from './projector.js';
export { matrixTransform2dIRs } from './irs.js';
export { matrixTransform2dFacet } from './facet.js';
export { matrixTransform2dDescription } from './description.js';
export { matrixTransformStageView } from './matrix-transform-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { matrixTransform, type MatrixTransformData } from './algorithm.js';
import { matrixTransformProjector } from './projector.js';
import { matrixTransform2dIRs } from './irs.js';
import { matrixTransform2dFacet } from './facet.js';
import { matrixTransform2dDescription } from './description.js';
import { matrixTransformStageView } from './matrix-transform-stage.js';

export function registerMatrixTransform2d(): void {
  registerAlgorithm<MatrixTransformData>('matrixTransform', matrixTransform, {
    mechanismKind: 'reactive',
  });
  registerProjector('matrixTransformProjector', matrixTransformProjector);
  for (const ir of matrixTransform2dIRs) registerIR(ir.id, ir);
  registerView('matrix-transform-stage', matrixTransformStageView);
  registerFacets([matrixTransform2dFacet]);
  registerDescription(matrixTransform2dFacet.id, matrixTransform2dDescription);
}
