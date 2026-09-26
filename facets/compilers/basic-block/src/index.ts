import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { basicBlock } from './algorithm.js';
import type { BasicBlockFacetData } from './algorithm.js';
import { basicBlockScene } from './scene.js';
import { basicBlockIRs } from './irs.js';
import { basicBlockStageView } from './basic-block-stage.js';
import { basicBlockFacet } from './facet.js';

export { basicBlock, readCode } from './algorithm.js';
export type {
  BasicBlockFacetData,
  BlockRange,
  Instruction,
  LeaderRule,
  Operand,
  RuleHit,
} from './algorithm.js';
export { basicBlockScene } from './scene.js';
export type { BasicBlockScene, BasicBlockStep, LeaderMark } from './scene.js';
export { basicBlockIRs } from './irs.js';
export { basicBlockStageView } from './basic-block-stage.js';
export { basicBlockFacet } from './facet.js';

export function registerBasicBlock(): void {
  registerAlgorithm<BasicBlockFacetData>('basicBlock', basicBlock, { mechanismKind: 'reactive' });
  registerScenePlan('basicBlockScene', basicBlockScene);
  for (const ir of basicBlockIRs) registerIR(ir.id, ir);
  registerView('basic-block-stage', basicBlockStageView);
  registerFacets([basicBlockFacet]);
}
