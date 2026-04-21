# AUDIT-v2 — FACET Rules 재감사

> AUDIT-v1 에서 Critical 18건 / High 7건 을 Phase 5 Track A/B 로 해소한 뒤의 확인.
> 기준 커밋: `3e45101` (Phase 5 Track B 완료 직후).
> 감사 일자: 2026-04-21.

## 상태 변화 요약

| 항목 | AUDIT-v1 | AUDIT-v2 |
|------|---------:|---------:|
| Critical | 18 | **0** |
| High | 7 | **0** |
| Medium | 0 | 0 |
| Low | 0 | 0 |
| 예외 | 5 (E1~E5) | 5 (유지) |

---

## B1-1 재확인 — C1 (식별자 파싱 일원화)

**AUDIT-v1 결과**: 18개 projector 전수 Critical.

**적용된 수정 (Phase 5 Track A, 커밋 `9d0962b`)**:
1. `packages/core/src/types/event.ts` 에 `toIndexArray(target)` 헬퍼 추가 — 내부적으로 `parseTarget` 을 호출.
2. 18개 projector 의 중복 `function toIndex(target)` 제거, `import { toIndexArray } from '@facet/core/runtime'` 로 교체, 호출부 일괄 `toIndexArray(...)` 로 리네임.

**재검증 grep**:
- `function toIndex(` in `facets/**/projector.ts` → **0건** ✅
- `/\^index:\(\\d\+\)\$/` in `facets/**/projector.ts` → **0건** ✅
- `toIndexArray(` import → 18개 파일 ✅ (포함: factorial 까지)

준수율 C1: **18/18 = 100%**. Critical **0건**.

---

## B3-4 재확인 — C3 (Phase 어휘 동기화)

**AUDIT-v1 결과**: 5 facet 에서 algorithm → IR 누락 phase 총 7건.
- coinchange: `next` 누락
- factorial: `call` 누락
- fibonaccimemo: `visit` 누락
- knapsack: `bound`, `prune`, `visit` 누락 (3건)
- subsetsum: `visit` 누락

**적용된 수정 (Phase 5 Track B, 커밋 `3e45101`)**:
- **coinchange**: 외부 for-range body 끝에 `{ kind: 'continue', phase: 'next' }` 추가 → 코인 반복 전환을 IR 라인으로 표현.
- **factorial**: `return n * factorial(n-1)` 을 `var sub = factorial(n-1); return n * sub` 로 분리 → `phase: 'call'` 이 var 라인에, `phase: 'return'` 이 return 라인에 할당.
- **fibonaccimemo**: rec 진입부 첫 `if (k <= 1)` 스텝먼트에 `phase: 'visit'` 추가.
- **knapsack**: 학습용 단순화를 유지하면서 dfs 진입부에 `var ub (phase: 'bound')` + `if ub <= best (phase: 'prune')` 추가. base-case 통과 후 `var item = values[i] (phase: 'visit')` 로 방문 지점 표현.
- **subsetsum**: prune 가드 통과 후 `var item = arr[i] (phase: 'visit')` 삽입.

**재검증 grep** (algorithm phase set 과 IR phase set 이 정확히 일치):

| Facet | algorithm phase | IR phase | 일치 |
|-------|-----------------|----------|:----:|
| coinchange | done / next / try / use | done / next / try / use | ✅ |
| factorial | base / call / return | base / call / return | ✅ |
| fibonaccimemo | base / compute / hit / visit | base / compute / hit / visit | ✅ |
| knapsack | bound / exclude / include / prune / update / visit | 동일 | ✅ |
| subsetsum | exclude / hit / include / prune / visit | 동일 | ✅ |

나머지 13 facet 는 AUDIT-v1 시점에 이미 일치. 총 **18/18 facet** 이 일치.

준수율 C3: **18/18 = 100%**. High **0건**.

---

## 통합 검증

### 타입 체크 (`pnpm typecheck`)

- 전체 29 workspace 프로젝트 모두 Done, 에러 0건. ✅

### 테스트 (`pnpm test`)

- 25 test files × 178 tests 모두 통과. ✅
- `packages/ir-interpreter/test/phase-meta.test.ts` (38 tests) 포함 — bubblesort / quicksort phase 대조 기본 유지.
- facet별 통합 테스트 (마운트 + 실행 + reset) 정상.

### 예외 (E1~E5) — 유지

AUDIT-v1 의 예외 판정은 그대로 유지되며 변경 없음. 여기서 재나열하지 않는다.

---

## 요약

| 항목 | 수치 |
|------|------|
| 감사 대상 규칙 | 6 principles + 9 concerns + 5 specifics = 15 규칙 |
| Critical 위반 | **0건** (AUDIT-v1 대비 -18) |
| High 위반 | **0건** (AUDIT-v1 대비 -7) |
| Medium 위반 | 0건 |
| Low 위반 | 0건 |
| 예외 | 5건 (E1~E5, 유지) |

### 준수율

- C1: **100%** (18/18 projector)
- C2: 100%
- C3: **100%** (18/18 facet)
- C4: 표본 100% (전수는 Rule Guard 도입 후 자동화)
- C5: 표본 100% (전수는 Rule Guard 도입 후 자동화)
- C6 / C7 / C8 / C9: 100% (MUST 기준)
- S-runtime / S-view / S-facet / S-transpiler / S-host: 위반 0

---

## Phase 6 로 전달할 워크

1. `.claude/agents/rule-guard.md` — 리뷰 서브에이전트. `rules/INDEX.yaml` 의 trigger 를 참조해 PR / 편집 단위 검증.
2. `CLAUDE.md` — 프로젝트 루트 에이전트 가이드. 규칙 로딩 규약 명시.
3. `.claude/settings.local.json` — compaction hook 으로 `rules/` 의 축약본을 주입.
4. Phase 7 — Baden MCP 연동 (task start/complete, rule check, verify).
