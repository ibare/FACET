/**
 * View 인터페이스 — 4-layer 구조에서 화면 위젯의 공통 계약.
 *
 * Projector가 ViewInstance 의 메서드를 직접 호출해 시각 갱신.
 */

export type ViewMountParams = {
  /** 블록 spec 전체 (type 포함) */
  config: Record<string, unknown>;
  /** 알고리즘 초기 데이터 (필요시 참조) */
  initialData?: Record<string, unknown>;
  /** 현재 locale (View 내부 하드코딩 라벨 다국어화용). undefined 면 DEFAULT_LOCALE. */
  locale?: string;
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
