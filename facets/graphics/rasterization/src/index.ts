/**
 * rasterization — 서로 파고든 두 삼각형을 칸마다 가린다 (깊이 버퍼 · 화가 알고리즘).
 * 손잡이가 있어 mechanismKind 는 reactive 다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { rasterizationAlgorithm, type RasterizationData } from './algorithm.js';
import { rasterizationProjector } from './projector.js';
import { rasterizationIRs } from './irs.js';
import { rasterizationStageView } from './rasterization-stage.js';
import { rasterizationFacet } from './facet.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './rasterization-stage.js';
export * from './facet.js';

export function registerRasterization(): void {
  registerAlgorithm<RasterizationData>('rasterization', rasterizationAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('rasterizationProjector', rasterizationProjector);
  for (const ir of rasterizationIRs) registerIR(ir.id, ir);
  registerView('rasterization-stage', rasterizationStageView);
  registerFacets([rasterizationFacet]);
}
