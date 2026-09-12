/**
 * 이 조각의 IR — **비워 둔다.** 조각에는 코드 패널이 없다.
 *
 * 조각은 질문 하나에 답하고 멈추는 물건이라 여섯 언어로 갈린 소스를 곁들일
 * 자리가 없다. 코드 패널은 완제품의 산출물이다 (원칙 6).
 *
 * 뒤따르는 규약: `facet.ts` 에 `code-view` 블록을 두지 않고 `algorithm.ts` 도
 * `phase` 를 발신하지 않는다. C3 은 all-or-none 이라 한쪽만 두면 안 된다.
 */

import type { IR } from '@ffacet/core';

export const coarseThenFineIRs: IR[] = [];
