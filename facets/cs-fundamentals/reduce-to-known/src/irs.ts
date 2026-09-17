import type { IR } from '@ffacet/core/runtime';

/**
 * 조각은 코드 패널을 두지 않으므로 IR 이 없다 (S-piece).
 *
 * 파일은 남긴다 — S-facet 의 5파일 구성은 조각에도 그대로 적용되고, 빈 배열이
 * "아직 안 만든 것" 이 아니라 "두지 않기로 한 것" 임을 여기서 말한다.
 */
export const reduceToKnownIRs: IR[] = [];
