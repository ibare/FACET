/**
 * 조각(piece) 은 코드 패널을 두지 않는다 — 보일 것이 한 주장뿐이라 IR 이 없다 (S-piece).
 * 배열 자체는 index.ts 의 등록 순서를 S-facet 그대로 유지하기 위해 둔다.
 */

import type { IR } from '@ffacet/core/runtime';

export const growOneTreeIRs: IR[] = [];
