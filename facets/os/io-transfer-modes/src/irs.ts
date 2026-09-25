/**
 * IR — 두지 않는다.
 *
 * 셈이 곱셈 셋이라 코드 패널이 보일 것이 없고, 장치와 CPU 가 한 틱에 함께 도는 것은 IR 이 펴지 못한다.
 * 그래서 코드 패널 블록도 phase 도 없다.
 */
import type { IR } from '@ffacet/core';

export const ioTransferModesIRs: IR[] = [];
