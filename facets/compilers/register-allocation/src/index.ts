/**
 * register-allocation — 등록 진입점. 호스트가 `registerRegisterAllocation()` 을 부른다 (스스로 부르지 않는다).
 *
 * TS 이름은 `regAlloc*` 로 둔다 — facet id 의 camel 이 `registerAllocation` 이라 계약 이름(`registerAllocationAlgorithm` …)을
 * 그대로 쓰면 `register` 로 시작하는 함수 export 가 여럿이 되어 전수 검사가 인자 없이 부른다. 등록 이름(글자)은 계약 그대로다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { regAllocAlgorithm, type RegAllocData } from './algorithm.js';
import { regAllocProjector } from './projector.js';
import { regAllocIRs } from './irs.js';
import { regAllocStageView } from './register-allocation-stage.js';
import { regAllocFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './register-allocation-stage.js';
export * from './facet.js';

export function registerRegisterAllocation(): void {
  registerAlgorithm<RegAllocData>('registerAllocation', regAllocAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('registerAllocationProjector', regAllocProjector);
  for (const ir of regAllocIRs) registerIR(ir.id, ir);
  registerView('register-allocation-stage', regAllocStageView);
  registerFacets([regAllocFacet]);
}
