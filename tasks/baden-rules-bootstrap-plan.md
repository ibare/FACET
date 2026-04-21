# Baden Rules Bootstrap — 실행 플랜

> 이 문서는 `tasks/baden-rules-bootstrap-guide-claude.md` 지침을 FACET 프로젝트에 적용하기 위한 **세션 간 지속 가능한 실행 계획**이다.
> 컨텍스트가 압축되거나 세션이 끊겨도, 이 문서와 `rules/_analysis.md` / `rules/_audit-v1.md` 만 읽으면 이어서 진행할 수 있도록 작성한다.

---

## 0. 세션 재개 프로토콜

**다른 세션에서 이어 받을 때는 반드시 아래 순서로 컨텍스트를 복원한다.**

1. `tasks/baden-rules-bootstrap-guide-claude.md` — 원 지침
2. `tasks/baden-rules-bootstrap-plan.md` — **이 파일**. 현재까지의 진행 상황을 `[x]` 체크박스로 추적
3. `rules/_analysis.md` (있다면) — Phase 1 산출물
4. `rules/INDEX.yaml` (있다면) — 규칙 매핑
5. `rules/_audit-v1.md` (있다면) — Phase 4 감사 결과
6. 체크리스트에서 가장 처음 `[ ]` 인 항목부터 재개

재개 시 “어디까지 했는지”는 커밋 기록 (`git log --oneline`) 과 파일 존재 여부로 판정한다. 이 플랜 파일의 체크박스를 최신 상태로 유지하는 것이 핵심 규율이다.

---

## 1. 프로젝트 스냅샷 (2026-04-21 기준)

- **유형**: TypeScript 라이브러리 + 데모 앱 (학습 플랫폼)
- **모노레포**: pnpm workspace (`packages/*`, `facets/*/*`, `apps/*`)
- **언어/프레임워크**: TypeScript 5.6, React (playground), Vite, Vitest, happy-dom
- **모듈 목록**
  - `packages/core` — 4-layer 러너 + View Catalog
  - `packages/host-tiptap` — Tiptap NodeView 어댑터
  - `packages/ir-interpreter` — IR 실행기
  - `packages/transpiler-{cpp,csharp,java,javascript,python,typescript}` — 언어별 트랜스파일러
  - `packages/view-code` — 코드 뷰 패키지
  - `facets/cs-fundamentals/{arraymax,binarysearch,bubblesort,coinchange,countingsort,factorial,fibonaccimemo,heapsort,insertionsort,interpolationsearch,knapsack,linearsearch,mergesort,quicksort,radixsort,selectionsort,shellsort,subsetsum}` — 18종 알고리즘
  - `apps/playground` — Vite + React 데모
- **규모**: TS/TSX 파일 약 **187개**
- **정적 분석**: `tsc --noEmit` (pnpm -r run typecheck), `vitest` 있음. **ESLint / Prettier 미확인**
- **기존 규칙 인프라**: `rules/` 없음, `.claude/` 없음, `CLAUDE.md` 없음 → **신규 구축**

### 핵심 아키텍처 원칙 (README 발췌)
1. DSL 은 끝까지 가볍다 (`{facet:id}`)
2. 알고리즘은 View 를 모르고, View 는 알고리즘을 모른다
3. Projector 가 번역기 — 이벤트 → View 메서드
4. View Catalog 는 공용 자산
5. 호스트는 무엇이든 될 수 있다 (코어는 호스트 독립)

**이 원칙들이 Rule 체계의 뼈대가 된다.**

---

## 2. 전제 조건 (확정)

이 Bootstrap 작업의 목적 자체가 **Baden 적용**이다. 아래는 결정 완료된 전제다.

- **ESLint 도입 안 함** — Rules 체계만 구축한다. 정적 분석 도구는 `tsc --noEmit` + `vitest` 현행 유지.
- **Phase 7 Baden 연동 필수** — 선택이 아니라 이 작업의 최종 목적. 반드시 수행한다.
- **Phase 5 리팩토링 깊이**: AUDIT-v1 의 **Critical / High 만** 해소. Medium / Low 는 기록만 남기고 후속 작업으로 둔다.
- **커밋 단위**: Phase 단위 1커밋. 단, Phase 5 리팩토링은 Track 단위로 분할 커밋.

전제가 바뀌면 이 절을 업데이트한다.

---

## 3. 전체 Phase 체크리스트

### Phase 1 — 프로젝트 분석
- [x] 1-1. 구조 파악 — `rules/_analysis.md` 의 "프로젝트 구조 분석" 절 작성
- [x] 1-2. 패턴 탐색 — 공통 패턴 / 안티패턴 수집 후 `_analysis.md` 에 추가
  - [x] 공유 인스턴스 생성 패턴 (registry, singleton 후보)
  - [x] import 방향 (core → algorithm 역참조 여부)
  - [x] 이벤트 emit 패턴 (`ctx.emit` 사용)
  - [x] Projector 의 `target` 식별자 파싱 패턴
  - [x] 하드코딩된 상수 (색상, 이벤트 타입, 식별자 prefix)
  - [x] 에러 처리 패턴 (try/catch, throw)
- [x] 1-3. 정적 분석 현황 정리 (tsc / vitest 범위, ESLint 부재 명시)
- [x] Phase 1 커밋: `chore(rules): Phase 1 프로젝트 분석 기록 추가`

### Phase 2 — 규칙 체계 설계
- [x] 2-1. `rules/` 디렉터리 생성 (`concerns/`, `specifics/` 포함)
- [x] 2-2. Tier 구조 초안 결정 (이 플랜의 §4 초안 참조)
- [x] 2-3. `rules/INDEX.yaml` 초안 작성 (파일 경로는 placeholder 허용)
- [x] Phase 2 커밋: `chore(rules): 규칙 체계 스캐폴딩 추가`

### Phase 3 — 규칙 작성
- [x] 3-1. `principles.md` — 6개 이하
- [x] 3-2. Concerns 작성 (9개 이하 목표, §4 초안 참조)
- [x] 3-3. Specifics 작성 (핵심 도메인만, §4 초안 참조)
- [x] 3-4. `INDEX.yaml` 최종화 (트리거 완성)
- [x] 3-5. `_analysis.md` 를 기반으로 규칙이 실제 코드와 일치하는지 자기 점검
- [x] Phase 3 커밋: `docs(rules): principles + concerns + specifics 초기 규칙 작성`

### Phase 4 — 초기 감사 (AUDIT-v1)
- [x] 4-1. `rules/_audit-v1.md` 에 감사 계획 기록 (배치 분할)
- [x] 4-2. Batch 1: Principles + Concerns 감사 → 위반 기록
- [x] 4-3. Batch 2: Specifics 감사 → 위반 기록
- [x] 4-4. Batch 3: 잔여 범위 감사 + C3 전수 검증 (OI-1 해소)
- [x] 4-5. 위반 severity 판정 (Critical 18 · High 7 · Medium 0 · Low 0)
- [x] 4-6. 예외 판정 → E1~E5 기록 (규칙 파일의 Exception 섹션과 정합)
- [x] 4-7. 준수율 산출 및 `_audit-v1.md` 요약 작성
- [x] Phase 4 커밋: `chore(rules): AUDIT-v1 결과 기록`

### Phase 5 — 리팩토링
- [ ] 5-1. Track 분할 문서 (`rules/_refactor-plan.md` 또는 plan 파일 내 §6)
- [ ] 5-2. Track A — 기계적 수정 (Critical 우선)
- [ ] 5-3. Track B — 구조 수정
- [ ] 5-4. Track C — 도메인 수정
- [ ] 5-5. 각 Track 완료 후 `pnpm typecheck` + `pnpm test` 통과 확인
- [ ] 5-6. AUDIT-v2 실행 (`rules/_audit-v2.md`)
- [ ] 5-7. Critical 0, High 0 달성 검증
- [ ] Track 별 커밋: `refactor(rules/<track>): ...`

### Phase 6 — Rule Guard
- [ ] 6-1. `.claude/agents/rule-guard.md` 생성
- [ ] 6-2. `CLAUDE.md` 생성 + Rule Guard 지침 추가
- [ ] 6-3. `.claude/settings.local.json` 컨텍스트 컴팩션 훅 설정
- [ ] Phase 6 커밋: `chore(rules): Rule Guard 서브에이전트 + hook 설정`

### Phase 7 — Baden 연동
- [ ] 7-1. 프로젝트 등록 (Baden 대시보드)
- [ ] 7-2. `CLAUDE.md` 에 Baden 보고 지침 추가
- [ ] 7-3. Rule Guard 에 HTTP 보고 섹션 추가
- [ ] 7-4. `INDEX.yaml` 연동 확인
- [ ] Phase 7 커밋: `chore(baden): Baden 연동 설정`

---

## 4. Rule 체계 초안 (Phase 3 실행 시 참고)

**이 초안은 README / 디렉터리 구조 / 아키텍처 원칙에서 연역한 가설이다.**
**Phase 1 분석 이후 반드시 재검토한다.** 분석 결과가 가설과 다르면 초안을 수정한다.

### Principles (6개 이하 후보)
1. **단일 방향 의존성** — 알고리즘은 View 를 import 하지 않고, View 는 알고리즘을 import 하지 않는다. 둘은 표준 이벤트·식별자로만 만난다.
2. **DSL 최소성** — DSL 에 로직을 추가하지 않는다. 모든 구체는 JSON 에 산다.
3. **레지스트리 경유** — Algorithm, Projector, View, IR, Transpiler, Facet 은 `register*` 를 통해서만 접근한다. 직접 import 로 참조하지 않는다.
4. **이벤트 어휘 표준화** — `highlight` / `mark` / `state-changed` / `phase` / `done` 등 표준 이벤트만 사용한다. 이벤트 이름을 임의로 만들지 않는다.
5. **Projector 가 유일한 번역기** — 알고리즘 이벤트 → View 메서드 매핑은 Projector 에서만 수행한다.
6. **View Catalog 재사용** — 새 알고리즘이 기존 시각화로 충분하면 View 를 추가하지 않는다. 새 View 는 공용성이 있을 때만 만든다.

### Concerns 후보 (최대 9개, 조정 예정)
- **C1. 식별자 문법** — `index:N` / `node:A` / `edge:A-B` 등의 표준 식별자 문법을 준수. 파싱/생성 지점 일원화.
- **C2. 이벤트 타입 상수화** — 이벤트 `type` 문자열 리터럴 직접 사용 금지. 중앙 상수 참조.
- **C3. Phase 어휘 동기화** — 알고리즘 emit 의 `phase` 이벤트 어휘와 IR 의 `phase` 어휘가 일치해야 함.
- **C4. 모듈 참조 문자열** — `algorithm: 'module:xxx'` 형식의 참조 문자열은 등록된 id 와 반드시 일치.
- **C5. 메트릭 네이밍** — `compare-count`, `swap-count` 등 메트릭 키의 kebab-case / 의미 일관성.
- **C6. 테스트 위치 / 네이밍** — 각 패키지의 `test/` 위치와 `*.spec.ts` 네이밍.
- **C7. 공개 API 최소화** — 패키지 `src/index.ts` 에서만 export. 내부 파일 직접 참조 금지.
- **C8. 비동기 이벤트 흐름** — `await ctx.emit(...)` 누락 금지 (이벤트 드롭 방지).
- **C9. 타입 안전 / 암묵 변환 금지** — `any` 사용 제한, `as` 단언 최소화.

### Specifics 후보 (핵심 도메인만)
- **S-algorithm** — `facets/cs-fundamentals/*` 내부: `algorithm.ts` / `projector.ts` / `irs.ts` / `transpilers.ts` / `facet.ts` / `index.ts` 역할 분리 준수.
- **S-view** — `packages/core/src/views/*`: View 인터페이스 계약, design-tokens 사용.
- **S-transpiler** — `packages/transpiler-*`: 언어별 트랜스파일러 입출력 계약, phase 어휘 매칭.
- **S-runtime** — `packages/core/src/runtime/*`: 러너 / registry / event bus / layout-builder 내부 규율.
- **S-host** — `packages/host-tiptap/*`: NodeView 격리, DSL 식별자 파싱.

### INDEX.yaml 트리거 초안
- `S-algorithm` → paths: `facets/**/*.ts`
- `S-view` → paths: `packages/core/src/views/**`
- `S-transpiler` → paths: `packages/transpiler-*/**`
- `S-runtime` → paths: `packages/core/src/runtime/**`
- `S-host` → paths: `packages/host-tiptap/**`
- `C*` 는 events / patterns / imports 기반으로 전역 트리거

---

## 5. 감사 배치 계획 (Phase 4)

- **Batch 1**: `principles.md` + `C1 ~ C5` → `packages/core/**` + `facets/**/projector.ts`
- **Batch 2**: `C6 ~ C9` + `S-runtime` + `S-view` → `packages/core/**` + `packages/view-code/**`
- **Batch 3**: `S-algorithm` + `S-transpiler` + `S-host` → `facets/**` + `packages/transpiler-*/**` + `packages/host-tiptap/**`

각 Batch 완료 시 `rules/_audit-v1.md` 에 위반 로그 누적. 세션이 끊기면 다음 세션은 `_audit-v1.md` 를 읽고 다음 Batch 부터 재개.

---

## 6. 리팩토링 Track 초안 (Phase 5)

AUDIT-v1 결과 이후 확정. 일반적으로:
- **Track A**: rename / import 정리 / 이벤트 타입 상수화 등 기계적 수정
- **Track B**: 레지스트리 경유로 리팩토링 / 직접 import 제거 / 책임 분리
- **Track C**: Phase 어휘 / 식별자 문법 / 메트릭 네이밍 정합화
- **Track D**: AUDIT-v2 실행

Critical → High → Medium → Low 순서. 각 Track 별로 독립 커밋. `pnpm typecheck` + `pnpm test` 통과 필수.

---

## 7. 운영 규칙

- **이 플랜 파일은 살아있는 문서다.** 진행하면서 체크박스를 갱신하고, 가정이 틀렸으면 즉시 수정한다.
- **대규모 작업은 반드시 커밋 단위로 경계**를 두어 세션이 끊겨도 `git log` 로 복원 가능하게 한다.
- **추측 금지** — 규칙 작성 전에 반드시 해당 코드를 읽고 패턴을 확인한다.
- **새 규칙을 만들기 전에 정적 분석(tsc)으로 커버 가능한지 먼저 판단**한다. tsc 로 이미 잡히는 것은 규칙에 넣지 않는다. ESLint 를 도입하지 않으므로, tsc 가 못 잡는 의미/맥락 규칙은 전부 Rules 에서 관리한다.
- **의사결정 변경은 §2 에 기록**한다. 플랜 전체를 재작성하지 않는다.

---

## 8. 진행 로그 (append-only)

> 각 세션 종료 시 짧게 남긴다. 한 줄 요약 + 다음 세션이 볼 진입점.

- 2026-04-21 — 플랜 초안 작성. Phase 1 미착수. 다음 진입점: §3 Phase 1-1.
- 2026-04-21 — Phase 1 완료. `rules/_analysis.md` 작성. 18개 projector 에서 `parseTarget` 미사용 + 정규식 중복 확인 (A1). 다음 진입점: §3 Phase 2-1.
- 2026-04-21 — Phase 2 완료. `rules/INDEX.yaml` 작성 (C1~C9 + S-facet/S-view/S-runtime/S-transpiler/S-host). concerns/, specifics/ 디렉터리 생성. 다음 진입점: §3 Phase 3-1 (principles.md).
- 2026-04-21 — Phase 3 완료. principles.md + C1~C9 + S-facet/S-view/S-runtime/S-transpiler/S-host 규칙 본문 작성 (총 15개 규칙 파일). tsc strict + 프로젝트 내 실제 패턴 (bubblesort 모범) 기반. 다음 진입점: §3 Phase 4-1 (AUDIT-v1 배치 분할).
- 2026-04-21 — Phase 4 완료. `rules/_audit-v1.md` 기록. Critical 18건 (C1 parseTarget 미사용 전수) + High 7건 (C3 phase 미동기 coinchange/factorial/fibonaccimemo/knapsack×3/subsetsum). 다음 진입점: §3 Phase 5-1 (Track 분할).
