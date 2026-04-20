/**
 * JSON layout 노드 → DOM 트리 빌더 + 블록 마운트.
 */

import type { LayoutNode, BlockSpec } from '../types/facet-json.js';
import type { ViewInstance, ViewMountParams } from '../views/types.js';
import { getView } from '../views/index.js';

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

function buildNode(
  node: LayoutNode,
  blocks: Record<string, BlockSpec>,
  blockMounts: Record<string, HTMLElement>,
): HTMLElement {
  if ('ref' in node) {
    if (!(node.ref in blocks)) {
      throw new Error(`layout 의 ref "${node.ref}" 가 blocks 에 없음`);
    }
    const slot = document.createElement('div');
    slot.className = 'facet-block';
    slot.dataset.blockRef = node.ref;
    slot.style.display = 'flex';
    slot.style.flexDirection = 'column';
    slot.style.minWidth = '0';
    slot.style.minHeight = '0';
    if (node.grow !== undefined) slot.style.flexGrow = String(node.grow);
    blockMounts[node.ref] = slot;
    return slot;
  }

  const container = document.createElement('div');
  container.className = `facet-layout facet-layout--${node.type}`;
  container.style.display = 'flex';
  container.style.flexDirection = node.type === 'row' ? 'row' : 'column';
  container.style.gap = `${node.gap ?? 8}px`;
  container.style.minWidth = '0';
  container.style.minHeight = '0';
  if (node.grow !== undefined) container.style.flexGrow = String(node.grow);
  if (node.align) {
    const map: Record<string, string> = {
      start: 'flex-start',
      center: 'center',
      end: 'flex-end',
      stretch: 'stretch',
    };
    container.style.alignItems = map[node.align] ?? 'stretch';
  }
  if (node.justify) {
    const map: Record<string, string> = {
      start: 'flex-start',
      center: 'center',
      end: 'flex-end',
      between: 'space-between',
    };
    container.style.justifyContent = map[node.justify] ?? 'flex-start';
  }

  for (const child of node.children) {
    container.appendChild(buildNode(child, blocks, blockMounts));
  }
  return container;
}

export function buildLayout(params: LayoutBuildParams): BuiltLayout {
  const blockMounts: Record<string, HTMLElement> = {};
  const root = document.createElement('div');
  root.className = 'facet-root';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.width = '100%';
  root.style.boxSizing = 'border-box';
  root.appendChild(buildNode(params.layout, params.blocks, blockMounts));
  return { root, blockMounts };
}

export type MountedBlocks = Record<string, ViewInstance>;

export type MountBlocksParams = {
  blocks: Record<string, BlockSpec>;
  blockMounts: Record<string, HTMLElement>;
  mountParams?: Partial<ViewMountParams>;
};

export function mountBlocks(params: MountBlocksParams): MountedBlocks {
  const result: MountedBlocks = {};
  for (const [ref, spec] of Object.entries(params.blocks)) {
    const mount = params.blockMounts[ref];
    if (!mount) continue;
    const view = getView(spec.type);
    if (!view) {
      mount.textContent = `[unknown view: ${spec.type}]`;
      continue;
    }
    const mountParams: ViewMountParams = {
      config: spec as Record<string, unknown>,
      initialData: params.mountParams?.initialData,
      locale: params.mountParams?.locale,
    };
    result[ref] = view.mount(mount, mountParams);
  }
  return result;
}
