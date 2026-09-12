import type { IR } from '@ffacet/core/runtime';

/**
 * 조각은 코드 패널을 두지 않는다 (S-piece). 빈 배열로 둔다 — `index.ts` 가
 * 이것을 순회하므로 자리는 있어야 한다.
 */
export const associativityReliefIRs: IR[] = [];
