/**
 * svd 의 IR — 두지 않는다.
 *
 * 6 × 7 표의 SVD 는 AAᵀ 의 야코비 회전으로 셈한다. 코드 패널을 두면 "겹을 쌓는다" 대신 회전 셈이 화면을
 * 차지해 주장과 다른 것을 보인다 (tsne 선례). 그래서 코드 패널 블록 · phase 를 두지 않고 빈 목록만 내놓는다.
 */
import type { IR } from '@ffacet/core';

export const svdIRs: IR[] = [];
