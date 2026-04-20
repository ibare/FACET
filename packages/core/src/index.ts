/**
 * @facet/core — 4-layer 러너 시스템의 진입점.
 *
 * 모든 공개 API 는 ./runtime 에서 정의되며, 여기서는 IR/Transpiler 타입과
 * 함께 재공개한다.
 */

export * from './types.js';
export * from './runtime/index.js';
