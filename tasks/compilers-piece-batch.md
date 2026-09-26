# 컴파일러와 언어 조각 서른여섯 — 배치 기록

2026-09-26. 서브도메인 여섯(어휘 분석 · 구문 분석 · 의미 분석 · 중간 표현 · 최적화 · 코드 생성)의 미구현 조각 전부를
흘려보냈다. 규범은 `piece-batch-protocol.md` · `piece-contract.md`. 같은 세션에서 완제품까지 닫았다(`compilers-whole-batch.md`).
worktree `facet-batch1` 에서 다른 세션과 나란히 돌렸다.

## 칸을 여덟으로 줄였다

검사기 vitest 워커를 둘로 묶은 뒤(`db9e0629`) 첫 병렬 배치라 칸을 열에서 **여덟**으로 줄였다. 감사 고침이 칸을 함께 차지해
한때 열둘까지 겹쳤지만 여유 메모리는 69~80% 에서 움직였고 PID 1 밑 고아는 끝까지 0 이었다. 고침 요청을 한꺼번에 몰리게 두지
않고 도는 고침이 줄 때 보냈다(한 번 셋을 붙잡아 두었다가 차례로 보냄).

## 흐름

```
사양 여섯 (서브도메인마다 하나, 7.1 ~ 12.6 분 · 0.12 ~ 0.15M)
사양이 오는 대로 쪼개 칸 8 에 — 하나 끝나면 대기열에서 다음
조각 하나 6.4 ~ 16.2 분 (대개 8 ~ 13)
감사 칸 밖 · 둘~셋씩 묶어 끝나는 대로
```

| 서브도메인 | 조각 |
| --- | --- |
| lexical | 7 — split-into-tokens · longest-match-wins · pattern-matches-set · backtrack-on-fail · state-eats-char · accept-state · nfa-to-dfa |
| parsing | 7 — rule-expands · derivation-tree · one-function-per-rule · lookahead-one · shift-or-reduce · parse-conflict · tree-drops-syntax |
| semantic | 4 — type-flows-up · type-mismatch · resolve-to-declaration · table-per-scope |
| ir | 6 — lower-to-simpler · assign-once · phi-merges · basic-block · edges-are-jumps · value-flows-to-use |
| optimization | 6 — fold-at-compile · unused-is-removed · hoist-invariant · unroll-loop · paste-the-body · inline-grows-code |
| codegen | 6 — registers-are-few · spill-to-memory · interference-graph · pattern-to-instruction · resolve-symbols · relocate-addresses |

처음에 "서른여덟" 로 셌다가 카탈로그를 다시 세어 서른여섯으로 바로잡았다.

**관성 계측** (서른여섯 한 번에): 평균 코드 유사도 **0.12** · 최고 **0.26**(state-eats-char ↔ accept-state) · 최고 좌표 겹침
**0.45**(pattern-matches-set ↔ type-flows-up) · 그림 어휘 **8종** · 운동 있는 조각 **35/36**. PASS.

## 분야 표기 — 층으로 갈랐다

컴파일러는 문법 자체가 소재라 `pseudo-notation.md` 의 "쓰지 않는다" 자리다. 여섯 사양 에이전트가 동시에 쓰므로 지시문에서 표기를
한 번에 정했다.

| 층 | 표기 |
| --- | --- |
| 원시 프로그램 | pseudo-notation 그대로 — 그 표기가 곧 장난감 언어 |
| 문법 | `Expr → Expr + Term \| Term`, 빈 것 `ε` |
| 정규식 | native, 기호는 이어 쓰기 · `\|` · `*` · `+` · `?` · 괄호 · `[0-9]` 뿐 |
| 세 주소 코드 · SSA | `t1 = b * 2` · `ifnot t1 goto L2` · `x3 = φ(B1: x1, B2: x2)` |
| 기계 명령 | 특정 CPU 가 아닌 가상 레지스터 기계 — `load r1, a` · `add r1, r2, r3` · `[sp+8]` |

소재 표기를 띄우는 조각은 `@notation native` 를 달았다. 서브도메인끼리 모형(토큰 종류 이름 · 낮추기 규약 · 나무 마디 이름)이 조금씩
달라도 맞추지 않기로 정했다 — 조각은 따로 선다.

## 사양에서 호스트가 정한 것

- 의미 분석: `+` 는 한쪽이 string 이면 string (pseudo-notation 의 `show "total " + total` 과 맞춤). 실행 횟수는 설명 글에서만.
- 최적화: 폴딩은 상수 전파 없이 — 그 둘레가 곧 폴딩의 둘레. 크기는 피호출 정의를 남긴 채 센다.
- 중간 표현: phi-merges 의 돌림 걸음은 둔다(들어온 쪽의 판을 고르는 것이 파이의 뜻).
- 구문: LR 표는 SLR(1) 로 짓고 "이 문법에서는 LALR(1) 과 같다" 를 설명 글이 밝힌다. 파스 나무는 구조(1차 데이터).
- 코드 생성: 상대 주소 S − P 는 명령 자기 주소에서 잰다. 실제 CPU 의 −4 는 설명 글이 밝힌다.

## 감사가 되풀이해 잡은 것

서로 못 보는 조각들이 같은 자리에 걸렸다. 앞의 셋은 여러 조각에서 되풀이되어 뒤에 도는 조각의 공통 안내문에 덧붙였고, 배치 끝에
`piece-contract.md` 함정 절에 옮겼다.

| 자리 | 걸린 수 | |
| --- | ---: | --- |
| 조용한 대체값 (`return scene` · `?? ''` · `?? 0` · `continue`) | 스물 남짓 | C6 |
| 그림이 반복 · 셈을 다시 돌림 (탄 옮김 · 할 일 목록 · 바퀴마다 읽는 칸 · 부른 자리 찾기) | 여섯 | S-scene |
| algorithm 이 scene 을 가져옴 (층 역방향) | 셋 | 원칙 1 — lower-to-simpler · assign-once · inline-grows-code |
| 캡션이 셈하지 않은 결론을 박음 ("파서는 여기서 멈춘다" · "다른 묶음 둘" · "그대로 하나") | 넷 | S-piece |
| 캡션의 수 ≠ 화면의 수 (지운 뒤 값을 판정 걸음에 · 이번 걸음 수와 누적을 같은 말로) | 셋 | S-piece |
| 같은 낱말 두 뜻 · 번호와 개수 같은 모양 · 같은 글자 조각 둘을 못 가름 | 넷 | common |

## 호스트 판단 — stage 가 algorithm 을 가져오는 것

`rules/principles.md` 1 절의 "View 는 Algorithm 을 참조하지 않는다" 를 두고 셋이 물었다. 저장소 stage **68 곳**이 이미 algorithm.ts 의
순수 함수 · 타입을 가져온다. 호스트는 이것을 받아들이고 **algorithm 이 scene · stage 를 가져오는 것만** 위반으로 셌다. principles 의 그
문장은 projector 시대의 것이라 Scene 방식에서 뜻(이벤트 · 상태를 거치지 않고 알고리즘의 셈을 부르지 않는다)을 다시 적을 거리다 —
규칙 문서는 이번에 고치지 않았다.

## 검사기 쪽 사정 — 고치지 않고 적어 둔다

- 전수 검사는 모듈이 내보내는 `register*` 를 모두 등록 함수로 인자 없이 부른다. 조각 이름이 `registersAreFew` 라 알고리즘 함수가 걸려,
  index.ts 에서 다시 내보내지 않는 쪽으로 피했다. 검사를 `register<Pascal>` 로 좁힐 거리.
- `facet-shot` 모음 PNG 에서 다크 테마 노란 바탕 위 `stateInk` 글자가 밝게 보였다(SVG 에는 `#171717` 로 들어가 있음) — 그림 도구 쪽으로 보임.

## 계측

- `piece-check` 36/36 통과(감사 고침 뒤 다시).
- `pnpm typecheck` 전체 통과.
- `vitest run` 2937 중 2936 통과 — 1건은 개념 메타 미연결로 예상된 실패(개념 배치에서 해소).

## 커밋

- `b563643d` feat(facets): 컴파일러와 언어 조각 서른여섯
