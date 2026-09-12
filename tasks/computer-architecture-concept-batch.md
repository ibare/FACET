# 컴퓨터 구조 개념 메타 스물여덟 — 배치 기록

2026-09-12. 절차는 `tasks/concept-meta-batch-protocol.md` 에 있다.

## 묶음 아홉

완제품 하나 + 그것을 `origin` 으로 삼는 조각 전부가 한 묶음이고, 묶음 하나를
에이전트 하나가 통째로 썼다.

| 묶음 | 조각 | 계 |
| --- | --- | --- |
| `twosComplement` | positionalValue · negateAndAddOne | 3 |
| `floatingPoint` | mantissaAndExponent · unrepresentableFraction · unevenFloatGaps | 4 |
| `bitwiseOps` | bitMask · bitShift · byteOrder | 4 |
| `integerOverflow` | signedWraparound · silentTruncation | 3 |
| `cacheLine` | lineFill · temporalLocality · spatialLocality · latencyLadder | 5 |
| `directMappedCache` | indexAndTag · conflictMiss | 3 |
| `setAssociativeCache` | associativityRelief | 2 |
| `cacheReplacement` | **없음** | 1 |
| `writePolicy` | writeBackVsThrough · falseSharing | 3 |

개념 228 → **256**. 전수 **1512/1512** — 배치 내내 붉던 `concept-covers-facets` 가
닫혔다.

## 갈림을 만드는 기법이 셋 나왔고 서로 물려받았다

사양이 준 것은 "definition 이 갈리게 쓰라" 는 요구뿐이었는데 에이전트들이 각자 수단을
찾았고, 호스트가 그것을 **다음 묶음의 작성례로 넣어** 물려줬다.

**1. 어휘 배타** (부동소수점) — 상대의 낱말을 definition 에서 아예 쓰지 않는다.
`unevenFloatGaps` 는 `mantissa` · `exponent` · `bias` · `hidden one` 을 한 번도 쓰지
않고 거리 · 이웃 · 구간 · 개수로만 서고, `mantissaAndExponent` 는 `spacing` ·
`neighbour` · `gap` 을 쓰지 않는다. **화면이 실제로 그렇다** — 눈금 조각은 비트열을 한
번도 그리지 않는다.

> 하나는 한 수의 안쪽이고 하나는 한 수에서 다음 수까지다 — 뒤가 앞에서 따라 나오지만,
> 그것을 말하는 데 아무것도 분해할 필요가 없다.

**2. 주어 층위 가르기** (캐시 라인 · 오버플로) — 같은 사실을 다른 층위의 주어로 말한다.
`lineFill` 은 *캐시가 미스에서 하는 일*, `spatialLocality` 는 *프로그램의 버릇*.
`integerOverflow` 는 시간 축을 갖고(걸음마다 자라다 벽에 닿는다) `signedWraparound` 는
시간이 없다 — **넘어가는 걸음이 다른 걸음과 조금도 다르지 않다**는 것이 주장이다.

**3. 마주 보는 짝** (비트 연산) — 두 definition 의 꼬리를 교차시킨다. 마스크는
`each surviving bit stays at the weight it already had`, 시프트는 `each bit keeps its
value while the number doubles or halves`. **지키는 것과 바꾸는 것이 정확히 교차한다.**
증거도 화면에서 가져왔다 — `0xF0` 을 씌운 뒤 읽히는 수가 10 이 아니라 **160** 이다.

## 가장 위험했던 자리 — `cacheReplacement` ↔ 기존 `lruCache`

둘 다 "LRU" 를 자칭한다. 하나는 자료구조(해시맵 + 이중 연결 리스트로 O(1) get/put)이고
하나는 하드웨어 캐시가 축출 대상을 고르는 규칙이다.

어휘 배타로 정면 돌파했다 — 저쪽이 쥔 어휘(`key` · `entry` · `get` · `put` · `O(1)` ·
`hash map` · `linked list` · `capacity` · `implement`)가 이쪽 definition 에 **0 건**임을
기계로 확인했고, `exemplarKeywords` 도 저쪽 열 개와 **한 줄도 겹치지 않게** 골랐다.
이쪽은 *고르는 일* 의 어휘로만 선다.

`writePolicy` ↔ `writeBackVsThrough` 도 같은 방식이었다. 조각이 두 정책 이름과 대비
어휘를 독점하고 완제품은 그 다섯을 definition 에서 한 번도 쓰지 않는다. 이름을 넘긴
대가는 `exemplarKeywords` 로 갚았다 — 저쪽은 **대비 질의**("write-back versus
write-through"), 이쪽은 **결정 질의**("does deferring writes actually save anything").
키워드 자카드 유사도를 실제로 재서 **최대 0.074** 임을 확인했다.

## 호스트가 걱정한 것이 실제로는 없었다

한 에이전트가 "아직 없는 개념을 `contrastWith` 로 참조하면 미선언 참조가 된다" 고
신고했고, 호스트는 **배치 끝에 상호 참조를 채우겠다**고 계획했다. 조사해 보니
**미선언 참조가 0 건**이었다 — 격리된 아홉이 각자 실재를 확인하고 가리켰고, 한
에이전트는 형제가 만든 파일을 `git status` 로 확인해 무결성을 스스로 증명했다.

남은 것은 **한 방향만 걸린 링크 31 건**인데 이것은 결함이 아니다. `index.ts` 주석이
검증 범위를 명시한다 — *"materialize 가 contrastWith 참조를 검증한다. 미선언 id 는
오타를 뜻한다."* **대칭은 요구하지 않는다.** 각 개념이 제 자리에서 본 차이를 쓰는 것이
규범이고, 억지로 되걸면 에이전트들이 명시적으로 피한 "상대 note 를 뒤집어 되풀이하는"
것이 된다.

**못 본 것은 배치가 아니라 호스트의 예상이었다.**

## 곁가지로 얻은 것

- **개념을 쓰려고 화면을 정독한 에이전트가 코드 결함을 찾았다** — `write-policy` 의
  캡션이 줄 번호 대신 칸 번호를 보이던 것. 자세한 것은
  `tasks/cache-hierarchy-whole-batch.md` 에 있다.
- **`specializes` 를 쓸지 스스로 쟀다.** 저장소 200 여 개 중 2 건뿐이라 관행이 아니라고
  판단해 넷 다 생략했다. 이 세션에서 rule-guard 가 표본을 잘못 잡아 틀렸던 것과 반대
  방향의 처리다.
- **묶음 밖 이웃의 어휘까지 피했다.** `directMappedCache` 가 `temporalLocality` 의
  `working set` 을 보고 자기 키워드에서 뺐다 — 사양이 요구하지 않은 자리다.

## 감사 결과

```
개념 256개 · useWhen 767항목
useWhen 되풀이(70% 이상)   0
contrastWith 미선언 참조    0
빈 자리                    0
어휘 후보                  5  ← 전부 기존 개념의 오검출
```

어휘 후보 다섯은 `countingSort` · `scc` · `tryAndUndo` 로 **이번 배치가 만든 것이
0 건**이다. "word count" 는 글 분량이 아니라 세는 대상이고, "component" · "piece" 는
UI 부품과 체스 말이지 FACET 의 조각이 아니다.

## 호스트의 도구가 또 틀렸다

등록 스크립트가 `indexOf('[')` 로 배열의 여는 괄호를 찾았는데 타입 표기
`readonly FacetConceptSource[]` 의 `[` 를 먼저 집어, 선언이
`FacetConceptSource[\n  ] = [,` 로 쪼개지고 잘린 조각이 첫 항목 자리에서 `undefined` 가
됐다. **텍스트를 구조로 착각한 것**이고, 이 세션에서 세 번째다 — `catalog.json` 편집이
수정 전 문자열을 쓴 것, `grep -l` 이 주석을 호출로 읽은 것, 그리고 이번 것.

같은 응답에서 검증 문구도 거짓을 찍었다. `tsc` 가 실패했는데 `| head -5 && echo "OK"`
의 연결 때문에 성공 문구가 그대로 나왔다. **검증 문구가 검증 결과를 안 보고 있었다.**
그 뒤로는 exit code 를 변수에 받아 분기했다.
