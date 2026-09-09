/**
 * 되짚어 나오기 IR — 없다.
 *
 * 조각은 코드 패널을 두지 않는다 (S-piece). 배열 자리는 등록 절차
 * (`index.ts` 의 registerIR 순회) 를 다른 facet 과 같게 유지하려고 남긴다.
 */

import type { IR } from '@ffacet/core/runtime';

export const diveThenBacktrackIRs: IR[] = [];
