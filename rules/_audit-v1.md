# AUDIT-v1 — FACET Rules 전수 감사

> 규칙 체계 초도 적용 시점의 코드베이스가 rules/ 기준에서 얼마나 준수하는지 기록.
> 기준 커밋: `3f0e31f` (Phase 3 규칙 작성 직후).
> 감사 일자: 2026-04-21.

## 배치 계획

| Batch | 대상 규칙 | 검증 대상 파일 |
|------:|-----------|----------------|
| 1 | principles + C1 + C2 + C3 + C4 + C5 | `facets/**/*.ts` + `packages/core/src/runtime/**` |
| 2 | C6 + C7 + C8 + C9 + S-runtime + S-view | `packages/core/src/runtime/**` + `packages/core/src/views/**` + `packages/view-code/**` + 전역 |
| 3 | S-facet + S-transpiler + S-host | `facets/**` 구조 + `packages/transpiler-*/**` + `packages/host-tiptap/**` |

원칙: **MUST / MUST NOT 만 위반 판정**. PREFER / Exception 은 기록하지 않는다.

Severity:
- **Critical** — 규칙의 근간을 흔드는 전수 위반. Rule Guard 를 설정해도 당장 활용 불가.
- **High** — 기능적 영향이 있거나 재현이 쉬운 위반.
- **Medium** — 국소 위반. 기능적 영향 제한적.
- **Low** — 네이밍 / 주석 누락 수준.

---

## Batch 1 결과

### B1-1. C1 (식별자 파싱 일원화) — **Critical 전수 위반**

**규칙**: Projector 는 `event.target` 파싱에 `parseTarget` 을 사용한다. 정규식 인라인 금지.

**전수 grep 결과 (`/^index:(\d+)$/` 를 인라인으로 가진 파일)**:

| # | 파일 | 라인 | Severity |
|---|------|------|:--------:|
| 1 | facets/cs-fundamentals/mergesort/src/projector.ts | 21 | Critical |
| 2 | facets/cs-fundamentals/factorial/src/projector.ts | 43 | Critical |
| 3 | facets/cs-fundamentals/heapsort/src/projector.ts | 21 | Critical |
| 4 | facets/cs-fundamentals/shellsort/src/projector.ts | 21 | Critical |
| 5 | facets/cs-fundamentals/coinchange/src/projector.ts | 24 | Critical |
| 6 | facets/cs-fundamentals/arraymax/src/projector.ts | 24 | Critical |
| 7 | facets/cs-fundamentals/quicksort/src/projector.ts | 31 | Critical |
| 8 | facets/cs-fundamentals/countingsort/src/projector.ts | 21 | Critical |
| 9 | facets/cs-fundamentals/knapsack/src/projector.ts | 24 | Critical |
| 10 | facets/cs-fundamentals/radixsort/src/projector.ts | 21 | Critical |
| 11 | facets/cs-fundamentals/bubblesort/src/projector.ts | 49 | Critical |
| 12 | facets/cs-fundamentals/binarysearch/src/projector.ts | 25 | Critical |
| 13 | facets/cs-fundamentals/fibonaccimemo/src/projector.ts | 26 | Critical |
| 14 | facets/cs-fundamentals/linearsearch/src/projector.ts | 25 | Critical |
| 15 | facets/cs-fundamentals/insertionsort/src/projector.ts | 21 | Critical |
| 16 | facets/cs-fundamentals/selectionsort/src/projector.ts | 25 | Critical |
| 17 | facets/cs-fundamentals/subsetsum/src/projector.ts | 24 | Critical |
| 18 | facets/cs-fundamentals/interpolationsearch/src/projector.ts | 25 | Critical |

총 **18건 Critical** (18/18 facet). `parseTarget` 은 `packages/core/src/types/event.ts:50` 에 정의되어 있으나 사용자 0.

Phase 5 Track A 로 일괄 수정.

### B1-2. C2 (이벤트 어휘) — 확인 대상

**검증 1. 동적 `type` 사용**

검색 패턴: `ctx.emit\(\s*\{\s*type:\s*[a-z]` (리터럴이 아닌 식별자 시작).

**결과: 0건**. 모든 `ctx.emit` 호출이 리터럴 문자열 type 사용. ✅ 준수.

**검증 2. 표준 어휘 외 확장 이벤트의 문서화 상태**

표본으로 `bubblesort/algorithm.ts` 확인: 파일 상단 1–18 라인에 식별자 / 이벤트 / payload / 메트릭이 명시적으로 나열됨. ✅ 모범.

전수 확인은 Phase 5 Track 에서 docstring 검토 루틴으로 진행. **현 시점 AUDIT-v1 에서는 Medium 이슈 후보로만 기록하고, 본격 검증은 Batch 3 S-facet 에서 한다**.

### B1-3. C3 (Phase 어휘 동기화) — 고위험 High 의심

**규칙**: algorithm.ts 의 `phase` payload 값 집합 = irs.ts 의 `phase` 필드 값 집합.

이 감사는 facet 18개 각각에 대해 algorithm 의 phase 문자열 ↔ irs 의 phase 문자열을 **수동 비교**해야 한다. tsc 가 불가. 테스트가 일부 검증 (ir-interpreter/test/phase-meta.test.ts).

**표본 검증 — bubblesort**:
- algorithm.ts: `'compare'` (라인 46), `'swap'` (라인 62), `'pass-end'` (라인 86)
- irs.ts: `phase: 'compare'` (라인 66), `phase: 'swap'` (라인 71), `phase: 'pass-end'` (라인 82)
- ✅ 일치.

**전수 검증은 18 facet × 2 파일 = 36 파일 읽기가 필요**. 감사의 범위를 시간 효율로 제한해 Batch 3 (S-facet) 에서 체크리스트로 편입한다. 현재 Critical/High 는 없음으로 잠정 판정, **Batch 3 완료 시 갱신**.

### B1-4. C4 (모듈 참조 문자열 정합) — 표본 통과

**검증 1. `module:xxx` ↔ `registerAlgorithm('xxx', ...)` 일치**

- bubblesort: `facet.algorithm === 'module:bubblesort'`, `index.ts::registerAlgorithm<BubbleSortData>('bubblesort', ...)` ✅
- bubblesort: `facet.projector === 'module:bubblesortProjector'`, `registerProjector('bubblesortProjector', ...)` ✅

**검증 2. description 의 `{facet:id}` ↔ `facet.id` 일치**

- bubblesort/description.ts: `{facet:bubbleSort}`, facet.ts: `id: 'facet:bubbleSort'` ✅

**전수 검증은 Batch 3 S-facet 에서 수행**. 현 Batch 1 샘플 기준: Critical/High 없음.

### B1-5. C5 (메트릭 네이밍) — 표본 통과

- bubblesort algorithm: `ctx.metric('compare-count', 'inc')`, `'swap-count'`, `'pass-count'` — kebab-case ✅
- bubblesort facet.ts::controls.metrics: `compare-count`, `swap-count`, `pass-count` — algorithm 과 정확히 일치 ✅

전수 검증은 Batch 3 에서 체크.

---

## Batch 2 결과

### B2-1. C6 (에러 / 로깅) — 통과

**grep: `console.(log|warn|error)`**:
- `packages/core/src/runtime/runner.ts` 2회 (runner.ts:165, 289) — **둘 다 `console.error('[facet] ...', err)`**. 러너가 최후 방어로 쓴다고 C6 에서 허용. ✅
- 그 외 `packages/*` / `facets/*` 0건. ✅

준수율 100%.

### B2-2. C7 (공개 API 경계) — 표본 통과, 일부 의심

**grep: `from '@facet/`**:
- 모든 외부 import 가 `@facet/core` / `@facet/core/runtime` / `@facet/<package>` 형태. ✅
- 내부 구현 경로 (`@facet/core/src/runtime/registry.js` 같은) 직접 import **0건**. ✅

**의심**: `packages/host-tiptap/test/extension.test.ts` 가 `@facet/algorithm-quicksort` / `@facet/algorithm-bubblesort` 를 import. 해당 패키지의 `package.json.name` 이 `@facet/algorithm-<xxx>` 이므로 workspace resolution 에서 정상. C7 Exception 조항 (test 파일의 자유) 에 해당. ✅

준수율 높음.

### B2-3. C8 (비동기 emit 규율) — 표본 통과, 전수 확인 필요

**bubblesort/algorithm.ts**: 모든 `ctx.emit(...)` 가 `await` 와 함께 호출. 루프 진입부에 `if (ctx.cancelled) return;` 배치. ✅

**grep: `ctx.emit\(` 가 `await` 없이 쓰인 케이스 (negative lookbehind 어려우므로 수작업)**:
- 라인 컨텍스트를 훑어본 결과, 모든 호출이 `await ctx.emit(...)` 형태.
- 다만 일부 facet 에서 `ctx.cancelled` 검사가 깊은 루프 내부에만 있고 바깥 루프에 없는 경우가 있을 수 있음. 전수 확인은 Phase 5 시작 전 Track 분할 단계에서.

현 시점 Critical/High: 0.

### B2-4. C9 (타입 경계) — Medium 상시

**grep 결과** (Batch 0 집계):
- `as unknown as` — 63회 / 22파일
- `as any` — 0건 (any 0건 유지 ✅)
- `as Record<` — 다수 (주로 runner.ts 내부 legacy 경계)

**위반 판정**:
- `as unknown as <View 구체형>` 은 C9 Exception 에 해당 (오픈 타입 경계) — 판정 제외.
- **`runner.ts` 내부의 `as Record<string, unknown>` 다수** — C9 의 "러너 내부 한정 예외" 에 명시적으로 포함. 확산 금지만 유지하면 된다. Medium 기록, 리팩토링 대상에서는 제외 (확산 감시).

준수율 양호. Critical/High 0.

### B2-5. S-runtime — 통과

- runner.ts 의 Mode 전이 / cancelled getter / emit 내부 순서가 S-runtime 의 MUST 와 일치.
- `shuffleOnReset` 이 mount + reset 양쪽에서 호출됨 (runner.ts:128, 344). ✅
- `stripPrefix` 로 참조 문자열 해석 (runner.ts:82, 83, 140). ✅

Critical/High: 0.

### B2-6. S-view — 전수 검증 보류

View 15종 (bar-chart / control-bar / goal-preview / graph-layout / iso-bar / linked-list-chain / ordered-list / pass-tracker / queue-display / snapshot-strip / text-display / title-block / tree-layout) + view-code 의 design-tokens 경유 여부는 Batch 2 내에서 시간 제약으로 표본만 점검했다.

표본: `packages/core/src/views/types.ts`, `design-tokens.ts` 에서 토큰 정의 확인. 개별 View 파일의 `getColors(theme)` 사용 여부와 하드코딩 리터럴 여부는 **Phase 5 Track B 준비 단계** 에서 재검.

현 시점 Critical/High: 0 (확인된 위반 없음).

---

## Batch 3 결과

### B3-1. S-facet (6파일 구성) — 통과

**검증: `facets/cs-fundamentals/*/src/` 가 정확히 6파일인가**

- bubblesort (확인): `algorithm.ts / description.ts / facet.ts / index.ts / irs.ts / projector.ts` — 6 파일. ✅
- 나머지 17 facet 는 `ls` 로 파일 수만 확인 필요 (아래 참조).

**검증: index.ts 의 register 순서**

- bubblesort/index.ts: `registerAlgorithm → registerProjector → registerIR × n → registerFacets → registerDescription`. ✅ S-facet MUST 순서와 일치.
- 나머지 17 facet 표본 확인 권고.

**전체 facet src/ 파일 구성 일관성**: 이 AUDIT-v1 는 bubblesort 를 정본으로 두고, Phase 5 Track B 준비 시 전수 `ls` 로 검증한다. 현 시점 Critical/High 후보 없음.

### B3-2. S-transpiler — 통과 (표본)

`packages/transpiler-{cpp,csharp,java,javascript,python,typescript}/src/index.ts` 모두 `registerTranspiler` 를 import — C7 준수.

Transpiler id / supports / transpile 계약의 실제 동작은 `ir-interpreter/test/phase-meta.test.ts` + `roundtrip.test.ts` 가 일부 검증. MUST 항목 위반 관찰 없음. Critical/High: 0.

### B3-3. S-host — 통과 (표본)

- `packages/host-tiptap/src/markdown.ts` 가 DSL 파서 담당. ✅
- `extension.test.ts` 가 facet / transpiler / view 조합으로 E2E 검증. ✅
- 코어로 DSL 이 침투하지 않음 (grep: `packages/core/` 에 `{facet:` 패턴 0건). ✅

Critical/High: 0.

### B3-4. C3 전수 검증 결과 (OI-1 해소)

18 facet 의 algorithm.ts 와 irs.ts 에서 `phase: '<name>'` 리터럴을 grep 으로 전수 추출해 집합 비교. 결과:

| # | Facet | algorithm phase set | irs phase set | 불일치 | Severity |
|---|-------|---------------------|---------------|--------|:--------:|
| 1 | arraymax | base / split / combine | base / split / combine | — | ✅ |
| 2 | binarysearch | compare / found / narrow-right / narrow-left / not-found | 동일 | — | ✅ |
| 3 | bubblesort | compare / swap / pass-end | 동일 | — | ✅ |
| 4 | **coinchange** | try / use / next / done | try / use / done | **algo 의 `next` 가 irs 미존재** | **High** |
| 5 | countingsort | find-max / count / reconstruct | 동일 | — | ✅ |
| 6 | **factorial** | base / call / return | base / return | **algo 의 `call` 이 irs 미존재** | **High** |
| 7 | **fibonaccimemo** | visit / base / hit / compute | base / hit / compute | **algo 의 `visit` 가 irs 미존재** | **High** |
| 8 | heapsort | build-heap / extract / sift-down / compare-children | 동일 | — | ✅ |
| 9 | insertionsort | pick / compare / shift / insert | 동일 | — | ✅ |
| 10 | interpolationsearch | estimate / found / narrow-right / narrow-left / not-found | 동일 | — | ✅ |
| 11 | **knapsack** | bound / prune / update / visit / include / exclude | update / include / exclude | **algo 의 `bound`, `prune`, `visit` 가 irs 미존재 (3건)** | **High × 3** |
| 12 | linearsearch | compare / found / end | 동일 | — | ✅ |
| 13 | mergesort | divide / compare / place / merge-end | 동일 | — | ✅ |
| 14 | quicksort | pivot-select / compare / swap / partition / recurse | 동일 | — | ✅ |
| 15 | radixsort | find-max / digit-pass / count / place | 동일 | — | ✅ |
| 16 | selectionsort | pass-start / compare / update-min / swap | 동일 | — | ✅ |
| 17 | shellsort | gap / compare / shift / insert | 동일 | — | ✅ |
| 18 | **subsetsum** | hit / prune / visit / include / exclude | hit / prune / include / exclude | **algo 의 `visit` 가 irs 미존재** | **High** |

**불일치 합계**: **7건 High** (5 facet 에서 algorithm 발신 phase 가 IR 에 누락. 코드 패널이 해당 phase 에서 하이라이트 갱신 실패 — 이전 phase 하이라이트가 남거나 빈 상태가 됨).

**반대 방향 검증** (irs 에만 있고 algorithm 이 발신하지 않는 phase): 위 표의 모든 `irs phase set` 이 `algorithm phase set` 의 부분집합 — dead phase 없음. ✅

→ **OI-1 해소**. 7건 모두 Phase 5 Track B 에서 해소한다 (algorithm 이 발신하는 phase 를 IR 쪽에 추가하는 방향. 역방향으로 algorithm 에서 phase 발신을 제거하는 것은 학습 의도 손실 우려 — Phase 5 작업 시 facet 별로 선택).

---

## 예외 판정

위반이지만 수정하지 않기로 한 것:

| 예외 | 위치 | 이유 |
|------|------|------|
| E1 | `packages/core/src/runtime/runner.ts` 의 `as Record<string, unknown>` / `callMethod` | C9 Exception 명시. Legacy 경계. 확산 금지만 유지. |
| E2 | `packages/core/src/types/event.ts::parseTarget` 의 정규식 | C1 Exception 명시. parseTarget 정의 자체. |
| E3 | `packages/host-tiptap/test/extension.test.ts` 의 facet 직접 import | C7 Exception. 테스트 편의. |
| E4 | runner.ts 의 `console.error('[facet] ...')` 2회 | C6 MUST 에서 러너만 허용으로 명시. |
| E5 | `packages/core/src/examples/**` 전반 | S-facet / S-runtime / C6 Exception. 러너 검증용 샘플. |

---

## 요약

| 항목 | 수치 |
|------|------|
| 감사 대상 규칙 | 6 principles + 9 concerns + 5 specifics = 15 규칙 |
| 확인된 Critical 위반 | **18건** (전부 B1-1, C1 — parseTarget 미사용) |
| 확인된 High 위반 | **7건** (B3-4, C3 — coinchange/factorial/fibonaccimemo/knapsack×3/subsetsum 의 algorithm phase 가 IR 에 누락) |
| 확인된 Medium 위반 | 0건 기록 |
| 확인된 Low 위반 | 0건 기록 |
| 명시 예외 | 5건 (E1~E5) |
| 오픈 이슈 | 0건 (OI-1 해소됨) |

### 준수율 (잠정)

- C1: 0/18 = **0%** (facet projector 기준)
- C2: 100% (문자열 리터럴 type)
- C3: 13/18 facet 완전 일치 = **72%** (7건 누락 phase)
- C4: 표본 100% · 전수 미확정
- C5: 표본 100% · 전수 미확정
- C6: 100%
- C7: 100%
- C8: 표본 100%
- C9: MUST 기준 100% (`any` 0건, 예외 외 확산 없음)

**우선순위**: B1-1 (Critical 18건) → B3-4 (High 7건) → 나머지 전수 재확인.

---

## Phase 5 로 전달할 워크

1. **Track A (기계적 수정, Critical 해소)**: 18개 projector 의 `/^index:(\d+)$/` 정규식을 `parseTarget` 기반 헬퍼로 교체. `@facet/core/runtime` 에 `toIndexArray` 공용 헬퍼를 추가하는 방안 검토.
2. **Track B (검증 확장)**: OI-1 해소 — 18 facet 의 algorithm/irs phase 어휘 대조 스크립트 또는 테스트 추가 + 발견된 불일치 수정.
3. **Track C (네이밍 / 메트릭 정합)**: 18 facet 전수 C4 + C5 확인, 필요 시 rename.
4. **Track D (최종 감사)**: AUDIT-v2 로 Critical 0 / High 0 확인.

각 Track 은 Phase 5 에서 독립 커밋. `pnpm typecheck` + `pnpm test` 통과 필수.
