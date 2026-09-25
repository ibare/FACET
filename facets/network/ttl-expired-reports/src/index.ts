import { registerAlgorithm, registerFacets, registerIR, registerScenePlan, registerView } from '@ffacet/core/runtime';
import { ttlExpiredReports, type TtlExpiredReportsFacetData } from './algorithm.js';
import { ttlExpiredReportsScene } from './scene.js';
import { ttlExpiredReportsStageView } from './ttl-expired-reports-stage.js';
import { ttlExpiredReportsIRs } from './irs.js';
import { ttlExpiredReportsFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './ttl-expired-reports-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerTtlExpiredReports(): void {
  registerAlgorithm<TtlExpiredReportsFacetData>('ttlExpiredReports', ttlExpiredReports, { mechanismKind: 'reactive' });
  registerScenePlan('ttlExpiredReportsScene', ttlExpiredReportsScene);
  for (const ir of ttlExpiredReportsIRs) registerIR(ir.id, ir);
  registerView('ttl-expired-reports-stage', ttlExpiredReportsStageView);
  registerFacets([ttlExpiredReportsFacet]);
}
