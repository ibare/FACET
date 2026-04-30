## 1. 검색 결과

조건문(if/else, branching)을 시각적으로 다루는 사례를 학술/표준 문서, 인기 학습 플랫폼, 인터랙티브 시각화 도구, 그리고 다른 분야의 분기 메타포(이야기, 결정 트리, 게임, 철도 등) 영역에서 영어·한국어로 폭넓게 수집했다. 분류 보고서의 핵심 학습 질문("조건의 참/거짓에 따라 실행 경로가 어떻게 갈라지고, 어떤 분기 단 하나만 실행되는가?")과 "입력 반응형" 진행 모델을 염두에 두고, 정적 다이어그램(플로차트), 단계별 코드 실행 시각화, 물리적 행동 활동, 서사 분기 매핑 등 표현 양식을 다양화하여 9개 레퍼런스를 선정했다.

| # | 출처 | URL |
|---|------|-----|
| R1 | MDN Web Docs — if...else | https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/if...else |
| R2 | Edraw — A Guide to Making an If-Else Flowchart | https://www.edraw.ai/blog/if-else-flowchart.html |
| R3 | Scratch Wiki — If () Then, Else (block) | https://en.scratch-wiki.info/wiki/If_()_Then,_Else_(block) |
| R4 | Python Tutor — Visualize Code Execution | https://pythontutor.com/visualize.html |
| R5 | Code.org — Conditionals with Cards (Unplugged PDF) | https://code.org/files/ConditionalsHoC.pdf |
| R6 | Happy Coding — If Statements | https://happycoding.io/tutorials/processing/if-statements |
| R7 | 생활코딩(opentutorials) — 조건문 | https://opentutorials.org/course/743/4724 |
| R8 | ko.javascript.info — if와 '?'를 사용한 조건 처리 | https://ko.javascript.info/ifelse |
| R9 | Atlas Obscura — Maps of Choose Your Own Adventure(Christian Swinehart 시각화) | https://www.atlasobscura.com/articles/cyoa-choose-your-own-adventure-maps |
| R10 | Lucidchart — What is a Decision Tree Diagram | https://www.lucidchart.com/pages/decision-tree |

## 2. 레퍼런스 요약

### R1. MDN — if...else
- 출처/URL: Mozilla 공식 문서, https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/if...else
- 한 줄 정체성: 조건문의 표준 레퍼런스. 텍스트와 미니 코드 스니펫만으로 의미를 정의한다.
- 시각 객체: 코드 블록, 문법 다이어그램(BNF 스타일), 들여쓰기.
- 시간 표현: 없음. 정적 텍스트 정의.
- 메타포: "truthy/falsy"라는 언어적 분류. 시각 메타포는 사용하지 않는다.
- 강조점: 정확한 문법, 중첩, dangling else, block statement의 권장.
- 인상 디테일: "There is no elseif syntax" 같은 단호한 주의 문구.
- 약점: 초보자가 "왜 갈라지는가"를 직관적으로 잡기 어렵다. 시각 표현이 거의 0.

### R2. Edraw — If-Else Flowchart Guide
- 출처/URL: Edraw 블로그, https://www.edraw.ai/blog/if-else-flowchart.html
- 한 줄 정체성: 다이아몬드 결정 노드 + Yes/No 두 갈래 화살표라는 산업 표준 도식의 교과서.
- 시각 객체: 다이아몬드(decision), 사각형(action), 화살표, Yes/No 라벨, 종료 캡슐.
- 시간 표현: 위에서 아래로 읽는 정적 흐름. 화살표가 "다음에 실행될 것"을 암시.
- 메타포: 갈림길/분기점.
- 강조점: 조건 한 개 = 다이아몬드 한 개. 모든 가지가 결국 한 점으로 합쳐지는 구조.
- 인상 디테일: True/False가 아니라 Yes/No로 라벨링하여 일상어 친화.
- 약점: 변수의 실제 값이 어떻게 평가되는지(런타임 상태)는 보이지 않는다. 정적이라 "단 하나의 분기만 실행된다"는 동적 사실이 약하게 전달.

### R3. Scratch Wiki — If () Then, Else
- 출처/URL: Scratch 공식 위키, https://en.scratch-wiki.info/wiki/If_()_Then,_Else_(block)
- 한 줄 정체성: C자형 입 모양 블록이 "조건이 무언가를 감싸 안는다"를 형태로 보여주는 블록 코딩.
- 시각 객체: 노란색 제어 블록(C-shape), 육각형 조건 슬롯, 안에 끼워 넣어지는 명령 블록.
- 시간 표현: 실행 시 헤더가 하이라이트되며 위→아래로 흐름 표시.
- 메타포: "갈고리에 끼워 넣는 레고 블록". 조건 슬롯의 육각형은 boolean만 받는다는 형태적 제약.
- 강조점: 두 입 모양 칸이 "한쪽만 실행된다"를 시각적으로 분리. 구문 오류 자체가 불가능.
- 인상 디테일: 블록의 색상(노란색=제어)이 메뉴 카테고리와 일치해 카테고리 인지를 돕는다.
- 약점: 큰 프로그램에서 중첩 if/else가 깊어지면 들여쓰기 모양이 복잡해진다. 조건의 평가 과정 자체는 애니메이션되지 않음.

### R4. Python Tutor
- 출처/URL: pythontutor.com, https://pythontutor.com/visualize.html
- 한 줄 정체성: 코드 옆에서 "다음 실행될 라인"을 빨간 화살표로 짚으며 변수 상태를 같이 보여주는 단계 실행 시각화.
- 시각 객체: 코드 + 라인 포인터, 프레임/스택 박스, 변수→값 화살표.
- 시간 표현: 사용자 조작형 step forward/back. 시간 = 실행 단계.
- 메타포: 칠판에 강사가 그리는 추적도(execution trace).
- 강조점: 어떤 라인이 실행되었는가, 어떤 라인은 건너뛰었는가가 색상/포인터로 즉시 보임.
- 인상 디테일: if 조건이 false면 then-블록 라인을 시각적으로 통째로 건너뛴다 — "한 분기만 실행"이 가장 직접적으로 드러나는 사례.
- 약점: 조건이 true/false로 평가되는 그 순간의 "왜"는 보여주지 않는다. 식 평가 과정은 보이지 않음.

### R5. Code.org — Conditionals with Cards
- 출처/URL: Code.org 언플러그드 PDF, https://code.org/files/ConditionalsHoC.pdf
- 한 줄 정체성: 카드 색상/숫자에 따라 다른 행동을 하는 게임 규칙으로 if/else를 몸으로 익히는 활동.
- 시각 객체: 트럼프 카드, 규칙 카드("IF red, THEN +2 points; ELSE +1"), 점수표.
- 시간 표현: 한 라운드 = 한 번의 조건 평가. 라운드를 거듭하며 누적.
- 메타포: 게임의 규칙. 조건 = 카드 속성, 분기 = 행동.
- 강조점: 같은 규칙(if 문)이 매 라운드 입력(카드)에 대해 다르게 분기한다는 "입력 반응성".
- 인상 디테일: 학생이 직접 카드를 뒤집으며 분기를 수행하므로, 조건 평가가 신체 동작이 된다.
- 약점: 디지털 시각화 자체는 없음. 화면용 자산이 아니라 교실 활동.

### R6. Happy Coding — If Statements
- 출처/URL: happycoding.io, https://happycoding.io/tutorials/processing/if-statements
- 한 줄 정체성: Processing 캔버스의 시각 출력으로 "조건이 true일 때만 원이 그려진다"를 즉시 보여주는 인터랙티브 튜토리얼.
- 시각 객체: 코드 에디터 + 옆 캔버스. 조건 충족 여부에 따라 도형이 나타나거나 색이 바뀜.
- 시간 표현: 마우스 위치 같은 실시간 입력에 즉시 반응(입력 반응형).
- 메타포: "조건 = 카메라 트리거". 조건이 켜질 때만 그림이 나타난다.
- 강조점: 조건문의 효과를 추상 다이어그램이 아니라 "보이는 결과의 차이"로 보여준다.
- 인상 디테일: mouseX > 200 같은 단순 조건과 즉시 변하는 화면이 1:1 매칭.
- 약점: 하나의 분기가 아닌 전체 코드가 매 프레임 다시 도는 구조라, "단 한 번만 실행" 측면은 다소 흐려진다.

### R7. 생활코딩 — 조건문
- 출처/URL: opentutorials.org, https://opentutorials.org/course/743/4724
- 한 줄 정체성: "만약 ~라면"을 일상 언어 비유로 풀고, 코드 한 줄 한 줄을 자연어로 다시 읽어주는 한국어 입문 강의.
- 시각 객체: 코드 블록, 들여쓰기, 강사가 손으로 그린 화살표 도식(영상).
- 시간 표현: 강의 진행에 따라 코드를 한 줄씩 추가.
- 메타포: 우산 챙기기, 신호등 같은 일상 의사결정.
- 강조점: 조건의 boolean 결과가 분기 자체를 결정한다는 "참/거짓 → 경로" 인과.
- 인상 디테일: 같은 if를 두 번 실행하며 입력만 바꿔 결과가 달라지는 시연.
- 약점: 정지 화면에서는 시각이 빈약. 실행 흐름의 동적 표현은 영상에 의존.

### R8. ko.javascript.info — if와 '?'
- 출처/URL: 한국어 JS 튜토리얼, https://ko.javascript.info/ifelse
- 한 줄 정체성: if/else if/else와 삼항 연산자를 같은 도식 안에서 비교하며 "분기는 표현식으로도 쓸 수 있다"를 보여주는 한국어 표준 자료.
- 시각 객체: 코드, 표(if vs ? : 비교), 작은 다이어그램.
- 시간 표현: 정적.
- 메타포: 조건 = 질문, 분기 = 대답.
- 강조점: 조건의 truthy/falsy 변환과, if/else if 사슬에서 "위에서부터 만족하는 첫 분기 하나만" 실행됨.
- 인상 디테일: 같은 로직을 if-else와 ?로 두 번 써 보이며 사고를 동치 변환시키는 부분.
- 약점: 분기 평가 순서를 그림으로 강하게 보여주지는 않는다.

### R9. Christian Swinehart — Choose Your Own Adventure 시각화
- 출처/URL: Atlas Obscura 소개, https://www.atlasobscura.com/articles/cyoa-choose-your-own-adventure-maps (원본: samizdat.co/cyoa)
- 한 줄 정체성: CYOA 책 한 권 전체의 분기 구조를 거대한 트리/네트워크 그림 한 장으로 펼쳐 보이는 데이터 시각화.
- 시각 객체: 노드(페이지) + 엣지(선택지) 그래프, 색으로 구분되는 결말 종류.
- 시간 표현: 펼친 정적 그림이지만 독자가 시선으로 한 경로를 따라가며 "시간"을 재구성.
- 메타포: 도시 지도, 신경망, 강의 지류.
- 강조점: 한 사람의 독서는 그 거대 그래프에서 단 한 줄의 길이라는 점 — 단일 실행 경로의 미학.
- 인상 디테일: 막다른 결말은 굵고 짧은 가지로, 무한 루프는 닫힌 고리로 표시.
- 약점: 학습용이 아니라 예술/분석용. 초보자가 한눈에 if/else 한 개의 의미를 잡기엔 정보 과잉.

### R10. Lucidchart — Decision Tree Diagram
- 출처/URL: Lucidchart, https://www.lucidchart.com/pages/decision-tree
- 한 줄 정체성: "갈림길의 길잡이"라는 메타포로 조건 노드(사각형)·확률 노드(원)·결말(삼각형)을 구분하는 의사결정 트리 표준.
- 시각 객체: 사각형/원/삼각형 노드, 가지에 라벨된 선택지.
- 시간 표현: 왼쪽→오른쪽으로 시간이 흐른다는 약속.
- 메타포: 길/트리. 중요한 시각 메타포 — 한 번 갈라진 가지는 다시 합쳐지지 않음(if/else가 사실은 합쳐진다는 점과 흥미로운 대조).
- 강조점: 분기마다 누적되는 결과. 가지 끝의 결말이 명시.
- 인상 디테일: 노드 모양이 곧 의미(결정인지 우연인지)를 코드화.
- 약점: 코드의 if/else는 보통 결합점이 있고 반복도 있는 반면, 트리 메타포는 "절대 다시 안 만나는" 인상을 줄 수 있다.

## 3. 공통 요소

거의 모든 레퍼런스가 공유하는 시각 언어:

- **두 갈래 분기.** 한 점에서 두 화살표로 갈라지는 형태(R2, R5, R9, R10)는 if/else의 본질을 가장 짧게 표현. 블록 코딩(R3)도 한 블록에 칸이 두 개.
- **다이아몬드 또는 명시적 결정 노드.** 플로차트 계열(R2, R10)에서 조건만은 다른 도형으로 분리해 "여기서 평가된다"를 강조.
- **Yes/No 또는 True/False 라벨.** 가지에 반드시 이항 라벨이 붙는다(R2, R5, R9, R10).
- **위→아래 또는 왼→오른 시간축 약속.** 화살표 방향 = 실행 순서(R2, R3, R4, R10).
- **현재 상태/현재 라인 강조.** 동적 자료(R3, R4, R6)는 색·테두리로 "지금 여기"를 표시.
- **하나의 입력에 하나의 경로.** 명시적이든 암시적이든 "여러 분기가 동시에 실행되지 않는다"가 전제(특히 R3, R4, R5).
- **일상어 메타포.** "만약 ~라면", 갈림길, 게임 규칙, 신호등 등(R5, R7, R10).

## 4. 공백

레퍼런스가 다루지 않거나 약하게 다루는 측면:

- **조건식 평가의 내부 과정.** 대부분이 "조건이 true다/false다"의 결과만 보여줄 뿐, 변수 → 비교 연산 → boolean 값 도달 과정을 시각화하지 않는다. (Python Tutor도 라인 단위 step이라 식 내부는 추상화)
- **"실행되지 않은 가지"의 적극적 표현.** Python Tutor는 건너뛰는 라인을 단순히 지나가지만, 실행 안 된 분기를 회색·반투명·물리적으로 닫힌 문 등으로 강하게 보여주는 사례는 드물다.
- **연쇄 if/else if의 "위에서부터 첫 매칭"이라는 평가 순서.** ko.javascript.info(R8)가 살짝 언급할 뿐, 다이어그램에서 평가 순서를 명시하는 사례는 거의 없다.
- **분기 후 합류(merge).** 플로차트는 합류를 점으로 표시하지만, 결정 트리(R10)·CYOA(R9)는 합류 자체가 없다. 코드의 "if/else가 끝나면 같은 다음 줄로 모인다"가 학습자에게 또렷하지 않음.
- **입력값이 바뀔 때 분기가 어떻게 바뀌는지의 인터랙션.** R6 정도만 실시간 입력에 반응. 슬라이더나 토글로 "조건값을 직접 흔들어 보는" 표현은 매우 적다.
- **한국어 인터랙티브 시각화.** 한국어 자료(R7, R8)는 텍스트 중심. 한국어 학습자를 위한 동적·인터랙티브 if/else 시각화는 사실상 비어 있는 영역.
- **단일 분기 실행의 "배타성"의 강조.** 세 갈래 이상에서 "그중 단 하나만"이라는 사실을 형태로 보여주는 사례(예: 다른 분기가 어두워지거나 닫힘)는 드물다.

## 5. 대상 개념 요약

조건문은 코드가 한 줄씩 흐르다가 갈림길에 도착했을 때, 지금 들고 있는 값이 참인지 거짓인지를 보고 두 길 중 한 길만 골라 가는 약속이다. 같은 코드도 입력에 따라 어느 쪽 가지를 탔는지가 달라지고, 고르지 않은 다른 가지의 코드는 이번 실행에서는 단 한 줄도 동작하지 않는다. else if를 이어 붙이면 갈림길이 여러 단계로 늘어나지만, 그래도 학습자가 한 번 통과하면서 실행되는 길은 항상 그중 하나뿐이다. 갈림길이 끝나면 모든 길은 다시 한 줄로 모여 다음 코드로 이어진다.
