/**
 * 조각은 코드 패널을 두지 않으므로 IR 이 없다 (S-piece).
 *
 * 빈 배열이라도 자리를 지킨다 — `index.ts` 의 등록 순서가 여섯 파일 구성을
 * 전제하고, 뒤에 IR 이 필요해지면 여기가 그 자리다 (S-facet).
 */

import type { IR } from '@ffacet/core/runtime';

export const positionalValueIRs: IR[] = [];
