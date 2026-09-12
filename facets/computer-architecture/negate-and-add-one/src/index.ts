/**
 * negate-and-add-one 등록 진입점.
 *
 * 부르는 책임은 호스트 앱에 있다 — 이 파일은 사이드 이펙트로 스스로 등록하지
 * 않는다 (S-facet).
 */

import {
  registerAlgorithm,
  registerDescription,
  registerFacets,
  registerIR,
  registerProjector,
  registerView,
} from '@ffacet/core/runtime';

import { negateAndAddOneAlgorithm, type NegateAndAddOneData } from './algorithm.js';
import { negateAndAddOneProjector } from './projector.js';
import { negateAndAddOneIRs } from './irs.js';
import { negateAndAddOneStageView, readNegateScene, type NegateScene } from './negate-and-add-one-stage.js';
import { negateAndAddOneFacet } from './facet.js';
import { negateAndAddOneDescription } from './description.js';

export function registerNegateAndAddOne(): void {
  registerAlgorithm('negateAndAddOne', negateAndAddOneAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('negateAndAddOneProjector', negateAndAddOneProjector);
  for (const ir of negateAndAddOneIRs) registerIR(ir.id, ir);
  registerView('negate-and-add-one-stage', negateAndAddOneStageView);
  registerFacets([negateAndAddOneFacet]);
  registerDescription(negateAndAddOneFacet.id, negateAndAddOneDescription);
}

export {
  negateAndAddOneAlgorithm,
  negateAndAddOneProjector,
  negateAndAddOneIRs,
  negateAndAddOneStageView,
  readNegateScene,
  negateAndAddOneFacet,
  negateAndAddOneDescription,
};
export type { NegateAndAddOneData, NegateScene };
