/**
 * runFacet — 4-layer 아키텍처의 진입점 (4번 layer).
 *
 * JSON 을 해석해 layout/blocks 구성, 알고리즘 코루틴 실행,
 * 이벤트를 Projector 로 라우팅, 컨트롤(재생/단계/정지/리셋/속도) 처리.
 *
 * 단계 1 은 시그니처만, 실제 구현은 단계 2.
 */

import type { FacetJson } from '../types/facet-json.js';

export type FacetRunHandle = {
  /** 알고리즘 코루틴 시작 (이미 실행 중이면 무시) */
  start(): void;
  /** 정지 — emit 대기 중인 코루틴은 다음 yield 에서 멈춘다 */
  stop(): void;
  /** 한 step 진행 (정지 상태에서 호출) */
  step(): void;
  /** 정지 후 데이터/뷰 초기화, 알고리즘 재시작 가능 상태 */
  reset(): void;
  /** 0.5x ~ 4x 등 배속 */
  setSpeed(multiplier: number): void;
  /** 마운트 해제 + 모든 리스너 정리 */
  destroy(): void;
};

export type RunFacetOptions = {
  /** 자동 시작 여부 (기본 false) */
  autoStart?: boolean;
};

export function runFacet(
  _json: FacetJson,
  _mountEl: HTMLElement,
  _options?: RunFacetOptions,
): FacetRunHandle {
  throw new Error('runFacet not implemented (단계 2 에서 구현)');
}
