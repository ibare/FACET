/**
 * fold-and-sweep — 상수 폴딩과 죽은 코드 제거, 두 패스의 이음.
 * 손잡이(폴딩 · 죽은 코드 제거)가 있어 reactive 로 등록한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { foldAndSweepAlgorithm, type FoldAndSweepData } from './algorithm.js';
import { foldAndSweepFacet } from './facet.js';
import { foldAndSweepIRs } from './irs.js';
import { foldAndSweepStageView } from './fold-and-sweep-stage.js';
import { foldAndSweepProjector } from './projector.js';

export * from './algorithm.js';
export * from './facet.js';
export * from './irs.js';
export * from './fold-and-sweep-stage.js';
export * from './projector.js';

export function registerFoldAndSweep(): void {
  registerAlgorithm<FoldAndSweepData>('foldAndSweep', foldAndSweepAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('foldAndSweepProjector', foldAndSweepProjector);
  for (const ir of foldAndSweepIRs) registerIR(ir.id, ir);
  registerView('fold-and-sweep-stage', foldAndSweepStageView);
  registerFacets([foldAndSweepFacet]);
}
