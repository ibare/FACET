/**
 * View 인터페이스 — 4-layer 구조에서 화면 위젯의 공통 계약.
 *
 * Projector가 ViewInstance 의 메서드를 직접 호출해 시각 갱신.
 */

import type { Theme } from './design-tokens.js';
import type { Translate } from '../runtime/i18n.js';

export type ViewMountParams = {
  /** 블록 spec 전체 (type 포함) */
  config: Record<string, unknown>;
  /** 알고리즘 초기 데이터 (필요시 참조) */
  initialData?: Record<string, unknown>;
  /** 현재 locale. undefined 면 DEFAULT_LOCALE. */
  locale?: string;
  /**
   * 메시지 조회 (`runtime/i18n.ts`). FacetJson.messages 오버라이드가 이미 얹혀 있다.
   * View 가 스스로 makeTranslator 를 부르면 저작자 오버라이드를 못 보므로,
   * 화면 문자열은 반드시 이 함수를 쓴다. 러너 밖에서 mount 하는 경우를 위해 선택.
   */
  t?: Translate;
  /** 현재 테마. 색상 팔레트는 getColors(theme) 로 캡쳐. undefined 면 'light'. */
  theme?: Theme;
  /**
   * View 사용자 입력을 메커니즘에 전달. control-bar 클릭과 직교한 채널이며
   * View 측 위젯이 이 콜백으로 발신 → 러너가 mechanism.dispatch 로 라우팅.
   * 미주입 시 View 는 사용자 입력을 받지 않는 정적 표시 모드로 작동.
   */
  dispatch?: (event: { type: string; payload?: unknown }) => void;
};

export type ViewInstance = {
  /** DOM 정리 */
  destroy(): void;
  /** 뷰별 자유 메서드 */
  [methodName: string]: unknown;
};

export type View = {
  /** 컨테이너 DOM 에 위젯 마운트 */
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance;
};

export type ViewConstructor = View;
