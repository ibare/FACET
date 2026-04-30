/**
 * @facet/algorithm-context-switching — 4-layer 컨텍스트 스위칭 facet 번들.
 *
 * 시간 진행형 (ReactiveMechanism). mount 직후 자동 시연으로 autoSwitches 회의
 * 스위치를 펼치고 idle 로 진입한 뒤, 사용자 입력 (play / pause / step /
 * triggerKind / mode / reset) 을 1:1 시각 사건으로 매핑.
 *
 * algorithm / projector / facet JSON / description / 전용 view
 * (context-switching-stage) 를 함께 번들하고 등록 헬퍼를 제공한다. 코드 패널은
 * 1차 구현에서 생략.
 */

export {
  contextSwitching,
  type ContextSwitchingData,
  type ContextSwitchingInputEvent,
  type Flow,
  type TriggerKind,
  type Mode,
  type TriggerSegment,
  type ModeSegment,
} from './algorithm.js';
export { contextSwitchingProjector } from './projector.js';
export { contextSwitchingIRs } from './irs.js';
export { contextSwitchingFacet } from './facet.js';
export { contextSwitchingDescription } from './description.js';
export { contextSwitchingStageView } from './context-switching-stage.js';

import {
  registerAlgorithm,
  registerProjector,
  registerIR,
  registerFacets,
  registerDescription,
  registerView,
} from '@facet/core/runtime';
import { contextSwitching, type ContextSwitchingData } from './algorithm.js';
import { contextSwitchingProjector } from './projector.js';
import { contextSwitchingIRs } from './irs.js';
import { contextSwitchingFacet } from './facet.js';
import { contextSwitchingDescription } from './description.js';
import { contextSwitchingStageView } from './context-switching-stage.js';

export function registerContextSwitching(): void {
  registerAlgorithm<ContextSwitchingData>('contextSwitching', contextSwitching, {
    mechanismKind: 'reactive',
  });
  registerProjector('contextSwitchingProjector', contextSwitchingProjector);
  for (const ir of contextSwitchingIRs) registerIR(ir.id, ir);
  registerView('context-switching-stage', contextSwitchingStageView);
  registerFacets([contextSwitchingFacet]);
  registerDescription(contextSwitchingFacet.id, contextSwitchingDescription);
}
