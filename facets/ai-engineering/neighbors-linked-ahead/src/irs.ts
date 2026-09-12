import type { IR } from '@ffacet/core/runtime';

/**
 * 조각은 코드 패널을 두지 않으므로 IR 이 없다 (S-piece).
 * 빈 배열이어도 자리를 두는 것은 index.ts 의 등록 순서를 한 모양으로 지키기 위함이다.
 */
export const neighborsLinkedAheadIRs: IR[] = [];
