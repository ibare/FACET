/**
 * 토큰화 facet 학습용 IR — 1차 구현은 코드 패널 미포함.
 *
 * concept type / 입력 반응형. 도식 자체가 본질을 담아 "언어별 코드 매핑" 의
 * 학습 가치가 작다. 향후 lex/regex/DFA 어휘 분기 비교 패널을 도입하면
 * tokenization-loop IR 을 정의하고 algorithm.ts 의 phase 어휘 (idle / scanning /
 * done) 와 동기화한다.
 */

import type { IR } from '@facet/core';

export const tokenizationIRs: IR[] = [];
