import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';
import { cacheCoherenceAlgorithm, type CacheCoherenceData } from './algorithm.js';
import { cacheCoherenceProjector } from './projector.js';
import { cacheCoherenceIRs } from './irs.js';
import { cacheCoherenceStageView } from './cache-coherence-stage.js';
import { cacheCoherenceFacet } from './facet.js';

export {
  cacheCoherenceAlgorithm,
  readCoherenceData,
  simulateCoherence,
  coherenceTileAxis,
  type CacheCoherenceData,
  type CoherencePhase,
  type CoherencePlay,
  type CoherenceStep,
  type CoherenceTotals,
} from './algorithm.js';
export { cacheCoherenceProjector } from './projector.js';
export { cacheCoherenceImperativeIR, cacheCoherenceIRs } from './irs.js';
export { cacheCoherenceStageView, type CoherenceStage } from './cache-coherence-stage.js';
export { cacheCoherenceFacet } from './facet.js';

export function registerCacheCoherence(): void {
  registerAlgorithm<CacheCoherenceData>('cacheCoherence', cacheCoherenceAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('cacheCoherenceProjector', cacheCoherenceProjector);
  for (const ir of cacheCoherenceIRs) registerIR(ir.id, ir);
  registerView('cache-coherence-stage', cacheCoherenceStageView);
  registerFacets([cacheCoherenceFacet]);
}
