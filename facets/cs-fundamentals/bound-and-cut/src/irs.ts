/**
 * 조각은 코드 패널을 두지 않으므로 IR 이 없다 (S-piece).
 * 파일 구성은 S-facet 을 그대로 따르므로 빈 배열만 내보낸다.
 */

import type { IR } from '@ffacet/core/runtime';

export const boundAndCutIRs: IR[] = [];
