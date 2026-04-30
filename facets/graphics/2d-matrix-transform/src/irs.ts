/**
 * 2D 행렬 변환 학습용 IR — 1차 구현은 코드 패널 미포함.
 *
 * graphics 도메인 시각이며 "언어별 코드 매핑" 의 학습 가치가 작아 IR 을 정의하지 않는다.
 * 표준 6파일 일관성을 위해 빈 배열로 자리만 보존한다. 향후 transformPoint(M, p) 또는
 * applyMatrix(grid, M) 의 의사 코드 패널이 추가되면 matrix-transform-imperative IR 을
 * 정의하고 algorithm.ts 의 phase 어휘 (demo / idle) 와 동기화한다.
 */

import type { IR } from '@facet/core';

export const matrixTransform2dIRs: IR[] = [];
