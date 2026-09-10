/**
 * 조각은 코드 패널을 두지 않으므로 IR 이 없다 (S-piece).
 * S-facet 의 6파일 구성을 지키기 위해 빈 배열만 둔다.
 */

import type { IR } from '@ffacet/core/runtime';

export const assignThenMoveIRs: IR[] = [];
