import type { IR } from '@ffacet/core';

/**
 * IR 을 두지 않는다 — 코드 패널도 없다.
 *
 * 이 완제품의 주장은 "부모가 바뀌면 해시가 바뀐다" 인데 그 셈이 FNV-1a(비트 연산 · 32 비트 곱)라 IR 어휘로
 * 옮길 수 없다. 갈라진 자리 찾기만 배열로 펴지지만, 그것만 코드 패널에 두면 화면의 주인공(새 해시 · 솟는
 * 병합 커밋)과 다른 곳을 비춘다. 알고리즘도 phase 를 보내지 않으므로 phase 집합(빈 집합)이 같다.
 */
export const rebaseVsMergeIRs: IR[] = [];
