/**
 * 조건문 facet 학습용 IR — 1차 구현은 코드 패널 미포함.
 *
 * concept type / 입력 반응형. 도식이 자체로 의미를 담아 "언어별 코드 매핑" 의
 * 학습 가치가 작다. 향후 if/elif/else 의 언어별 문법 차이 패널을 도입하면
 * conditional-control-flow IR 을 정의하고 algorithm.ts 의 phase 어휘
 * (idle / auto-demo) 와 동기화한다.
 */

import type { IR } from '@facet/core';

export const conditionalStatementIRs: IR[] = [];
