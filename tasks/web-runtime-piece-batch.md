# 웹 런타임 조각 서른셋 — 배치 기록

2026-09-25~26. 웹 런타임 서브도메인 다섯(이벤트 루프 · 렌더링 파이프라인 · 재조정과 반응성 · 프레임과
애니메이션 · 로딩 순서)의 미구현 조각 전부를 칸 열로 흘려보냈다. 규범은 `piece-batch-protocol.md` ·
`piece-contract.md`. 같은 세션에서 완제품까지 닫았다(`web-runtime-whole-batch.md`).

## 세션이 한 번 죽었다 — 재개 기록

사양 다섯 서브도메인이 전부 도착하고 칸 10(rendering-pipeline 7 · frame-budget 3)이 도는 중에 호스트
세션이 비정상 종료됐다. 스크래치패드(`state.md` · 서브도메인별 `specs.md`/`spec-*.md`/`common.md`/
`prompt-*.md`)가 온전히 남아 있어 새 세션이 그대로 이어받았다 — 사양을 다시 쓰지 않고 준비된 프롬프트
파일을 그대로 재사용했다. **"호스트 상태 — 세션을 짧게, 상태는 파일에" 절이 의도한 그대로 작동한
사례다.** 이미 파일이 존재하는 열 조각을 `piece-check` 로 재검증하니 아홉은 그대로 통과했고 하나
(`just-before-paint`)만 실패했다 — 원인은 조각이 아니라 호스트 도구(`scripts/i18n-audit.mts`)의 결함이었다
(아래).

## 흐름

```
사양 다섯 (서브도메인마다 하나, 6.7 ~ 8.9 분 · 0.11 ~ 0.12M)
사양이 오는 대로 쪼개 칸 10 에 — 하나 끝나면 대기열에서 다음
조각 하나 13.8 ~ 23.1 분 (평균 17.4)
감사 칸 밖 · 서브도메인이 닫히는 대로 등록
```

| 서브도메인 | 조각 | 관성(전체 33 종 한 번에 잼) |
| --- | --- | --- |
| rendering-pipeline | 7 | — |
| frame-budget | 6 | — |
| event-loop | 7 | — |
| reconciliation | 7 | — |
| resource-loading | 6 | — |

**관성 계측 (33종 전체, 서브도메인을 가르지 않고 한 번에)**: 평균 코드 유사도 **0.08**(임계 0.35) · 최고
**0.18**(`side-by-side-trees` ↔ `dirty-scan`, 임계 0.50) · 최고 좌표 겹침 **0.44**(`one-grows-rest-shift` ↔
`side-by-side-trees`, 임계 0.60) · 그림 어휘 **8종**(임계 5) · 운동 있는 조각 **32/33**(임계 70%). PASS.

## 호스트 도구에서 발견·수정한 결함

**`scripts/i18n-audit.mts` 의 `block()` 이 데이터 필드 이름과 부딪혔다.** `messages:` 라벨을 첫
occurrence 로 찾는데, `just-before-paint` 의 algorithm 데이터가 마침 `messages: [...]`(메시지 이벤트
배열)라는 필드를 가져 그 자리를 i18n 블록으로 오인했다 — 실제 문안 선언(`facet.ts` 의 `messages: {...}`)을
통째로 놓쳐 `facet-i18n.test.ts` 가 "선언 없이 부르는 키" 열여덟 개로 실패했다. `label` 다음 첫 비공백
문자가 `{` 인 occurrence 만 고르도록 고쳐 해결(커밋 `a83c401e`). 기존 facet 179개 전수 재검증에서 회귀
없음을 확인했다.

## 사양에서 호스트가 정한 것

- 걸음 경계 사이 phase 하이라이트, `stepMs` 재생 길이(운동 포함해 20초 이내), view id `<디렉터리명>-stage`
  규약은 `piece-contract.md` 그대로.
- 다섯 서브도메인이 native 표기(`@notation native`) — 화면의 코드 글자가 실제 HTML/CSS/DOM API/JS 그 자체.
  code = data, `messages` 에 두지 않는다.
- 재생 길이는 "걸음 = 운동 + stepMs" 로 셈했다(운동을 안 더해 20초를 넘긴 전례가 있어 이번엔 처음부터 넣음).

## 감사가 잡은 것

**위반 1건(Medium)**: `microtask-starvation` 의 stage 가 60Hz 프레임 경계 공식(`k×1000/60`)을 algorithm 과
별도로 재구현 — "바탕에서 결정되는 셈은 장면·그림이 같은 함수를 부르게 한다" 조항 위반. algorithm.ts 에서
`frameBoundaryMarks()` 를 export 해 stage 가 그 함수를 부르도록 고쳤다(만든 에이전트에게 돌려보내 해결).
그 외 32종은 위반 0.

## 계측

- `piece-check` 33/33 통과.
- `pnpm -r typecheck` 전체 통과.
- `pnpm test` 2330개 중 2329 통과(1건은 개념 메타 미연결로 예상된 실패 — 완제품 배치에서 함께 해소).
- `scene-audit` 33/33 — 흔들림 0 · 왕복어긋남 0 · 띠없음 0 · 완주못함 0(포트는 이 worktree 자신의 vite).

## 커밋

- `a83c401e` fix(scripts): i18n 문안 블록 파서가 데이터 필드 이름과 부딪힌다
- `d4bcc1b3` feat(facets): 웹 런타임 조각 서른셋
