/**
 * JSON layout 노드 → DOM 트리 빌더.
 *
 * 단계 1 은 시그니처만, 실제 구현은 단계 2.
 */

import type { LayoutNode, BlockSpec } from '../types/facet-json.js';
import type { ViewInstance, ViewMountParams } from '../views/types.js';

export type BuiltLayout = {
  /** 레이아웃 루트 DOM */
  root: HTMLElement;
  /** ref 키별 마운트 컨테이너 */
  blockMounts: Record<string, HTMLElement>;
};

export type LayoutBuildParams = {
  layout: LayoutNode;
  blocks: Record<string, BlockSpec>;
};

export function buildLayout(_params: LayoutBuildParams): BuiltLayout {
  throw new Error('buildLayout not implemented (단계 2 에서 구현)');
}

export type MountedBlocks = Record<string, ViewInstance>;

export type MountBlocksParams = {
  blocks: Record<string, BlockSpec>;
  blockMounts: Record<string, HTMLElement>;
  mountParams?: Partial<ViewMountParams>;
};

export function mountBlocks(_params: MountBlocksParams): MountedBlocks {
  throw new Error('mountBlocks not implemented (단계 2 에서 구현)');
}
