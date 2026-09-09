/**
 * 조각은 코드 패널을 두지 않는다 (S-piece). IR 은 비어 있고, 파일은 6파일 구성을
 * 지키기 위해 남는다 (S-facet).
 */

import type { IR } from '@ffacet/core/runtime';

export const pickNearestUnsettledIRs: IR[] = [];
