/**
 * JSON layout 노드 → DOM 트리 빌더 + 블록 마운트.
 */

import type { LayoutNode, BlockSpec } from '../types/facet-json.js';
import type { View, ViewCanvasSpec, ViewInstance, ViewMountParams } from '../views/types.js';
import { getView } from '../views/index.js';
import { PIECE_CANVAS_W } from '../views/design-tokens.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * view 가 선언한 캔버스를 만든다.
 *
 * 폭은 **속성**으로 준다. `.facet-block` 슬롯은 flex column + min-width:0 이라
 * 부모 폭이 내용으로 정해지는 경우가 있고, 그때 CSS width:100% 는 순환이 되어
 * 브라우저가 SVG 의 기본 intrinsic 폭 300px 로 떨어뜨린다 (S-view).
 */
function createCanvas(spec: ViewCanvasSpec): SVGSVGElement {
  const w = spec.width ?? PIECE_CANVAS_W;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${spec.height}`);
  if (spec.fit === 'intrinsic') {
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(spec.height));
    svg.style.maxWidth = '100%';
    svg.style.height = 'auto';
  } else if (spec.fit === 'stretch') {
    svg.setAttribute('width', '100%');
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.flex = '1 1 auto';
  } else {
    svg.setAttribute('width', '100%');
    svg.style.maxWidth = `${w}px`;
    svg.style.height = 'auto';
  }
  svg.style.display = 'block';
  if (spec.fit !== 'stretch') svg.style.margin = '0 auto';
  return svg;
}

/** blocks 만 있고 layout 선언이 없을 때 쓰는 기본 배치. */
export function defaultLayout(blocks: Record<string, BlockSpec>): LayoutNode {
  return {
    type: 'column',
    gap: 8,
    children: Object.keys(blocks).map((ref) => ({ ref })),
  };
}

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
    if (node.padding !== undefined) slot.style.padding = node.padding;
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
  if (node.padding !== undefined) container.style.padding = node.padding;
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

/**
 * view 하나를 마운트한다. 러너 밖에서 view 를 띄울 때도 이 경로를 쓴다 —
 * CanvasView 라면 껍데기를 만들어 넘기는 일이 여기서 한 번만 일어난다.
 */
export function mountView(
  view: View,
  container: HTMLElement,
  params: ViewMountParams,
): ViewInstance {
  if ('canvas' in view) {
    const canvas = createCanvas(view.canvas);
    container.appendChild(canvas);
    return view.mount(container, { ...params, canvas });
  }
  return view.mount(container, params);
}

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
      theme: params.mountParams?.theme,
      dispatch: params.mountParams?.dispatch,
      // t 를 빠뜨리면 view 가 makeTranslator(locale) fallback 으로 떨어져
      // FacetJson.messages 저작 문안을 보지 못한다 (C10 조회 1층 유실).
      t: params.mountParams?.t,
    };
    result[ref] = mountView(view, mount, mountParams);
  }
  return result;
}
