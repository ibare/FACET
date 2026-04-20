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
