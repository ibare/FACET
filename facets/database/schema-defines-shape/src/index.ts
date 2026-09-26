import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { schemaDefinesShape, type SchemaDefinesShapeFacetData } from './algorithm.js';
import { schemaDefinesShapeScene } from './scene.js';
import { schemaDefinesShapeStageView } from './schema-defines-shape-stage.js';
import { schemaDefinesShapeIRs } from './irs.js';
import { schemaDefinesShapeFacet } from './facet.js';

export * from './algorithm.js';
export * from './scene.js';
export * from './schema-defines-shape-stage.js';
export * from './irs.js';
export * from './facet.js';

export function registerSchemaDefinesShape(): void {
  registerAlgorithm<SchemaDefinesShapeFacetData>('schemaDefinesShape', schemaDefinesShape, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('schemaDefinesShapeScene', schemaDefinesShapeScene);
  for (const ir of schemaDefinesShapeIRs) registerIR(ir.id, ir);
  registerView('schema-defines-shape-stage', schemaDefinesShapeStageView);
  registerFacets([schemaDefinesShapeFacet]);
}
