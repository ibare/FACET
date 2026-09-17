/**
 * wrong-in-one-direction 등록 진입점.
 *
 * 호출 책임은 호스트 앱에 있다 — 이 모듈은 사이드 이펙트로 스스로 등록하지 않는다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { wrongInOneDirectionAlgorithm, type WrongInOneDirectionData } from './algorithm.js';
import { wrongInOneDirectionScene } from './scene.js';
import { wrongInOneDirectionIRs } from './irs.js';
import { wrongInOneDirectionStageView } from './wrong-in-one-direction-stage.js';
import { wrongInOneDirectionFacet } from './facet.js';

export {
  wrongInOneDirectionAlgorithm,
  wrongInOneDirectionScene,
  wrongInOneDirectionIRs,
  wrongInOneDirectionStageView,
  wrongInOneDirectionFacet,
};
export type { WrongInOneDirectionData };
export type { WrongInOneDirectionScene } from './scene.js';

export function registerWrongInOneDirection(): void {
  registerAlgorithm<WrongInOneDirectionData>('wrongInOneDirection', wrongInOneDirectionAlgorithm, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('wrongInOneDirectionScene', wrongInOneDirectionScene);
  for (const ir of wrongInOneDirectionIRs) registerIR(ir.id, ir);
  registerView('wrong-in-one-direction-stage', wrongInOneDirectionStageView);
  registerFacets([wrongInOneDirectionFacet]);
}
