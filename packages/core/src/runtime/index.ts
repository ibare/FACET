/**
 * @facet/core/runtime — 새 4-layer 아키텍처의 진입점.
 *
 * 기존 @facet/core (Container/Body/Lens) 와 분리된 별도 시스템.
 * 두 시스템은 IR/Transpiler 만 공유.
 */

export * from '../types/event.js';
export * from '../types/facet-json.js';
export * from './context.js';
export * from './projector.js';
export * from './event-bus.js';
export * from './layout-builder.js';
export * from './registry.js';
export * from './runner.js';

export {
  registerView,
  unregisterView,
  getView,
  listViews,
  clearViewCatalog,
  registerBuiltinViews,
  titleBlockView,
  textDisplayView,
  controlBarView,
} from '../views/index.js';
export { colors, fonts, fontSizes, radii, space } from '../views/design-tokens.js';
export type { View, ViewInstance, ViewMountParams } from '../views/types.js';
