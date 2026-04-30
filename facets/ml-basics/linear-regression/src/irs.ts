/**
 * Linear regression facet IR — 1차 구현은 코드 패널을 두지 않으므로 빈 배열.
 *
 * 후속 작업으로 'gradient-step' phase 의 작은 코드 패널을 넣을 수 있다.
 * 그 시점에 IR + transpiler step builder 를 추가한다.
 */

import type { IR } from '@facet/core';

export const linearRegressionIRs: IR[] = [];
