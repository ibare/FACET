/**
 * dirty-scan 은 조각이라 코드 패널이 없다. `FacetJson` 에도 `irs` 필드를 두지 않는다 —
 * 빈 배열은 index.ts 의 등록 루프가 아무것도 하지 않게 두기 위한 자리 채움이다.
 */
import type { IR } from '@ffacet/core';

export const dirtyScanIRs: IR[] = [];
