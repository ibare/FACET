import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { timestampVsFingerprint, type TimestampVsFingerprintFacetData } from './algorithm.js';
import { timestampVsFingerprintScene } from './scene.js';
import { timestampVsFingerprintIRs } from './irs.js';
import { timestampVsFingerprintStageView } from './timestamp-vs-fingerprint-stage.js';
import { timestampVsFingerprintFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './irs.js';
export * from './timestamp-vs-fingerprint-stage.js';
export * from './facet.js';

export function registerTimestampVsFingerprint(): void {
  registerAlgorithm<TimestampVsFingerprintFacetData>('timestampVsFingerprint', timestampVsFingerprint, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('timestampVsFingerprintScene', timestampVsFingerprintScene);
  for (const ir of timestampVsFingerprintIRs) registerIR(ir.id, ir);
  registerView('timestamp-vs-fingerprint-stage', timestampVsFingerprintStageView);
  registerFacets([timestampVsFingerprintFacet]);
}
