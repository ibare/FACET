/**
 * 전부 견주기 조각의 IR — **비워 둔다.**
 *
 * 조각은 코드 패널을 두지 않는다. 한 질문에 답하고 멈추는 물건이라 여섯 언어로
 * 갈린 소스를 곁에 두면 그림이 아니라 코드가 주인이 된다. IR 이 없으므로
 * 레이아웃에 `code-view` 블록도 없고 `algorithm.ts` 도 `phase` 를 발신하지
 * 않는다 — C3 은 all-or-none 이라 한쪽만 두면 안 된다.
 */

import type { IR } from '@ffacet/core';

export const compareWithAllIRs: IR[] = [];
