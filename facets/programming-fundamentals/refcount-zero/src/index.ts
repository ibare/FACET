import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { refcountZero, type RefcountZeroFacetData } from './algorithm.js';
import { refcountZeroScene } from './scene.js';
import { refcountZeroStageView } from './refcount-zero-stage.js';
import { refcountZeroIRs } from './irs.js';
import { refcountZeroFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './refcount-zero-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerRefcountZero(): void {
  registerAlgorithm<RefcountZeroFacetData>('refcountZero', refcountZero, { mechanismKind: 'reactive' });
  registerScenePlan('refcountZeroScene', refcountZeroScene);
  for (const ir of refcountZeroIRs) registerIR(ir.id, ir);
  registerView('refcount-zero-stage', refcountZeroStageView);
  registerFacets([refcountZeroFacet]);
}
