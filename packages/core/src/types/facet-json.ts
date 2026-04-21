/**
 * JSON 선언 스키마 — 4-layer의 3번 layer.
 *
 * 메타 정보, 알고리즘/Projector 참조, 초기 데이터, 레이아웃, 블록 구성을 담는다.
 * 로직은 한 줄도 없으며 모듈 참조는 `module:이름` 형식.
 */

import type { LocaleStr } from './locale.js';

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
  | { type: 'speed-slider'; default?: number; steps?: number[] }
  | { type: 'button'; id: string; label: string };

export type MetricSpec = {
  name: string;
  label: LocaleStr;
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
  title: LocaleStr;
  description?: LocaleStr;
  algorithm: ModuleRef;
  projector: ModuleRef;
  initialData: InitialData;
  /**
   * true 면 mount 시점과 reset 시점에 initialData 의 최상위 배열 필드를
   * Fisher-Yates 로 셔플한다. 정렬 알고리즘처럼 매 실행마다 다른
   * 시작 배치를 보고 싶을 때 사용. 정렬된 입력을 전제하는 알고리즘
   * (이진/보간 탐색 등) 에서는 켜지 말 것.
   */
  shuffleOnReset?: boolean;
  layout: LayoutNode;
  blocks: Record<string, BlockSpec>;
};
