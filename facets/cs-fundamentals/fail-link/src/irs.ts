/**
 * fail-link 는 조각(piece)이라 코드 패널을 두지 않는다. IR 도 없다.
 *
 * 빈 배열이지만 파일은 둔다 — S-facet 의 5파일 구성이 고정이고, index.ts 가
 * 등록 순서대로 이 배열을 도는 짜임이라 여기만 비면 나머지가 그대로 통한다.
 */

import type { IR } from '@ffacet/core/runtime';

export const failLinkIRs: IR[] = [];
