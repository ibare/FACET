/**
 * gap-shrink 는 조각이라 코드 패널을 두지 않는다 (S-piece). 그래서 IR 도 없다.
 * 파일 구성은 S-facet 을 그대로 따르므로 자리만 지킨다.
 */

import type { IR } from '@ffacet/core/runtime';

export const gapShrinkIRs: IR[] = [];
