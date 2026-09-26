/**
 * 격리 수준과 잠금 — IR 을 두지 않는다.
 *
 * 일정 재생 · 잠금 표 · 대기가 맵과 집합이라 IR 로 펴면 코드 패널이 셈이 아니라 흉내가 된다. 수준의 차이는
 * 잠금을 언제 놓는가 한 줄인데, 그 한 줄을 보이려고 스케줄러 전체를 띄우게 된다.
 *
 * 그래서 코드 패널 블록도 phase 이벤트도 없다 — algorithm 과 irs 의 phase 집합이 둘 다 비어 같다.
 */
import type { IR } from '@ffacet/core';

export const isolationIRs: IR[] = [];
