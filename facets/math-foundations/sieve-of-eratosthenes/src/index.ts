import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { sieveOfEratosthenes, type SieveOfEratosthenesFacetData } from './algorithm.js';
import { sieveOfEratosthenesScene } from './scene.js';
import { sieveOfEratosthenesStageView } from './sieve-of-eratosthenes-stage.js';
import { sieveOfEratosthenesIRs } from './irs.js';
import { sieveOfEratosthenesFacet } from './facet.js';

export {
  sieveOfEratosthenes,
  boardOf,
  narrowSieveData,
  planSieve,
  type SieveOfEratosthenesFacetData,
  type SieveHit,
  type SievePlan,
  type SieveStop,
  type SieveTurn,
} from './algorithm.js';
export { sieveOfEratosthenesScene, type SieveScene, type SieveStep } from './scene.js';
export { sieveOfEratosthenesStageView } from './sieve-of-eratosthenes-stage.js';
export { sieveOfEratosthenesIRs } from './irs.js';
export { sieveOfEratosthenesFacet } from './facet.js';

export function registerSieveOfEratosthenes(): void {
  registerAlgorithm<SieveOfEratosthenesFacetData>('sieveOfEratosthenes', sieveOfEratosthenes, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('sieveOfEratosthenesScene', sieveOfEratosthenesScene);
  for (const ir of sieveOfEratosthenesIRs) registerIR(ir.id, ir);
  registerView('sieve-of-eratosthenes-stage', sieveOfEratosthenesStageView);
  registerFacets([sieveOfEratosthenesFacet]);
}
