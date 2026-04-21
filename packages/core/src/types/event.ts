/**
 * 새 4-layer 아키텍처의 표준 이벤트 어휘.
 *
 * 알고리즘 모듈이 발생시키고 Projector가 받는다.
 * 새 자료구조 도입 시 type 또는 target prefix를 확장.
 */

export type StandardEventType =
  | 'highlight'
  | 'unhighlight'
  | 'mark'
  | 'state-changed'
  | 'enqueue'
  | 'dequeue'
  | 'append'
  | 'done';

export type FacetEventTarget = string | string[];

export type FacetRuntimeEvent<T extends string = string> = {
  type: T;
  target?: FacetEventTarget;
  payload?: unknown;
  /**
   * true 면 사용자 step boundary 가 아니다.
   * - stepping 모드에서 paused 로 전환되지 않고 통과한다.
   * - playing 모드에서 BASE_DELAY 지연도 적용하지 않는다.
   * Projector 의 처리 자체는 그대로 호출된다 (코드 패널 phase
   * 동기화처럼 시각 변화는 없지만 상태 갱신이 필요한 메타 이벤트용).
   */
  silent?: boolean;
};

export type StandardFacetEvent =
  | { type: 'highlight'; target?: FacetEventTarget; payload?: unknown }
  | { type: 'unhighlight'; target?: FacetEventTarget; payload?: unknown }
  | { type: 'mark'; target?: FacetEventTarget; payload?: unknown }
  | { type: 'state-changed'; target?: FacetEventTarget; payload?: unknown }
  | { type: 'enqueue'; target?: FacetEventTarget; payload?: unknown }
  | { type: 'dequeue'; target?: FacetEventTarget; payload?: unknown }
  | { type: 'append'; target?: FacetEventTarget; payload?: unknown }
  | { type: 'done'; target?: FacetEventTarget; payload?: unknown };

/**
 * 식별자 문법: `타입:식별자` (예: `index:3`, `node:A`, `edge:A-B`, `queue`).
 * 새 자료구조 추가 시 새 prefix 정의.
 */
export type TargetPrefix = 'index' | 'node' | 'edge' | 'queue' | 'list' | 'tree' | string;

export function parseTarget(t: string): { prefix: TargetPrefix; id: string } | null {
  const idx = t.indexOf(':');
  if (idx <= 0) return { prefix: t, id: '' };
  return { prefix: t.slice(0, idx), id: t.slice(idx + 1) };
}
