import { registerAlgorithm, registerProjector, registerIR, registerView, registerFacets, registerDescription } from '@ffacet/core/runtime';
import { walkPerCharacterAlgorithm } from './algorithm.js';
import { walkPerCharacterProjector } from './projector.js';
import { walkPerCharacterIRs } from './irs.js';
import { walkPerCharacterStageView } from './walk-per-character-stage.js';
import { walkPerCharacterFacet } from './facet.js';
import { walkPerCharacterDescription } from './description.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './walk-per-character-stage.js';
export * from './facet.js';
export * from './description.js';

export function registerWalkPerCharacter(): void {
  registerAlgorithm('walkPerCharacter', walkPerCharacterAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('walkPerCharacterProjector', walkPerCharacterProjector);
  for (const ir of walkPerCharacterIRs) registerIR(ir.id, ir);
  registerView('walk-per-character-stage', walkPerCharacterStageView);
  registerFacets([walkPerCharacterFacet]);
  registerDescription(walkPerCharacterFacet.id, walkPerCharacterDescription);
}
