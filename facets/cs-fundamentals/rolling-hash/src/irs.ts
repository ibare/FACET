/**
 * 굴러가는 해시 조각은 코드 패널을 두지 않는다. 조각은 주장 하나를 그림으로
 * 뒷받침하고 멈추는 물건이라 IR 이 없다 (S-piece).
 */

import type { IR } from '@ffacet/core/runtime';

export const rollingHashIRs: IR[] = [];
