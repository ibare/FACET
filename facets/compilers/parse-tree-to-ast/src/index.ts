/**
 * parse-tree-to-ast — 파스 나무와 AST. 등록은 호스트가 register 함수를 불러 한다.
 */
import { registerAlgorithm, registerFacets, registerIR, registerProjector, registerView } from '@ffacet/core/runtime';
import { parseTreeToAstAlgorithm, type ParseTreeToAstData } from './algorithm.js';
import { parseTreeToAstFacet } from './facet.js';
import { parseTreeToAstIRs } from './irs.js';
import { parseTreeToAstStageView } from './parse-tree-to-ast-stage.js';
import { parseTreeToAstProjector } from './projector.js';

export * from './algorithm.js';
export * from './projector.js';
export * from './irs.js';
export * from './parse-tree-to-ast-stage.js';
export * from './facet.js';

export function registerParseTreeToAst(): void {
  registerAlgorithm<ParseTreeToAstData>('parseTreeToAst', parseTreeToAstAlgorithm, { mechanismKind: 'reactive' });
  registerProjector('parseTreeToAstProjector', parseTreeToAstProjector);
  for (const ir of parseTreeToAstIRs) registerIR(ir.id, ir);
  registerView('parse-tree-to-ast-stage', parseTreeToAstStageView);
  registerFacets([parseTreeToAstFacet]);
}
