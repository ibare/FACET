## 1. 검색 결과

컴파일러 토큰화의 시각화 사례를 학술/표준, 인기 해설, 인터랙티브 도구, 인접 도메인의 분해 메타포, 한국어 자료 다섯 갈래로 수집했다. 총 10개 레퍼런스를 채택했다.

- L1. Crafting Interpreters — Scanning 챕터 (Robert Nystrom)
- L2. Crafting Interpreters — Scanning on Demand 챕터 (C 구현)
- L3. Ruslan's Blog — Let's Build A Simple Interpreter Part 1
- L4. Wikipedia — Lexical analysis
- L5. AST Explorer (astexplorer.net)
- L6. The Tokenizer Playground (Hugging Face Xenova)
- L7. regex101 — 토큰 색상 매칭
- L8. VS Code — Syntax Highlight Guide (TextMate scope/token)
- L9. FSM Application: Lexical Analysis (swaminathanj.github.io/fsm/lexer.html)
- L10. youngju.dev — 컴파일러 04. 어휘 분석: 토큰, 패턴, 정규 표현식 (한국어)

## 2. 레퍼런스 요약

### L1. Crafting Interpreters — Scanning
- 출처: Robert Nystrom, Crafting Interpreters
- URL: https://craftinginterpreters.com/scanning.html
- 정체성: "한 글자씩 먹어가며 lexeme을 모으고, 끝나는 순간 토큰을 뱉는다"는 루프를 산문과 다이어그램으로 풀어낸 정전.
- 시각 객체: 원시 문자열, lexeme 구간을 묶은 박스, TokenType 라벨, line 번호.
- 시간 표현: `start`/`current` 두 인덱스 포인터가 좌→우로 전진. 한 토큰을 인식하면 `start = current`로 리셋.
- 메타포: "lexeme = 단어의 살, token = 단어 + 의미 라벨". 자연어의 단어 끊기와 명시적으로 비교.
- 강조점: 최장 일치 (예: `>=` vs `>`), 키워드는 식별자를 먼저 잡고 reserved table로 후처리.
- 인상 디테일: 책 본문 도식 — `var language = "lox";` 가 `var | language | = | "lox" | ;` 로 분절되는 그림.
- 약점: 정적 그림 위주, 애니메이션 없음. 공백/주석 스킵은 코드로만 보여주고 시각적 강조 약함.

### L2. Crafting Interpreters — Scanning on Demand
- 출처: 같은 책, C 구현 편
- URL: https://craftinginterpreters.com/scanning-on-demand.html
- 정체성: 한 번에 모든 토큰을 만들지 않고, 파서가 요청할 때마다 하나씩 토큰을 생성하는 lazy 모델.
- 시각 객체: 소스 포인터, "방금 잘라낸" 토큰 카드 한 장, 다음 토큰을 향한 화살표.
- 시간 표현: pull 기반. 외부 호출이 트리거가 되어 한 토큰씩 emit.
- 메타포: PEZ 디스펜서 — 한 알씩 떨어진다.
- 강조점: 메모리 효율, 토큰 객체에 시작 포인터+길이만 저장.
- 인상 디테일: 공백/주석은 토큰을 만들기 전 단계에서 "조용히 삼키는" 별도 절차.
- 약점: 그래픽이 거의 없고 텍스트 설명 위주.

### L3. Ruslan's Blog — Let's Build A Simple Interpreter Part 1
- 출처: Ruslan Spivak
- URL: https://ruslanspivak.com/lsbasi-part1/
- 정체성: 입문자 대상, "3+5"라는 한 줄 산수식이 토큰 스트림으로 분해되는 과정을 그림 한 장에 다이어그램으로 박은 글.
- 시각 객체: 입력 박스 → 토큰 박스 3개 (`INTEGER 3`, `PLUS '+'`, `INTEGER 5`), 박스 안에 (type, value) 표기.
- 시간 표현: `pos` 변수가 한 칸씩 이동하는 단계별 상태표.
- 메타포: 글자를 봉투에 담아 라벨을 붙이는 느낌. (type, value) 쌍이 일관되게 강조.
- 강조점: 정규식 없이 손으로 분기하는 아주 단순한 lexer.
- 인상 디테일: "현재 글자를 보고 → 그게 숫자면 연속 숫자를 다 먹어 INTEGER 토큰으로 묶는다"는 절차가 의사코드와 다이어그램으로 모두 노출.
- 약점: 흐름 자체는 단순한데, FSM/상태 그래프 같은 깊은 구조는 안 다룸.

### L4. Wikipedia — Lexical analysis
- 출처: Wikipedia (영어판)
- URL: https://en.wikipedia.org/wiki/Lexical_analysis
- 정체성: 토큰화 용어와 단계(scanner+evaluator)의 표준 정의서.
- 시각 객체: lexeme/token/pattern 삼각관계 표, 토큰 카테고리 표 (identifier, keyword, operator, literal, separator).
- 시간 표현: 단계 다이어그램 — Source → Scanner → Token Stream → Parser.
- 메타포: 자연어 형태소 분석과 동치라는 비유.
- 강조점: scanner(분리)와 evaluator(평가)의 2단계 구분, maximal munch 규칙.
- 인상 디테일: "공백·주석은 토큰을 생성하지 않고 버린다"는 점이 표 한 줄로 명시.
- 약점: 인터랙션·애니메이션 없음. 시각보다 분류학.

### L5. AST Explorer
- 출처: 커뮤니티 운영, 다중 파서 지원
- URL: https://astexplorer.net/
- 정체성: 좌측 코드 에디터 ↔ 우측 트리. esprima/acorn/babel 등 파서별 토큰·AST를 즉시 보여주는 인터랙티브 도구.
- 시각 객체: 코드 영역의 셀렉션이 트리 노드를 동시 하이라이트. 토큰 모드를 켜면 토큰 배열이 펼쳐짐.
- 시간 표현: 입력 즉시 재토큰화 (실시간). 단계 진행은 없고 결과 상태만 노출.
- 메타포: X-ray. 같은 코드를 두 가지 표현으로 동시 투사.
- 강조점: 커서 위치 ↔ 토큰/노드 상호 강조 (양방향 링크).
- 인상 디테일: 토큰 객체가 type, value, range, loc 필드를 실시간으로 갱신.
- 약점: "어떻게 잘렸는가"의 과정은 안 보여줌. 결과만.

### L6. The Tokenizer Playground (Xenova)
- 출처: Hugging Face Spaces
- URL: https://huggingface.co/spaces/Xenova/the-tokenizer-playground
- 정체성: NLP 토큰화 시각화의 사실상 표준. 입력 문장이 색칠된 청크 띠로 분해되어 보임.
- 시각 객체: 입력 텍스트가 그대로 인플레이스에서 색 띠로 잘림. 각 청크 옆에 정수 ID 표시.
- 시간 표현: 입력에 반응하는 실시간 재계산.
- 메타포: 형광펜으로 단어를 끊어 칠하는 행위.
- 강조점: "공백/특수문자도 토큰의 일부"라는 사실을 색으로 명시 (BPE/WordPiece 특유).
- 인상 디테일: 같은 문장이라도 모델별로 분절 결과가 다름을 토글로 비교.
- 약점: 컴파일러가 아니라 NLP 도메인. 그러나 "문자열 → 색칠된 토큰 띠"라는 시각 어휘는 직접 차용 가능.

### L7. regex101
- 출처: regex101.com
- URL: https://regex101.com/
- 정체성: 정규식 패턴별 매치 영역을 색상으로 칠하고, 토큰별 설명을 인스펙터에 띄우는 도구.
- 시각 객체: 입력 텍스트의 매치 구간이 캡처 그룹별 색상으로 칠해짐. 패턴 영역도 토큰 단위 색상 동기화.
- 시간 표현: 거의 즉시 매치. 사이드 패널에 토큰 트리(quantifier, group, char-class…) 펼쳐짐.
- 메타포: "패턴 ↔ 입력"의 양방향 색상 매칭. 호버 시 같은 색이 양쪽에서 빛남.
- 강조점: 토큰별 설명문, 그룹 색상, 매치 경계.
- 인상 디테일: 정규식 자체가 어휘 분석의 명세 언어이기 때문에, 토큰화의 "규칙 → 매치" 짝을 이미 시각화하고 있음.
- 약점: lexer 전용은 아님. 토큰 시퀀스라는 출력 자체보다는 단일 패턴의 매치에 초점.

### L8. VS Code — Syntax Highlight Guide
- 출처: Microsoft VS Code 확장 가이드
- URL: https://code.visualstudio.com/api/language-extensions/syntax-highlight-guide
- 정체성: TextMate grammar 기반의 토큰화 + scope 부여 + 테마 색상 적용 파이프라인 문서.
- 시각 객체: 코드 위에 떠오르는 scope 인스펙터 박스 — 현재 커서 토큰의 scope 사슬과 적용 색상 규칙을 동시에 표.
- 시간 표현: 라인 단위 점진 토큰화. 한 줄을 끝낼 때 상태 머신의 stack을 다음 줄로 이월.
- 메타포: 토큰 = 색상이 입혀진 코드 조각. "분류 → 색칠"이 곧 시각화.
- 강조점: 토큰의 중첩 scope 계층 (`source.js > meta.var > variable.other`).
- 인상 디테일: scope inspector를 켜면 코드 어떤 위치든 그 토큰의 분류 사슬을 즉시 노출.
- 약점: 의미 토큰(semantic token)과 구문 토큰의 차이를 이해해야 해서 입문자에겐 다소 무겁다.

### L9. FSM Application: Lexical Analysis
- 출처: J. Swaminathan 강의 자료
- URL: https://swaminathanj.github.io/fsm/lexer.html
- 정체성: lexer를 DFA 상태 그래프로 그려서 입력 문자가 화살표를 따라 이동하는 모습을 보여주는 페이지.
- 시각 객체: 원형 상태 노드, 문자 라벨이 붙은 전이 화살표, accept 상태(이중 원).
- 시간 표현: 한 글자 입력 → 한 전이. 단계별 상태 추적.
- 메타포: 미로/지하철 노선도. 글자가 다음 정거장으로 데려간다.
- 강조점: 식별자/숫자/연산자 각각의 DFA가 합쳐진 통합 상태 머신.
- 인상 디테일: 한 토큰이 끝났을 때 "accept 상태에 멈춰서 토큰을 출력하고 시작 상태로 되돌아간다"는 사이클이 시각적으로 명확.
- 약점: 정적 SVG 위주. 실시간 입력 시뮬레이터는 별도 도구(FSM Simulator 등)에 의존.

### L10. 어휘 분석 — 토큰, 패턴, 정규 표현식 (한국어)
- 출처: Chaos and Order 블로그 (youngju.dev)
- URL: https://www.youngju.dev/blog/compiler/04_lexical_analysis_basics
- 정체성: 한국어 학습자를 위한 토큰/패턴/렉심 3원어와 정규식 명세를 정리한 글.
- 시각 객체: 표 — 토큰 이름, 패턴(정규식), 예시 lexeme. `if`, `id`, `num`, `relop` 등.
- 시간 표현: 단계가 아닌 "명세 → 결과" 매핑 표.
- 메타포: "토큰은 단어의 품사, lexeme은 그 단어 자체."
- 강조점: token / pattern / lexeme 삼분법, 한국어 용어 정착.
- 인상 디테일: 학교 컴파일러 강의의 한국어 표준 정의에 가까움.
- 약점: 그림 거의 없음. 텍스트 표 중심.

## 3. 공통 요소

거의 모든 레퍼런스가 공유하는 시각 언어:

- **입력 문자열 띠**: 원시 소스 코드를 가로로 한 줄 띠로 펴 놓는다 (L1, L2, L3, L6, L7, L8).
- **스캔 커서/포인터**: `start`/`current`, `pos` 같은 인덱스가 좌→우로 전진하며 현재 보고 있는 글자를 표시 (L1, L2, L3, L9).
- **lexeme 구간 박스**: 한 토큰에 해당하는 글자들을 묶는 사각형/색 띠 (L1, L3, L6, L7, L8).
- **토큰 타입 라벨**: 색상 또는 텍스트 라벨로 의미 종류(IDENT, NUMBER, PLUS, KEYWORD…)를 부여 (L1, L3, L4, L5, L8, L10).
- **(type, value) 페어**: 토큰을 카드/봉투 형태로 표현하고 안에 두 필드를 새김 (L1, L3, L4, L10).
- **출력 토큰 시퀀스**: 입력 띠 아래 또는 옆에 잘려 나온 토큰 카드 행을 펼침 (L1, L3, L4, L5).
- **양방향 하이라이트**: 토큰을 가리키면 입력의 해당 구간이, 입력 구간을 가리키면 토큰이 빛남 (L5, L7, L8).
- **상태 그래프 오버레이(보조)**: DFA 노드와 전이 화살표로 분기 규칙을 보강 (L4, L9 — 학술 계열에서 강함).

## 4. 공백

레퍼런스가 약하게 다루거나 거의 다루지 않는 측면:

- **공백/주석의 "조용히 삼킴" 시각화**: 대부분 텍스트로만 "스킵한다"고 적고, 시각적으로는 그냥 사라진다. 삼켜진 흔적(반투명, 회색 슬러시)을 남겨 학습자가 "여기 글자가 있었지만 토큰이 안 됐다"를 보게 하는 사례는 드묾.
- **최장 일치(maximal munch)의 갈등 순간**: `>=`를 `>`로 자르고 끝낼 뻔하다가 한 글자 더 보고 다시 묶는 백트래킹/lookahead가 시각적으로 강조된 경우는 거의 없음.
- **키워드 vs 식별자 후처리**: 식별자로 잡은 뒤 reserved table 조회로 강등/승격되는 두 단계가 한 토큰 카드에서 라벨이 바뀌는 식으로 시각화된 사례 부재.
- **오류 토큰의 표현**: 인식 실패 글자를 빨간 토큰 카드로 띄우거나, 에러 복구(panic mode)를 거쳐 다음 토큰으로 넘어가는 모습이 거의 보이지 않음.
- **레인지/위치 메타데이터**: line·column 정보가 토큰에 붙는다는 사실은 글로만 언급되고, 시각적으로 토큰 카드에 좌표가 새겨진 사례는 AST Explorer 정도뿐.
- **상태 머신과 띠의 동시 표시**: DFA 그래프(L9)와 입력 띠(L1, L3) 두 시각이 한 화면에서 동기 애니메이션으로 함께 움직이는 사례는 거의 없음. 보통 둘 중 하나만 보여준다.
- **NLP 색칠 띠와 컴파일러 토큰의 결합**: L6·L7 같은 "인플레이스 색칠" 표현은 이미 강력한데, 컴파일러 도메인은 여전히 "입력 → 출력" 분리 표를 더 자주 쓴다. 두 표현의 융합은 비어 있음.

## 5. 대상 개념 요약

토큰화는 컴파일러의 첫 단계로, 사람이 쓴 소스 코드 문자열을 좌에서 우로 한 글자씩 읽어 의미 있는 최소 단위인 "토큰"으로 끊어 내는 변환이다. 끊는 기준은 각 토큰 종류(식별자, 숫자, 연산자, 키워드 등)에 정의된 패턴이며, 더 길게 매치되는 쪽을 우선해 한 덩어리로 묶고 종류 라벨을 붙여 출력한다. 공백과 주석은 보통 토큰이 되지 못하고 조용히 사라지며, 잘려 나온 토큰들의 줄이 다음 단계인 구문 분석기의 입력이 된다.
