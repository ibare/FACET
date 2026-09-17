/**
 * 등록 진입점. 사이드 이펙트로 호출하지 않는다 — 부르는 책임은 호스트에 있다.
 */

import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';

import { manyPatternsOnePassAlgorithm, type ManyPatternsOnePassData } from './algorithm.js';
import { manyPatternsOnePassScene } from './scene.js';
import { manyPatternsOnePassIRs } from './irs.js';
import { manyPatternsOnePassStageView } from './many-patterns-one-pass-stage.js';
import { manyPatternsOnePassFacet } from './facet.js';

export {
  manyPatternsOnePassAlgorithm,
  manyPatternsOnePassScene,
  manyPatternsOnePassIRs,
  manyPatternsOnePassStageView,
  manyPatternsOnePassFacet,
};
export type { ManyPatternsOnePassData };

export function registerManyPatternsOnePass(): void {
  registerAlgorithm<ManyPatternsOnePassData>(
    'manyPatternsOnePass',
    manyPatternsOnePassAlgorithm,
    { mechanismKind: 'reactive' },
  );
  registerScenePlan('manyPatternsOnePassScene', manyPatternsOnePassScene);
  for (const ir of manyPatternsOnePassIRs) registerIR(ir.id, ir);
  registerView('many-patterns-one-pass-stage', manyPatternsOnePassStageView);
  registerFacets([manyPatternsOnePassFacet]);
}
