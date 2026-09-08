/**
 * 경로 압축은 조각(piece) facet 이라 코드 패널을 두지 않는다 (S-piece).
 * 빈 배열을 내보내 S-facet 의 6파일 구성을 그대로 지킨다.
 */

import type { IR } from '@ffacet/core/runtime';

export const pathCompressionIRs: IR[] = [];
