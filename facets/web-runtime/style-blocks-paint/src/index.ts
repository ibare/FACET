import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { styleBlocksPaint } from './algorithm.js';
import type { StyleBlocksPaintFacetData } from './algorithm.js';
import { styleBlocksPaintScene } from './scene.js';
import { styleBlocksPaintStageView } from './style-blocks-paint-stage.js';
import { styleBlocksPaintIRs } from './irs.js';
import { styleBlocksPaintFacet } from './facet.js';

export { styleBlocksPaint } from './algorithm.js';
export type { StyleBlocksPaintFacetData, StyleBlocksPaintLine, StyleBlocksPaintLineKind } from './algorithm.js';
export { styleBlocksPaintScene } from './scene.js';
export type { StyleBlocksPaintScene, StyleBlocksPaintSceneLine, StyleBlocksPaintStep } from './scene.js';
export { styleBlocksPaintStageView } from './style-blocks-paint-stage.js';
export { styleBlocksPaintIRs } from './irs.js';
export { styleBlocksPaintFacet } from './facet.js';

/** 등록 — 호출은 호스트의 몫. index.ts 는 스스로 부르지 않는다. */
export function registerStyleBlocksPaint(): void {
  registerAlgorithm<StyleBlocksPaintFacetData>('styleBlocksPaint', styleBlocksPaint, { mechanismKind: 'reactive' });
  registerScenePlan('styleBlocksPaintScene', styleBlocksPaintScene);
  for (const ir of styleBlocksPaintIRs) registerIR(ir.id, ir);
  registerView('style-blocks-paint-stage', styleBlocksPaintStageView);
  registerFacets([styleBlocksPaintFacet]);
}
