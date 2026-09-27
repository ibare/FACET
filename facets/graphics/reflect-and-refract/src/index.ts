import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { reflectAndRefract, type ReflectAndRefractFacetData } from './algorithm.js';
import { reflectAndRefractScene } from './scene.js';
import { reflectAndRefractStageView } from './reflect-and-refract-stage.js';
import { reflectAndRefractIRs } from './irs.js';
import { reflectAndRefractFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export { reflectAndRefractStageView } from './reflect-and-refract-stage.js';
export { reflectAndRefractIRs } from './irs.js';
export { reflectAndRefractFacet } from './facet.js';

/** 이 조각을 레지스트리에 올린다. 호출은 호스트 몫이다. */
export function registerReflectAndRefract(): void {
  registerAlgorithm<ReflectAndRefractFacetData>('reflectAndRefract', reflectAndRefract, { mechanismKind: 'reactive' });
  registerScenePlan('reflectAndRefractScene', reflectAndRefractScene);
  for (const ir of reflectAndRefractIRs) registerIR(ir.id, ir);
  registerView('reflect-and-refract-stage', reflectAndRefractStageView);
  registerFacets([reflectAndRefractFacet]);
}
