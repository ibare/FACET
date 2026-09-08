/**
 * merge-two-sorted 는 조각이라 코드 패널이 없다.
 *
 * 조각은 질문 하나에 답하고 멈추는 물건이고, 이 조각이 하는 말은 "다시 정렬하지
 * 않는다" 하나다. 코드 패널을 붙이면 그 옆에 두 번째 읽을거리가 생겨 질문이
 * 둘이 된다. 그래서 IR 을 두지 않는다 (S-piece).
 */

import type { IR } from '@ffacet/core';

export const mergeTwoSortedIRs: IR[] = [];
