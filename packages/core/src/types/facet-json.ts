/**
 * JSON 선언 스키마 — 4-layer의 3번 layer.
 *
 * 메타 정보, 알고리즘/Projector 참조, 초기 데이터, 레이아웃, 블록 구성을 담는다.
 * 로직은 한 줄도 없으며 모듈 참조는 `module:이름` 형식.
 */

export type ModuleRef = `module:${string}`;
export type IRRef = `ir:${string}`;
export type TranspilerRef = `transpiler:${string}`;

export type LayoutNode = LayoutContainerNode | LayoutLeafNode;

export type LayoutContainerNode = {
  type: 'row' | 'column';
  grow?: number;
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'stretch';
  justify?: 'start' | 'center' | 'end' | 'between';
  children: LayoutNode[];
};

export type LayoutLeafNode = {
  /** blocks 의 키를 가리키는 참조 */
  ref: string;
  grow?: number;
};

export type ControlSpec =
  | 'play'
  | 'step'
  | 'pause'
  | 'reset'
  | { type: 'speed-slider'; min?: number; max?: number; default?: number }
  | { type: 'button'; id: string; label: string };

export type MetricSpec = {
  name: string;
  label: string;
  initial?: number;
};

export type BlockSpec =
  | { type: 'title-block'; [key: string]: unknown }
  | { type: 'control-bar'; controls: ControlSpec[]; metrics?: MetricSpec[]; [key: string]: unknown }
  | { type: 'text-display'; [key: string]: unknown }
  | {
      type: 'code-view';
      ir?: IRRef;
      transpiler?: TranspilerRef;
      [key: string]: unknown;
    }
  | { type: string; [key: string]: unknown };

export type InitialData = {
  type: string;
  [key: string]: unknown;
};

export type FacetJson = {
  /** facet 식별자 (예: facet:bubbleSort) */
  id: string;
  title: string;
  description?: string;
  algorithm: ModuleRef;
  projector: ModuleRef;
  initialData: InitialData;
  layout: LayoutNode;
  blocks: Record<string, BlockSpec>;
};
