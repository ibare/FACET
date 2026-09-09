/**
 * 조각은 코드 패널을 두지 않으므로 IR 이 없다 (S-piece).
 *
 * 빈 배열이라도 파일을 남기는 것은 S-facet 의 6파일 구성 때문이다 — 구조가
 * facet 마다 갈리면 등록 순서를 훑는 눈이 매번 다른 모양을 봐야 한다.
 */

import type { IR } from '@ffacet/core/runtime';

export const cycleBlocksOrderIRs: IR[] = [];
