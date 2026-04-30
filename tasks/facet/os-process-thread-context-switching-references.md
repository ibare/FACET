# 컨텍스트 스위칭 — 시각화 레퍼런스 분석

대상: 컨텍스트 스위칭 (Context Switching) — 운영체제의 프로세스와 스레드
전제: type=systemBehavior, 진행 모델=시간 진행형 — 시간축 위에 사건을 펼치는 시각화에 가중치.

## 1. 검색 결과

총 9개 레퍼런스. 학술 교재 3종, 강의 자료 2종, 해설 사이트 2종, 영상 해설 1종, 인터랙티브 시뮬레이터 1종.

1. OSTEP — "Limited Direct Execution Protocol (Timer Interrupt)" (Remzi & Andrea Arpaci-Dusseau, Wisconsin)
   https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-mechanisms.pdf
2. Silberschatz, Galvin, Gagne — "CPU Switch From Process to Process" (FSU 강의 슬라이드 캐시본)
   https://www.cs.fsu.edu/~lacher/courses/COP4610/lectures_9e/ch06.pdf
3. Tanenbaum — Modern Operating Systems Ch.2 슬라이드 (BYU 사본)
   https://jeapostrophe.github.io/courses/2016/spring/308/notes/dist/slides-MO-ch2.pdf
4. MIT 6.S081 — "Scheduling" 강의 슬라이드 (xv6 swtch)
   https://pdos.csail.mit.edu/6.828/2021/slides/6s081-lec-threads.pdf
5. Wikipedia — Context switch
   https://en.wikipedia.org/wiki/Context_switch
6. GeeksforGeeks — Context Switching in Operating System
   https://www.geeksforgeeks.org/operating-systems/context-switch-in-operating-system/
7. Computerphile — "OS Context Switching" (Steve Bagley)
   https://www.youtube.com/watch?v=DKmBRl8j3Ak
8. Process Scheduling Visualizer (인터랙티브 간트 차트 시뮬레이터)
   https://simulations4all.com/simulations/process-scheduling-visualizer
9. 한국어 — wikidocs "CPU 스케줄링 및 문맥교환" / 문맥 교환 위키백과
   https://wikidocs.net/65528 ,  https://ko.wikipedia.org/wiki/%EB%AC%B8%EB%A7%A5_%EA%B5%90%ED%99%98

## 2. 레퍼런스 요약

### 2.1 OSTEP — Limited Direct Execution Protocol
- 출처: Wisconsin OSTEP 교재 6장
- URL: https://pages.cs.wisc.edu/~remzi/OSTEP/cpu-mechanisms.pdf
- 한 줄 정체성: "두 프로세스 + 운영체제 + 하드웨어" 4열 흐름표
- 시각 객체: 세로 4 열(하드웨어 / 운영체제(타이머) / 프로세스 A / 프로세스 B). 각 열은 시간이 아래로 흐르는 좁은 띠. 타이머 인터럽트가 발생하면 프로세스 A 열의 활동이 끊기고 OS 열로 화살표가 점프, OS 열에서 "save regs(A) → k-stack" / "restore regs(B) ← k-stack" 두 줄이 강조됨.
- 시간 표현: 세로축 단방향, 사건은 가로 화살표(인터럽트, return-from-trap)로 열을 건너뜀.
- 메타포: 사무실 트랙 4 줄에서 누가 지금 펜을 쥐는가.
- 강조점: 사용자 모드↔커널 모드 전환과 두 종류의 저장(하드웨어 implicit / 소프트웨어 explicit)의 분리.
- 인상 디테일: kernel stack 을 작은 박스로 그려 register 가 push 되는 순서를 표시.
- 약점: 단일 코어 가정, 캐시/TLB 무효화는 본문에서만 언급.

### 2.2 Silberschatz "CPU Switch From Process to Process"
- 출처: Operating System Concepts 9e Ch.3-4
- URL: https://www.cs.fsu.edu/~lacher/courses/COP4610/lectures_9e/ch06.pdf
- 한 줄 정체성: 두 PCB 박스 사이를 ㄹ 자로 가로지르는 실행선
- 시각 객체: 화면 좌우에 PCB0 / PCB1 박스, 각 PCB 안에 register 슬롯. 가운데에 가로 시간선 같은 실행선이 process 0 → "save state into PCB0" → idle → "reload state from PCB1" → process 1 형태로 위아래로 꺾여 내려간다.
- 시간 표현: 위에서 아래. "executing" 구간은 굵은 선, "idle" 구간은 얇은 점선.
- 메타포: 두 명의 주자가 같은 트랙(CPU)을 번갈아 뛰는 릴레이.
- 강조점: 저장-복원 호출 한 쌍이 한 번의 스위치를 만든다는 대칭 구조.
- 인상 디테일: idle 구간이 의도적으로 길게 그려져 "오버헤드" 시간감을 시각화.
- 약점: 트리거 사건(왜 스위치가 일어나는지) 정보 없음, 인터럽트/시스템콜 구분 없음.

### 2.3 Tanenbaum — Modern OS Ch.2
- 출처: Andrew S. Tanenbaum, Modern Operating Systems 3e
- URL: https://jeapostrophe.github.io/courses/2016/spring/308/notes/dist/slides-MO-ch2.pdf
- 한 줄 정체성: 프로세스/스레드의 "공유 vs 사적" 표 + 프로세스 상태 다이어그램
- 시각 객체: 프로세스 박스 안에 여러 thread 의 PC/stack/register 가 사적 영역으로, address space/files 가 공유 영역으로 분리된 구획도. 별도 그림에서 running ↔ ready ↔ blocked 3 상태 원이 화살표로 연결.
- 시간 표현: 직접적 시간축 없음. 상태 전이 그래프로 "사건이 일어나면 어디로 간다"를 표현.
- 메타포: 한 사무실(프로세스)에서 책상은 공유, 작업노트(thread context)는 개인.
- 강조점: 프로세스와 스레드의 컨텍스트 양 차이 — 무엇이 저장되고 무엇이 그대로 남는가.
- 인상 디테일: thread 가 사적으로 가지는 항목 / 프로세스가 사적으로 가지는 항목을 두 칸 표로 대조.
- 약점: 시간 진행이 없어 "스위치 한 번"의 사건 구조가 보이지 않음.

### 2.4 MIT 6.S081 — Scheduling (xv6 swtch)
- 출처: Adam Belay 강의 슬라이드
- URL: https://pdos.csail.mit.edu/6.828/2021/slides/6s081-lec-threads.pdf
- 한 줄 정체성: 두 커널 스레드의 stack 단면 + swtch 가 register set 둘을 맞바꿈
- 시각 객체: 좌우 두 개의 세로 stack 그림(thread A 의 kstack, thread B 의 kstack). 가운데 CPU 의 register 파일(rip, rsp, callee-saved 들). swtch 호출은 양 스택의 context 영역으로 register set 을 "복사해 넣고 빼오는" 두 화살표.
- 시간 표현: 시간보다 메모리 단면 강조. 스위치 직전/직후 상태를 두 컷의 정지 화면으로 비교.
- 메타포: 책갈피 — 책(스택)에 끼워둔 페이지(register set)를 빼서 다른 책에 끼우기.
- 강조점: "callee-saved register 만 저장한다"는 swtch 의 최소성, scheduler 라는 별도 thread 를 거쳐 가는 양단 구조.
- 인상 디테일: 두 thread 가 서로의 코드를 직접 호출하지 않고 scheduler 를 가운데 두고 만남.
- 약점: 사용자 프로세스 차원의 큰 그림은 약함.

### 2.5 Wikipedia — Context switch
- 출처: en.wikipedia.org
- URL: https://en.wikipedia.org/wiki/Context_switch
- 한 줄 정체성: 같은 흐름표를 단순화한 입문용 다이어그램
- 시각 객체: 두 프로세스 가로 띠 + 가운데 OS 활동 띠. 저장/복원 구간을 회색 박스로 칠해 "쓸모없는 시간"으로 시각화.
- 시간 표현: 가로축 단방향 시간.
- 메타포: 없음 — 직접 도식.
- 강조점: 오버헤드 = 화면의 회색 칸의 폭.
- 인상 디테일: process / kernel mode 전환을 띠 색으로 구분.
- 약점: 정적 이미지 한 장으로는 사건의 인과(왜 스위치) 표현이 약함.

### 2.6 GeeksforGeeks — Context Switching in Operating System
- 출처: geeksforgeeks.org
- URL: https://www.geeksforgeeks.org/operating-systems/context-switch-in-operating-system/
- 한 줄 정체성: P0 / P1 두 가로 띠 + 양쪽에 PCB 박스
- 시각 객체: 좌우에 PCB0 / PCB1 직사각형, 가운데에 두 프로세스의 실행 띠가 시간 따라 진행. 인터럽트 시점에 "save state into PCB" / "reload state from PCB" 라벨이 붙은 화살표가 띠와 PCB 박스를 잇는다.
- 시간 표현: 가로축 시간. executing 구간만 띠가 굵음, 나머지는 idle.
- 메타포: 바통 터치 — register 라는 바통을 PCB 라는 사물함에 넣었다 빼는.
- 강조점: PCB 가 외부 사물함이고 register set 이 그 안의 내용물이라는 관계.
- 인상 디테일: 화살표가 두 종류 — 저장 방향과 복원 방향이 서로 반대.
- 약점: 실제 register 종류나 양은 보이지 않음, 트리거 단순화.

### 2.7 Computerphile — OS Context Switching (Steve Bagley)
- 출처: Computerphile YouTube
- URL: https://www.youtube.com/watch?v=DKmBRl8j3Ak
- 한 줄 정체성: 손글씨 칠판으로 하는 register 표 베껴 쓰기
- 시각 객체: 종이 위에 CPU register 칸을 그리고, 옆에 process A 의 메모리 영역, process B 의 메모리 영역을 그린다. 칠판 손이 register 표 값을 process A 의 칸에 베껴 쓰고, process B 의 칸에서 register 표로 베껴 온다.
- 시간 표현: 발표자의 펜 진행 = 시간. 실시간 손그림.
- 메타포: 책상 위의 메모지 — 일하던 사람이 자기 메모지에 지금 상태를 적고, 다음 사람이 자기 메모지를 펴서 읽어오기.
- 강조점: "복사" 라는 행위의 물리성 — 글자 단위로 옮긴다.
- 인상 디테일: 같은 register 칸이 서로 다른 메모리 위치 두 곳과 짝을 이룸.
- 약점: 멀티코어, 캐시 무효화는 다루지 않음.

### 2.8 Process Scheduling Visualizer (인터랙티브)
- 출처: simulations4all.com
- URL: https://simulations4all.com/simulations/process-scheduling-visualizer
- 한 줄 정체성: 간트 차트 위에 컨텍스트 스위치 막대를 별도 색으로 새기는 시뮬레이터
- 시각 객체: 가로 간트 차트, 각 프로세스마다 고유 색의 실행 블록, 블록과 블록 사이에 스위치 오버헤드 블록(보통 회색)이 끼어 있음. 사용자가 quantum 을 바꾸면 회색 블록 수가 즉시 변함.
- 시간 표현: 가로축 = 시간(틱).
- 메타포: 공장 컨베이어 — 작업 사이의 세팅 시간이 회색 칸.
- 강조점: 스위치 빈도와 quantum 길이의 트레이드오프.
- 인상 디테일: quantum 슬라이더 조작에 따라 회색 칸 비율이 출렁이는 즉각 피드백.
- 약점: 무엇을 저장하는지(register, PCB) 내부 구조는 보여주지 않음.

### 2.9 한국어 — wikidocs / 위키백과 문맥 교환
- 출처: wikidocs.net, ko.wikipedia.org
- URL: https://wikidocs.net/65528 ,  https://ko.wikipedia.org/wiki/%EB%AC%B8%EB%A7%A5_%EA%B5%90%ED%99%98
- 한 줄 정체성: 한국어 교재 표준형 — 두 프로세스 띠 + PCB 두 칸
- 시각 객체: GeeksforGeeks 형 다이어그램의 한국어 라벨판. "실행", "유휴", "상태 저장", "상태 복원" 라벨이 한국어로 붙음.
- 시간 표현: 가로축 시간.
- 메타포: 없음.
- 강조점: 인터럽트 / 시스템 호출 / I/O 완료가 트리거임을 라벨로 명시.
- 인상 디테일: 사용자 모드와 커널 모드 영역을 배경 음영으로 구분하는 변형판이 종종 등장.
- 약점: 영문 자료의 직역 수준으로 독창성이 낮음.

## 3. 공통 요소

거의 모든 시간 진행형 레퍼런스가 공유하는 시각 언어:

- 두 실행 흐름의 가로(또는 세로) 평행 띠 — 한 시점에 한 띠만 굵음 / 채워짐, 나머지는 얇음 / 점선.
- 단일 CPU 자원이 그 띠 사이를 옮겨 다닌다는 점을 띠 굵기 또는 색 강조로 표현.
- 두 프로세스 띠 외부에 PCB / 커널 스택 박스가 별도로 존재하고, register 묶음이 띠와 박스 사이를 화살표로 오간다.
- 저장 화살표(띠 → 박스)와 복원 화살표(박스 → 띠) 한 쌍이 한 번의 스위치를 이룬다.
- 두 띠 사이의 짧은 회색/빈 구간이 오버헤드를 시각화 — "그동안 아무도 일하지 않는다".
- 트리거(타이머 인터럽트, 시스템 호출)는 위에서 내려오는 번개 / 별표 / 외부 화살표로 표시.

## 4. 공백

레퍼런스 다수가 다루지 않거나 약하게만 다루는 측면:

- 저장과 복원의 비대칭 — 저장은 "지금 있는 값" 을 그대로 떠내는 일방적 캡처지만, 복원은 "그 자리의 값" 을 의도된 register 슬롯에 정확히 되돌려 넣어야 한다. 둘은 서로의 거울이 아니다.
- 컨텍스트 양의 차이 — 프로세스 스위치는 페이지 테이블/주소 공간/파일 디스크립터까지 함께 옮겨가지만 같은 프로세스 내 스레드 스위치는 register set 만 옮긴다. 박스 크기로 양감을 보여주는 사례가 적다.
- 트리거의 다양성 — 타이머, 시스템 호출, I/O 완료, 페이지 폴트가 모두 같은 "스위치" 사건을 일으키지만 시각적으로 같은 번개로 단순화된다.
- 사용자 모드 ↔ 커널 모드 전환 — 같은 시간선 위에 있지만 권한이 바뀐다는 사실의 시각화는 OSTEP 정도에서만 본격적으로 보인다.
- 캐시 / TLB / 분기 예측기의 무효화 — 본문 텍스트로만 언급되고 그림으로는 거의 표현되지 않는다. "스위치 직후 한동안 느려진다" 는 사후 효과의 시각화 부재.
- 멀티코어 — 거의 모든 도식은 단일 CPU 가정이라 코어 간 마이그레이션 비용이 보이지 않는다.
- 두 컷이 아니라 한 사건의 내부 — "저장 → scheduler 결정 → 복원" 이 한 점으로 압축돼 그려져, 사건의 내부 단계가 가려진다.

## 5. 대상 개념 요약

컨텍스트 스위칭은 한 실행 흐름의 register / 프로그램 카운터 / 스택 포인터 등 CPU 가 보고 있는 상태 일습을 그 흐름의 보관소(PCB 또는 커널 스택)에 떠내고, 다른 흐름의 보관소에서 같은 자리로 그 일습을 되돌려 넣는 사건이다. 사건의 핵심은 "CPU 라는 단 하나의 무대에 누구의 상태가 올라와 있는가" 를 시간 위에서 바꿔 끼우는 데 있고, 그 결과 각 흐름은 자신이 멈춘 그 지점에서 그대로 이어 실행된다. 이 사건은 항상 외부 트리거(타이머, 시스템 호출, 인터럽트)에서 출발해 사용자 모드를 잠시 벗어나 커널 코드 안에서 일어나며, 그 잠깐 동안은 어떤 사용자 흐름도 진전하지 않는 비용 구간이 된다.
