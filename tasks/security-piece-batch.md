# 보안과 암호 조각 열아홉 — 배치 기록

2026-09-26. 보안과 암호 서브도메인 다섯 가운데 넷(대칭 · 비대칭 · 해시 · 서명)의 미구현 조각 열아홉을 칸 열로 흘려보냈다.
worktree `facet-batch3` 에서 다른 분야 세션과 나란히 돌았다. 규범은 `piece-batch-protocol.md` · `piece-contract.md`. 같은 세션에서
완제품 · 개념 메타까지 닫았다(`security-whole-batch.md`).

## 흐름

```
사양 넷 (대칭 7 · 비대칭 5 · 해시와 서명 7 · 공격과 방어 8 — 6 ~ 10 분)
사양이 오는 대로 쪼개 칸 10 에 — 하나 끝나면 대기열에서 다음
조각 하나 7 ~ 12 분 (평균 9 분 안팎)
감사 칸 밖 · 끝나는 대로 둘~셋씩 · 지적은 만든 에이전트에게
```

| 서브도메인 | 조각 |
| --- | --- |
| symmetric | substitute-and-permute · round-key-mix · fixed-size-block · mode-chains-blocks · iv-makes-different · xor-with-keystream · never-reuse-keystream |
| asymmetric | easy-one-way-hard-back · trapdoor-with-key · mix-and-cannot-unmix · point-add-on-curve · smaller-key-same-strength |
| hash | compress-block-by-block · internal-state-carries · birthday-paradox · key-plus-message · hash-twice-with-pads |
| signature | binds-key-to-name · trust-anchor |

## 공격과 방어 여덟 — 보류

SQL 인젝션 · XSS · CSRF · 버퍼 넘침의 조각 여덟(data-becomes-code · parameterize-separates · injected-script-runs · escape-on-output ·
cookie-rides-along · token-proves-intent · overwrite-return-address · bounds-check-stops)은 **사양 에이전트가 안전 분류기에 세 번 막혀**
산출이 없다. 처음 한 번 막힌 뒤 범위 문서(장난감 세계만 · 교과서 한 줄 입력 · 버퍼 넘침은 이름 붙은 추상 칸)를 두고 웹 여섯 · 메모리
둘로 갈라 다시 띄웠으나 둘 다 막혔다. 에이전트들은 분류기를 비켜 가는 표현을 찾지 않고 멈췄고 호스트도 다시 띄우지 않았다 — 사용자
판단으로 넘겼다. 완제품 후보 넷(sql-injection · xss · csrf · buffer-overflow)도 판정 밖에 두었다. 막히기 전에 얻은 것: facet id 여덟은
저장소에 겹침이 없다 · SQL · HTML 글자를 쓰는 조각은 `@notation native` 로 표기 검사를 비킨다(본보기 `database/match-on-key`) ·
bounds-check-stops 는 `cs-fundamentals/out-of-bounds`(경계 검사가 막는 장면까지 있다)와 그림이 닮기 쉽다.

## 사양에서 호스트가 정한 것

- **장난감과 실물을 가른다** — 분야 지시문에 "구조는 실물과 같게, 크기만 줄인다 · 무엇을 줄였는지 설명 글이 밝힌다" 를 두었다.
  대칭 다섯이 Stinson 교과서의 장난감 SPN 하나(16 비트 · S-상자 4 비트 · 라운드 넷)를 같이 쓰고 교과서 값 26B7 → BCD6 으로 확인했다.
  해시 넷과 서명 둘은 장난감 H(상태 16 비트 · 덩어리 2 바이트 · 메르클-담고르 · IV 는 SHA-256 첫 단어의 앞 16 비트)를 쓴다.
- **이미 있는 이웃 조각은 머리 주석과 설명 글만 읽게 했다** — 같은 셈을 같은 규약으로 세려고. 해시 사양이 그렇게 읽다가
  `networks/certificate-chain` 의 요약(글자 코드값 합)이 자리 바꿈에 눈이 먼다는 것을 찾았다 — 열쇠 2419 대신 자리만 바꾼 2491 을
  끼우면 요약이 같아져 binds-key-to-name 의 주장이 거짓이 된다. 서명 둘은 H(tbs) mod n 으로 두었고 certificate-chain 은 고치지 않았다.
- 판단 자리는 모두 받아들였다 — point-add-on-curve 를 실수 위 곡선으로(모양이 보이게, 설명 글이 mod p 를 밝힘) · smaller-key-same-strength 를
  NIST 표를 1차 데이터로 · internal-state-carries 를 길이 늘이기의 원리로(화면에서 공격이라 부르지 않음) · substitute-and-permute 의 열쇠 0.

## 감사가 잡은 것

지난 배치에서 굳힌 방침(reduce 던짐 · initial 안 지어냄 · 좁히개)은 공통 안내문에 처음부터 있어 **한 번도 걸리지 않았다.** 걸린 것은
그 다음 층이다.

- **무대가 알고리즘 셈을 다시 돌림** 셋 — never-reuse-keystream(자리별 P2 견줌) · birthday-paradox(새 짝 수를 걸음 번호로) ·
  mix-and-cannot-unmix(오름 · 내림을 자취에서 셈, 권고). 모두 payload 로 옮겼다.
- **캡션의 수 ≠ 화면의 수 · 셈하지 않은 결론** 셋 — internal-state-carries("바이트 수 9" 인데 화면 칸 12) · trust-anchor(검증 결과를 보지
  않고 늘 "같다") · substitute-and-permute(섞기에서 "비트가 옮긴다" 인데 넷은 제자리).
- **설명 글의 사실** — compress-block-by-block 이 M 과 M‖00 을 가르는 것을 길이 필드 덕으로 적었다(실제는 끝 표시 `80`).
- 판정이 갈릴 뻔한 자리: 장면 `initial` 이 알고리즘의 export 함수(`messageBytes`)를 부르는 것은 계약 카드 134 · 226 행("바탕에서 정해지는
  작은 셈은 같은 함수를 부른다")에 맞다고 봤다.

## 호스트 도구에서 걸린 것

- 대기열 파일을 `sed 1d` 로 꺼내다 두 번 빼 compress-block-by-block 이 빠질 뻔했다 — 띄울 때만 뺀다.
- 사용량 한도로 에이전트 넷(감사 · 사양 둘 · 완제품 하나)이 끊겼고, 풀린 뒤 SendMessage 로 이었다. 고아 프로세스는 남지 않았다.
- `piece-inertia` 의 운동 신호가 `width` 변화를 세지 않아 smaller-key-same-strength(막대가 자란다)가 운동 0 으로 셈해졌다(18/19) — 도구 빈틈.
- i18n 검사가 `facet.ts` 를 글자로 읽어 도우미 함수로 채운 messages 를 "선언 없음" 으로 잡았다(point-add-on-curve · trapdoor-with-key) — 계약 카드에 옮겼다.

## 계측

- `piece-check` 19/19 · typecheck 통과.
- 관성: 평균 코드 유사도 **0.10** · 최고 0.17(iv-makes-different ↔ compress-block-by-block) · 최고 좌표 겹침 0.40 · 그림 어휘 8 종 ·
  운동 18/19(위 도구 빈틈). PASS.
- `scene-audit` 19/19 — 흔들림 0 · 왕복 어긋남 0 · 띠 없음 0 · 완주 못함 0 (사용자 vite 5175 — 이 worktree 의 것).

## 커밋

- `4f63a049` chore(catalog): 합침 일곱 · 없는 origin 아홉 옮김
- `711b9cd8` feat(facets): 보안과 암호 조각 열아홉
- `907d2224` chore(catalog): 보안과 암호 조각 열아홉 등록
