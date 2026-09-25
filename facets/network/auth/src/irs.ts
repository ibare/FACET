/**
 * auth 의 IR — 두지 않는다.
 *
 * 판정은 `지금 < 만료` 비교 하나이고 발급은 만료를 넘을 때 다시 받는 것뿐이라,
 * 코드 패널이 셈을 보이지 못한다 (판정서 auth — IR 약). 그래서 facet.ts 에 codePanel 블록도 없고
 * 알고리즘은 phase 를 보내지 않는다.
 */
import type { IR } from '@ffacet/core';

export const authIRs: IR[] = [];
