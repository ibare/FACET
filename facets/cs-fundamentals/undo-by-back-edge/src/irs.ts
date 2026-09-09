/**
 * 조각은 코드 패널을 두지 않는다 — 한 주장만 말하고 멈추는 그림이라
 * 여섯 언어로 갈리는 소스를 보일 자리가 없다 (S-piece).
 */

import type { IR } from '@ffacet/core/runtime';

export const undoByBackEdgeIRs: IR[] = [];
