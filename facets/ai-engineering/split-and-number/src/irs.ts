/**
 * 코드 패널 IR.
 *
 * 이 조각은 코드 패널을 두지 않는다 — 조각은 주장 하나를 그림으로 뒷받침하고
 * 멈추는 물건이라 여섯 언어로 갈리는 소스를 보일 자리가 없다 (S-piece).
 * 그래서 빈 배열이고, `index.ts` 의 등록 루프는 아무것도 돌지 않는다.
 */

import type { IR } from '@ffacet/core/runtime';

export const splitAndNumberIRs: IR[] = [];
