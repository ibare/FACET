import type { IR } from '@ffacet/core/runtime';

/**
 * 조각은 코드 패널을 두지 않는다.
 *
 * 코드 패널(`code-view`)은 완제품의 산출물이다 — IR 하나가 여섯 언어로 갈리는
 * 것을 보이는 자리라, 한 주장만 말하고 멈추는 조각에는 보일 소스가 없다. 다만
 * 파일 구성은 S-facet 을 그대로 따르므로 자리만 두고 배열은 비운다.
 */
export const boundaryShiftIRs: IR[] = [];
