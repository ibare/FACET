/**
 * 조각은 코드 패널을 두지 않는다 (S-piece — 블록은 stage 와 controls 뿐).
 * 파일 구성을 맞추기 위해 빈 배열만 둔다 (S-facet 6파일).
 */

import type { IR } from '@ffacet/core/runtime';

export const markVisitedOrLoopIRs: IR[] = [];
