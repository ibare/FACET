# 컴파일러와 언어 완제품 열다섯 — 배치 기록

2026-09-26. 조각 서른여섯(`compilers-piece-batch.md`)을 흘려보내는 도중에 origin 토픽 스물(tokenization 은 이미 있음)을 판정했다.
같은 세션에서 개념 메타까지 닫았다.

## 판정 — 스물에서 열다섯 (단독 열하나 · 합침 넷 · 버림 하나)

잣대 셋(IR · 조작 · 통합, `whole-batch-protocol.md`)을 `judge-sim.py` 로 실측했다. 판정 에이전트는 버림 0 을 냈다 — 약한 칸이 둘
이상인 토픽이 없어서다. 사용자에게 합침 넷과 경계 셋을 물었다.

| 판정 | 완제품 | host ← 합쳐진 토픽 |
| --- | --- | --- |
| 단독 | regex-backtracking | regex |
| 단독 | finite-automata | fa |
| 합침 | parse-tree-to-ast | cfg("파스 나무와 AST") ← ast |
| 단독 | recursive-descent | recursive-descent |
| 단독 | lr-precedence | lr-lalr |
| 단독 | type-checking | type-check |
| 합침 | scope-and-symbols | scope-resolve("스코프와 심볼 테이블") ← symbol-table |
| 단독 | ssa-form | ssa |
| 합침 | flow-graphs | cfg-ir("흐름 그래프 — 블록과 사슬") ← dfg |
| 합침 | fold-and-sweep | constant-folding("상수 폴딩과 죽은 코드 제거") ← dce |
| 단독 | loop-optimization | loop-opt |
| 단독 | inlining-tradeoff | inlining |
| 단독 | register-allocation | register-alloc |
| 단독 | instruction-selection | instr-select |
| 단독 | linker | linking |

**사용자 결정** — 합침 넷을 받아들였다. `ir-design` 은 판정서가 cfg-ir 에 합쳤지만 단독으로는 조작 · 통합이 둘 다 약하고 흐름 손잡이가
조각 lower-to-simpler 의 주장(식 → 임시)을 흔들지 않아 **버리고 origin 만 cfg-ir 로** 옮겼다. regex 와 fa(시간 폭발 대 상태 폭발), instr-select 와
register-alloc 은 따로 두었다.

## 사양 — 셋으로 나눠 병행

A 앞단 다섯(22.4 분 · 0.29M) · B 가운데 넷(25.0 분 · 0.32M) · C 뒷단 여섯(25.6 분 · 0.31M). 판정서 끝의 "규약 요약" 한 장을 셋이 함께 읽었다.
사양 에이전트가 판정서와 다르게 정한 자리는 호스트가 받아들였다 — regex 는 "자리 하나에서 시작한 길을 다 대 봄" 을 한 걸음으로 묶고 대어 본 수는
기둥 높이로, recursive-descent 는 부름 하나 = 한 걸음(옮김 단위로는 20 초를 넘는다), fold-and-sweep 은 손잡이 하나를 폴딩 × DCE 둘로 가름,
linker 는 손잡이를 둘로 줄이고 링크 차례가 절 자리를 옮기게, instruction-selection 은 둘째 손잡이 "식" 과 명령 `li d, k` 를 더함.

## 흐름

```
판정 에이전트 하나 (19.6 분 · 0.29M) → judge.md + judge-sim.py — 조각이 도는 동안 칸 밖에서
사양 에이전트 셋 병행 (22 ~ 26 분)
whole-builder 열다섯, 조각이 다 끝난 뒤 칸 여덟로 흘려보냄 (11.1 ~ 21.0 분, 평균 약 16)
감사는 끝나는 대로 하나씩
```

열다섯 모두 reactive · IR 을 둔다. 모든 손잡이 조합에서 `runIR` 이 algorithm 과 같은 답을 내고, 데이터 차례(마디 · 이름 · 상태 · 파일 번호)를
섞어도 같다는 것을 facet 자신의 test 로 잠갔다.

## 감사가 되풀이해 잡은 것 — 계약 카드로 옮겼다

| 자리 | 걸린 수 | 옮긴 곳 |
| --- | ---: | --- |
| **되감기** — projector `onReset` 이 없거나 코드 패널만 끔 → 되감은 뒤 마지막 화면이 남음. 운동 도중 되감으면 걷히던 요소가 남음 | 여섯 | `whole-contract.md` projector 절 |
| **IR 이 모르는 종류를 `else` 로 몰아 답을 지어냄** (TS 는 던지는 입력) | 다섯 | `whole-contract.md` IR 절 |
| **description · 설명 글이 셈하지 않은 결론** ("반대로 움직인다" · "몸 길이만큼 는다" · "그 위로는 그대로다") | 셋 | `whole-contract.md` projector 절 |
| 가장 긴 판이 러너의 발신마다 100ms(`BASE_DELAY_MS`)를 더하면 20 초를 넘음 | 하나 | (register-allocation — stepMs 700 → 600) |
| camel 이 `register` 로 시작해 계약 이름이 `register*` export 가 됨 | 하나 | `whole-contract.md` 이름 절 |

되감기 결함은 `whole-check` 가 잡지 못한다 — 첫 감사(finite-automata)가 짚은 뒤 이미 끝난 완제품에는 확인을, 도는 완제품 일곱에는 알림을
보냈다. 알림을 받은 쪽은 모두 처음부터 `onReset` 을 두었다. 검사기에 "onReset 뒤 무대가 비는가" 를 더할 거리다.

## 카탈로그 정리

합친 넷의 토픽을 지우고 host 이름을 넓혔다. `ir-design` 은 항목째 지웠다. 옮겨진 조각의 origin 다섯을 host 로. `test/catalog-integrity.test.ts`
규모 하한 1008 → 1003 (사유는 검사 파일 주석).

## 계측

- `whole-check` 15/15 통과(감사 고침 뒤 다시).
- `pnpm typecheck` 전체 통과. `vitest run` 2937 중 2936 통과(개념 메타 미연결 1건은 개념 배치에서 해소).

## 커밋

- `25a44ac1` feat(facets): 컴파일러와 언어 완제품 열다섯
- `6d994da9` chore(catalog): 조각 서른여섯 · 완제품 열다섯 등록 · 토픽 다섯 정리
