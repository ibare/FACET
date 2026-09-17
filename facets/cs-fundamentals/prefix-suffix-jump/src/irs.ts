import type { IR } from '@ffacet/core/runtime';

/**
 * 조각은 코드 패널을 두지 않는다 — IR 없음.
 *
 * 파일을 비워 두지 않고 빈 배열을 내는 것은 S-facet 의 5파일 구성을 지키기
 * 위해서다. `index.ts` 가 이 배열을 돌므로 나중에 하나가 생겨도 등록 경로는 그대로다.
 */
export const prefixSuffixJumpIRs: IR[] = [];
