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
  /**
   * 러너가 만들어 준 SVG 캔버스. `View.canvas` 를 선언한 view 에만 주어지며,
   * 그 경우 CanvasView 의 mount 시그니처가 필수로 받는다.
   */
  canvas?: SVGSVGElement;
};

export type ViewInstance = {
  /** DOM 정리 */
  destroy(): void;
  /** 뷰별 자유 메서드 */
  [methodName: string]: unknown;
};

/**
 * SVG 캔버스를 쓰는 view 가 자기 요구를 선언하는 자리.
 *
 * 선언하면 러너가 SVG 요소를 만들어 `params.canvas` 로 넘긴다. view 는 그 안에만
 * 그린다. 껍데기(viewBox·폭·정렬·display)를 view 마다 다시 만들면 서로 갈리고,
 * 실제로 갈렸다 — 한 조각은 width 를 CSS 로만 줘서 flex 슬롯 안에서 브라우저가
 * SVG 의 기본 intrinsic 폭 300px 로 떨어뜨렸고 그림이 절반으로 눌렸다.
 */
export type ViewCanvasSpec = {
  /** viewBox 가로. 생략하면 PIECE_CANVAS_W. */
  width?: number;
  /**
   * viewBox 세로의 **초기값**. 내용에 따라 달라지는 view 는 mount 에서
   * `params.canvas.setAttribute('viewBox', …)` 로 갱신한다 — 러너가 정하는 것은
   * 폭 정책과 정렬이지 내용 크기가 아니다 (tree-layout 은 노드 수로 높이가 정해진다).
   */
  height: number;
  /**
   * 'fill'      컨테이너 폭을 채우되 width 를 넘지 않는다 (기본)
   * 'intrinsic' 픽셀 크기를 지킨다. 조연 패널에서 커지면 안 되는 view 용
   *             (conveyor-queue 가 그 사정을 주석으로 남겨 두었다)
   * 'stretch'   가로세로를 컨테이너에 맞춘다. 높이가 바깥에서 정해지는
   *             반응형 view 용 (bar-chart 는 ResizeObserver 로 다시 그린다)
   */
  fit?: 'fill' | 'intrinsic' | 'stretch';
};

/** SVG 를 쓰지 않는 view — 컨테이너만 받는다 (control-bar · title-block 등). */
export type PlainView = {
  /** 컨테이너 DOM 에 위젯 마운트 */
  mount(container: HTMLElement, params: ViewMountParams): ViewInstance;
};

/** SVG 캔버스를 쓰는 view — 러너가 만든 캔버스를 받는다. */
export type CanvasView = {
  canvas: ViewCanvasSpec;
  mount(
    container: HTMLElement,
    params: ViewMountParams & { canvas: SVGSVGElement },
  ): ViewInstance;
};

export type View = PlainView | CanvasView;

export type ViewConstructor = View;
