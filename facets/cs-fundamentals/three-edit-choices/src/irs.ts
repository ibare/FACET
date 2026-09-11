import type { IR } from '@ffacet/core/runtime';

/**
 * 코드 패널이 없는 조각이라 IR 을 두지 않는다. 빈 배열이어도 파일은 둔다 —
 * S-facet 의 6파일 구성은 파일 이름까지 규약이다.
 */
export const threeEditChoicesIRs: IR[] = [];
