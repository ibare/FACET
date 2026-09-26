import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { birthdayParadox, type BirthdayParadoxFacetData } from './algorithm.js';
import { birthdayParadoxScene } from './scene.js';
import { birthdayParadoxStageView } from './birthday-paradox-stage.js';
import { birthdayParadoxIRs } from './irs.js';
import { birthdayParadoxFacet } from './facet.js';

export { birthdayParadox, readBirthdayParadoxData } from './algorithm.js';
export type { BirthdayParadoxFacetData, BirthdayInput } from './algorithm.js';
export { birthdayParadoxScene } from './scene.js';
export type { BirthdayParadoxScene, BirthdayStep, BirthdayPair } from './scene.js';
export { birthdayParadoxStageView } from './birthday-paradox-stage.js';
export { birthdayParadoxIRs } from './irs.js';
export { birthdayParadoxFacet } from './facet.js';

export function registerBirthdayParadox(): void {
  registerAlgorithm<BirthdayParadoxFacetData>('birthdayParadox', birthdayParadox, { mechanismKind: 'reactive' });
  registerScenePlan('birthdayParadoxScene', birthdayParadoxScene);
  for (const ir of birthdayParadoxIRs) registerIR(ir.id, ir);
  registerView('birthday-paradox-stage', birthdayParadoxStageView);
  registerFacets([birthdayParadoxFacet]);
}
