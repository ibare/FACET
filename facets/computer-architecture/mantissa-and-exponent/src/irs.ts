/**
 * 조각은 코드 패널을 두지 않는다 — 보일 IR 이 없다 (S-piece).
 *
 * 파일은 S-facet 의 5파일 구성이라 자리를 지킨다. 빈 배열이므로 index 의
 * 등록 루프는 한 번도 돌지 않는다.
 */

import type { IR } from '@ffacet/core/runtime';

export const mantissaAndExponentIRs: IR[] = [];
