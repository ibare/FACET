/**
 * cache-invalidation 의 IR — 두지 않는다.
 *
 * 핵심 셈은 FNV-1a 열쇠 사슬(층 열쇠가 앞 층 열쇠를 품는다)이고 FNV 는 비트 연산(XOR · 32 비트 곱)이라 IR 어휘로
 * 옮길 수 없다. "첫 바뀐 층 뒤 전부" 만 IR 로 펴면(바뀐 층 자리 하나로 뒤를 세는 루프) 열쇠가 앞 층을 품는다는
 * 주장이 코드에서 사라지고, 코드 패널이 화면과 다른 곳(층 자리 셈)을 비춘다. 그래서 빈 배열을 내고 facet 은
 * 코드 패널 블록 · phase 를 두지 않는다.
 */
import type { IR } from '@ffacet/core';

export const cacheInvalidationIRs: IR[] = [];
