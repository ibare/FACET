/**
 * 코드 패널 IR — 이 조각은 두지 않는다.
 *
 * 조각은 한 주장만 말하고 멈춘다. 여기서 보일 것은 addr(i) = base + i × unit
 * 한 줄이고, 그 한 줄은 이미 stage 의 명패와 관문 라벨에 적혀 있다. 코드 패널을
 * 붙이면 같은 말이 두 곳에 있게 된다.
 */

import type { IR } from '@ffacet/core/runtime';

export const indexAddressCalcIRs: IR[] = [];
