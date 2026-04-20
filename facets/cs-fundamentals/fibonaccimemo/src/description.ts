export const fibonaccimemoDescription = `## 피보나치 — 메모이제이션 (DP의 입문)

순수 재귀 \`fib(n) = fib(n-1) + fib(n-2)\`는 \`O(2^n)\`이다. 같은 값을 반복해서 구하기 때문.

**메모이제이션**: 한 번 구한 값을 캐시 → \`O(n)\` + 캐시 히트 표시.

{facet:fibonacciMemo}

### 시간/공간 복잡도

- 시간: **O(n)** — 각 인덱스를 한 번만 계산
- 공간: **O(n)** — memo 테이블 + 콜 스택

### 하향식 vs 상향식

- **Top-down (메모이제이션)**: 재귀 + 캐시. 코드가 정의식과 닮아 직관적.
- **Bottom-up (타뷸레이션)**: \`for k in 0..n: dp[k] = dp[k-1] + dp[k-2]\`. 스택 없음.

이 facet은 **하향식**을 시각화. 캐시 히트가 발생하면 보라색으로 표시.

### DP의 본질

겹치는 부분 문제(overlapping subproblems) + 최적 부분 구조(optimal substructure) → **DP가 적용된다.**
`;
