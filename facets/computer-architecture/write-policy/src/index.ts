import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { writePolicyAlgorithm, type WritePolicyData } from './algorithm.js';
import { writePolicyProjector } from './projector.js';
import { writePolicyIRs, writePolicyImperativeIR } from './irs.js';
import { writePolicyStageView } from './write-policy-stage.js';
import { writePolicyFacet } from './facet.js';

export {
  writePolicyAlgorithm,
  writePolicyProjector,
  writePolicyIRs,
  writePolicyImperativeIR,
  writePolicyStageView,
  writePolicyFacet,
};
export type { WritePolicyData };

/**
 * 등록 진입점. 호출 책임은 호스트 앱에 있다 (S-facet).
 *
 * `mechanismKind: 'reactive'` 를 여기서 선언한다. 구간 슬라이더의 `policy` 는
 * 위젯 액션이라 `CoroutineMechanism.supportedControls` 에 없고, 그대로 두면
 * 러너가 마운트 전에 throw 한다.
 */
export function registerWritePolicy(): void {
  registerAlgorithm('writePolicy', writePolicyAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('writePolicyProjector', writePolicyProjector);
  for (const ir of writePolicyIRs) registerIR(ir.id, ir);
  registerView('write-policy-stage', writePolicyStageView);
  registerFacets([writePolicyFacet]);
}
