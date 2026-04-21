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
  | 'layer-discovered'
  | 'fold'
  | 'unfold'
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
  | { type: 'layer-discovered'; target?: FacetEventTarget; payload?: unknown }
  | { type: 'fold'; target?: FacetEventTarget; payload?: unknown }
  | { type: 'unfold'; target?: FacetEventTarget; payload?: unknown }
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

/**
 * `index:N` 형식의 target 들만 모아 숫자 인덱스 배열로 변환.
 * prefix 가 `index` 가 아니거나 N 이 숫자가 아니면 건너뛴다.
 *
 * Projector 가 `highlight`/`unhighlight`/`mark` 이벤트의 target 을
 * 배열 인덱스로 환원할 때 공용으로 사용한다 (C1: Target 문법 일원화).
 */
export function toIndexArray(target: FacetEventTarget | undefined): number[] {
  if (target === undefined) return [];
  const arr = Array.isArray(target) ? target : [target];
  const out: number[] = [];
  for (const t of arr) {
    if (typeof t !== 'string') continue;
    const parsed = parseTarget(t);
    if (parsed?.prefix !== 'index') continue;
    const n = Number(parsed.id);
    if (!Number.isNaN(n)) out.push(n);
  }
  return out;
}
