# 보안과 암호 완제품 다섯 — 배치 기록

2026-09-26. 조각 열아홉(`security-piece-batch.md`)을 흘려보내는 동안 origin 토픽 열둘을 판정했다(공격과 방어 넷은 조각 사양이 없어 판정 밖).
같은 세션에서 개념 메타까지 닫았다.

## 판정 — 열둘에서 다섯 (단독 하나 · 합침 넷 · 버림 0)

판정 에이전트 하나가 잣대 셋을 `judge-sim.py` 로 실측했다(15 분). 사용자가 합침 넷 · certificate 세움 · 없는 origin 아홉 옮김을 정했다.

| 완제품 | 넓힌 이름 | ← 합친 토픽 | 손잡이 |
| --- | --- | --- | --- |
| block-cipher | 블록 암호와 운용 모드 | aes-round · stream-cipher(CTR 로) | 모드 ECB/CBC/CTR × 라운드 1–4 × 바꾼 비트 평문/IV |
| ecc | 타원 곡선과 이산 로그 | diffie-hellman | 군 곱셈 mod 23 / 곡선 mod 17 × 비밀 k 아홉 칸 |
| sha | 해시와 메시지 인증 | mac-code · hmac | 방식 H(m)/H(K‖m)/HMAC × 공격 고치기/이어 붙이기 |
| collision | (그대로) | — | 출력 폭 4–12 비트 |
| certificate | 전자 서명과 인증서 | pki · auth-chain | 서명 대상 문서/요약 × 위조 곱하기/겹치는 짝/열쇠 바꿔 끼우기/가짜 뿌리 |

rsa 는 완제품 `asymmetric-rsa` 가 있어 판정하지 않았다(조각 easy-one-way-hard-back · trapdoor-with-key 의 origin).

**네트워크 분야와의 겹침이 합침의 근거가 됐다.** `networks/tls-handshake` 가 DH 교환(p 23 · g 5)과 엿듣기/끼어들기를, `certificate-chain` 이
사슬 거슬러 오르기를 이미 돌린다 — 단독 diffie-hellman · pki 는 그 판의 되풀이였다. certificate 는 축을 "CA 하나 × 위조 방법" 으로 갈라 섰다.

**없는 origin 아홉.** 이미 있던 해시 조각 일곱과 서명 둘은 카탈로그에 없는 토픽 `hash` · `signature` 를 origin 으로 가리키고 있었다.
sha ← hash-integrity · hash-avalanche · hash-chain · hash-salt · merkle-tree, collision ← hash-fixed-length · pigeonhole-collision,
certificate ← signature-key-direction · signature-on-hash 로 옮겼다.

## 사양 — 셋으로 나눠 병행

A 대칭(block-cipher, 8.8 분) · B 해시(sha · collision) · C 비대칭과 서명(ecc · certificate). B · C 는 사용량 한도로 끊겼다가 이어서 마쳤다.
**사양이 판정서의 동사를 둘 고쳤다** — block-cipher 의 "라운드 1 에서 2 비트 → 4 에서 11 비트" 는 ECB 첫 덩어리에서만 참(CBC 격자 합은
7 · 38 · 33 · 29 로 오르내림), ecc 의 "엿듣는 이의 A+B · A×B 는 K 가 아니다" 는 k 16 에서 A+B = K. 판정서 sim 에 동사 단언이 없었다 —
`whole-batch-protocol.md` 에 조항으로 옮겼다. 그 밖에 sha 의 이어 붙일 글을 `00` 에서 `ME` 로(패딩의 16진 `00` 과 섞여서), certificate 의
문서 그대로 판에 문서 번호 규칙을 지었다(설명 글이 "이 판이 지은 것" 으로 밝힌다).

## 흐름

완제품 칸은 조각이 거의 닫힌 뒤 열려 다섯이 함께 돌았다. 완제품 하나 11 ~ 17 분. 감사는 끝나는 대로 하나씩.

## 감사가 잡은 것

- **certificate** — 요약 × 곱하기 판 캡션이 화면에 없는 문서 번호(831 × 1191 = 52)를 말함(High) · 곱하기 둘째 서명을 `?? 0` 으로 지어냄(C6) ·
  설명 글이 "요약이면 곱하기가 막힌다" 를 범위 없이 단정.
- **sha** — 설명 글이 이어 붙이기 패딩 `80 00 00 40` 을 세 방식 모두에 단정(H(m) 은 `80 00 00 30`).
- **ecc** — 위반 0. 다만 비밀 k 손잡이 18 칸이 control-bar 에서 폭 약 440px 아래로 넘친다는 것을 감사가 `control-bar.ts` 를 읽어 찾았다.
  `control-label-fits` 는 손잡이 이름만 본다. 호스트가 아홉 칸(2 · 3 · 4 · 7 · 8 · 11 · 12 · 13 · 18)으로 줄이게 했다 — 세 동사(되찾는 셈 k−1 로
  곧게 · 가는 셈 오르내림 · k 2 · 3 에서 같음)가 그대로 서는 값으로. 계약 카드에 "구간 아홉 칸 이하" 를 옮겼다.
- **block-cipher** — 설명 글의 재생 길이 9.6 초는 사양이 걸음 넷 × 2.4 초로 센 값인데 마지막 걸음 뒤는 입력 대기라 실제 7.8 초 ·
  코드 패널 phase 가 ECB 만 상자 부름 줄을 켬. **collision** — 운동 await 뒤 판 세대 확인이 없어 되짚기 중 앞 판 값으로 그릴 수 있음 → 세대 번호로 끊고 테스트로 잠갔다.
- 지난 배치의 두 결함(phase 를 발신 뒤에 · 되짚기 때 무대가 한 벌씩 늘어남)은 프롬프트에 넣었고 **다섯 모두 테스트로 잠가 한 번도 걸리지 않았다.**

## 계측

whole-check 5/5 · 관성 평균 유사도 **0.06** · 최고 0.07 · 최고 좌표 겹침 0.33 · 그림 어휘 7 종 · 운동 5/5. PASS.

## 개념 메타

묶음 넷(대칭 여덟 · 비대칭 여섯 · 해시 일곱 · 서명 셋)을 에이전트 넷이 6 ~ 7.5 분에 썼다 — 스물넷. 비대칭 묶음은 이미 있는 완제품
asymmetric-rsa 아래 조각 둘도 맡았다. 묶음 안 definition 겹침 최고 0.35(compressBlockByBlock ↔ internalStateCarries, 짧은 쪽 기준).
이번엔 완제품 등록을 개념 메타 앞에 두어 `concept-covers-facets` 가 한 번도 멈추지 않았다. `concept:audit` 통과.

## 닫기

typecheck 통과 · `vitest --maxWorkers=4` 3325/3326 — 남은 하나는 `canvas-height` 의 시간 초과(60 초)로, 따로 돌리면 통과하지만 **59.9 초**
걸린다. 모든 facet 을 마운트하는 검사라 facet 이 늘수록 한계에 붙는다(세 세션이 나란히 돌아 부하 평균 14 였다). 고아 프로세스 0.

## 커밋

- `4e349684` feat(facets): 보안과 암호 완제품 다섯
- `1c7443d7` chore(catalog): 보안과 암호 완제품 다섯 등록
- `7217ce03` feat(authoring): 보안과 암호 개념 메타 스물넷
