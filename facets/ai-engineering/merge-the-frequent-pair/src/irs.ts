/**
 * 조각은 코드 패널을 두지 않으므로 IR 이 없다.
 *
 * IR 은 완제품이 한 알고리즘을 여섯 언어로 펼쳐 보이려고 두는 것이고, 조각은 주장
 * 하나를 그림으로 뒷받침하고 멈춘다. 빈 배열이지만 파일은 남긴다 — S-facet 의 5파일
 * 구성은 조각에도 그대로 적용되고, `index.ts` 가 이 배열을 돌기 때문이다.
 */

import type { IR } from '@ffacet/core/runtime';

export const mergeTheFrequentPairIRs: IR[] = [];
