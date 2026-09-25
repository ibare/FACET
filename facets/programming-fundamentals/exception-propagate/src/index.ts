import {
  registerAlgorithm,
  registerFacets,
  registerIR,
  registerScenePlan,
  registerView,
} from '@ffacet/core/runtime';
import { exceptionPropagate, type ExceptionPropagateFacetData } from './algorithm';
import { exceptionPropagateScene } from './scene';
import { exceptionPropagateStageView } from './exception-propagate-stage';
import { exceptionPropagateIRs } from './irs';
import { exceptionPropagateFacet } from './facet';

export * from './algorithm';
export * from './scene';
export * from './exception-propagate-stage';
export * from './irs';
export * from './facet';

/** 예외 전파 조각을 등록한다. 부르는 것은 호스트 몫이다. */
export function registerExceptionPropagate(): void {
  registerAlgorithm<ExceptionPropagateFacetData>('exceptionPropagate', exceptionPropagate, {
    mechanismKind: 'reactive',
  });
  registerScenePlan('exceptionPropagateScene', exceptionPropagateScene);
  for (const ir of exceptionPropagateIRs) registerIR(ir.id, ir);
  registerView('exception-propagate-stage', exceptionPropagateStageView);
  registerFacets([exceptionPropagateFacet]);
}
