/**
 * @ffacet/algorithm-brdf — 반사 모형 (퐁 · PBR)
 *
 * 손잡이(모형 · 광택)가 있어 reactive 로 등록한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { brdfAlgorithm, type BrdfData } from './algorithm.js';
import { brdfProjector } from './projector.js';
import { brdfIRs } from './irs.js';
import { brdfStageView } from './brdf-stage.js';
import { brdfFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './brdf-stage.js';
export * from './facet.js';

export function registerBrdf(): void {
  registerAlgorithm<BrdfData>('brdf', brdfAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('brdfProjector', brdfProjector);
  for (const ir of brdfIRs) registerIR(ir.id, ir);
  registerView('brdf-stage', brdfStageView);
  registerFacets([brdfFacet]);
}
