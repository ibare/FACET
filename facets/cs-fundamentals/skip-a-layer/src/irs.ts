/**
 * skip-a-layer 는 조각이라 코드 패널을 두지 않는다. IR 도 없다 (S-piece).
 *
 * 빈 배열이지만 파일은 둔다 — S-facet 의 5파일 구성을 지키고, `index.ts` 의
 * 등록 순서가 IR 자리를 비워 두지 않게 하기 위해서다.
 */

import type { IR } from '@ffacet/core/runtime';

export const skipALayerIRs: IR[] = [];
