## 1. 검색 결과

조사 범위는 (a) 표준/학술 (Wikipedia, OS 교과서 페이지 교체), (b) 인기 해설 (LeetCode 146, NeetCode, GeeksforGeeks, Interview Cake, AlgoMaster), (c) 시스템 설계 콘텐츠 (ByteByteGo), (d) 메타포 자료 (도서관/책상 비유), (e) 인터랙티브 비주얼라이저 (Netlify 비주얼라이저, dev.to illustrated 글), (f) 한국어 자료 (Velog, F-Lab) 로 분포한다. 모두 type=dataStructure / 입력 반응형 결정과 정합 — get/put 시퀀스에 따른 hash + doubly linked list 변형, 그리고 "최근성" 정렬을 시각화하는 자료들 위주로 수집했다.

수집한 URL 9개:

- https://en.wikipedia.org/wiki/Cache_replacement_policies
- https://leetcode.com/problems/lru-cache/
- https://neetcode.io/solutions/lru-cache
- https://www.geeksforgeeks.org/system-design/lru-cache-implementation/
- https://www.interviewcake.com/concept/java/lru-cache
- https://dev.to/kokaneka/lru-cache-illustrated-for-the-visual-learner-242c
- https://blog.bytebytego.com/p/a-guide-to-top-caching-strategies
- https://medium.com/@rajeevprasanna/understanding-caching-through-the-library-analogy-a-guide-to-optimal-data-retrieval-d4a0bb771bac
- https://velog.io/@haero_kim/LRU-Cache-%EC%9D%B4%ED%95%B4%ED%95%98%EA%B8%B0

## 2. 레퍼런스 요약

### R1. Wikipedia — Cache replacement policies
- URL: https://en.wikipedia.org/wiki/Cache_replacement_policies
- 정체성: 정책 공간의 카탈로그 — LRU 를 FIFO/LIFO/LFU/SLRU/RRIP 등과 나란히 두는 분류표.
- 시각 객체: 정책별 박스 다이어그램, 평균 메모리 참조 시간 수식 (T = m·T_m + T_h + E).
- 시간 표현: 거의 없음 — 정책의 정의/수식만, 동적 변형은 별도 페이지로 위임.
- 메타포: "discard least recently used items first" 라는 정책 어휘 자체.
- 강조점: hit ratio vs latency 트레이드오프, 정책 간 분류.
- 디테일: stack algorithm 속성 (Belady 이상 없음) 명시.
- 약점: 자료구조 (hash + doubly list) 의 상태 변형을 보여주지 않음 — 자료구조보다 정책 어휘에 머문다.

### R2. LeetCode 146 — LRU Cache
- URL: https://leetcode.com/problems/lru-cache/
- 정체성: 표준 인터뷰 문제 — get/put 입력 시퀀스와 기대 출력 표.
- 시각 객체: 텍스트 입출력 트레이스 (예: `[1,1],[2,2],get(1),[3,3],get(2)...` → `1,-1,...`), 캐시 상태 주석.
- 시간 표현: 호출 인덱스 i = 0,1,2,... 의 외부 시간 — 자율 진행 없음.
- 메타포: 없음. 명세 자체.
- 강조점: O(1) 평균 시간 제약, capacity 초과 시 eviction 발생 시점.
- 디테일: 기대 출력 트레이스가 학습자가 "최근성" 의미를 자기 시뮬레이션하게 강제.
- 약점: 자료구조 그림이 전무 — 학습자가 머릿속에서 그려야 함.

### R3. NeetCode — 146 LRU Cache 풀이
- URL: https://neetcode.io/solutions/lru-cache
- 정체성: 표준 풀이의 정전 — head/tail dummy + hash map of pointers.
- 시각 객체: 가로 doubly linked list (left dummy ↔ … ↔ right dummy), hash map 박스가 노드로 향한 화살표.
- 시간 표현: get/put 호출 단위로 노드를 unlink → 재삽입하는 두 단계 변형.
- 메타포: head=left=LRU, tail=right=MRU (역방향 관행도 존재) 의 공간 정렬.
- 강조점: 두 dummy 가 경계 처리 단순화, hash 가 노드 포인터를 들고 있어 O(1).
- 디테일: "get 도 노드를 옮겨야 한다" 는 흔한 실수 경고.
- 약점: hash 와 list 가 가리키는 동일 객체임을 강조하느라 "최근성" 자체의 의미는 부차적으로 다룸.

### R4. GeeksforGeeks — LRU Cache Implementation
- URL: https://www.geeksforgeeks.org/system-design/lru-cache-implementation/
- 정체성: 9 단계 시퀀스 워크스루 — 각 호출에서 우선순위 (priority) 가 어떻게 갱신되는지 한 줄씩 표기.
- 시각 객체: 순차 박스, "new priority order = {3:E},{4:D},{2:B}" 형식의 텍스트 스냅샷.
- 시간 표현: 입력 단계 i 마다 한 장의 스냅샷.
- 메타포: "priority" 라는 추상 어휘로 head→tail 정렬을 부른다.
- 강조점: capacity 도달 → eviction 이라는 분기점.
- 디테일: 어떤 노드가 왜 빠지는지 라벨로 명시.
- 약점: hash map 영역이 텍스트로만 존재 — 두 자료구조의 결합이 시각적으로 약하다.

### R5. Interview Cake — LRU Cache Data Structure
- URL: https://www.interviewcake.com/concept/java/lru-cache
- 정체성: "두 자료구조의 결합으로 모든 연산을 O(1) 로" 라는 설계 동기 중심 해설.
- 시각 객체: hash map ↔ list 의 화살표 다이어그램, 연산 / 시간복잡도 표.
- 시간 표현: 정적 — 변형보다 invariant 강조.
- 메타포: cache = 빠른 저장소.
- 강조점: 단일 자료구조로는 못 내는 O(1) 의 동시 만족.
- 디테일: 메모리 비용 (자료구조 두 개) 을 단점으로 명시.
- 약점: 동적 시퀀스 그림이 없어 "왜 doubly 인가" 의 직관이 약하다.

### R6. dev.to — LRU Cache Illustrated For The Visual Learner
- URL: https://dev.to/kokaneka/lru-cache-illustrated-for-the-visual-learner-242c
- 정체성: 시각 학습자 대상 — 가로 큐 박스로 left=LRU / right=MRU 일관 표기.
- 시각 객체: 컬러 박스 큐, 방향 화살표, get/put 별 색 변경.
- 시간 표현: 좌→우 시간 흐름 (오른쪽으로 갈수록 최근).
- 메타포: 줄 (waiting line) — 최근에 응대한 손님이 뒤로 간다.
- 강조점: get 의 "삭제 후 재삽입" 메커니즘이 list 를 어떻게 회전시키는가.
- 디테일: JS Map 의 insertion-order 속성을 활용한 간이 구현.
- 약점: hash 와 list 의 결합 그림은 약하고, 큐 메타포로 단순화한 탓에 doubly 의 필요성이 가려진다.

### R7. ByteByteGo — A Guide to Top Caching Strategies / Cache Eviction Policies
- URL: https://blog.bytebytego.com/p/a-guide-to-top-caching-strategies
- 정체성: 시스템 설계 관점 — LRU 를 write-through / cache-aside / write-back / SLRU / LFU 와 한 화면에 배치.
- 시각 객체: 정책 비교 매트릭스, 데이터 흐름 다이어그램 (DB ↔ cache ↔ client).
- 시간 표현: 요청 흐름의 한 사이클.
- 메타포: 캐시 = "DB 부담을 덜어주는 고속 완충".
- 강조점: 정책 선택의 트레이드오프, temporal locality 가정.
- 디테일: SLRU 의 probationary/protected 두 구획 도식.
- 약점: 자료구조 내부 변형은 거의 다루지 않음 — 정책의 외부 위치만 보여준다.

### R8. Medium (Rajeev Kumar) — Caching Through The Library Analogy
- URL: https://medium.com/@rajeevprasanna/understanding-caching-through-the-library-analogy-a-guide-to-optimal-data-retrieval-d4a0bb771bac
- 정체성: 도서관/책상 메타포 — 캐시 = 책상, DB = 도서관, eviction = "가장 오래 안 펼친 책 반납".
- 시각 객체: 책상 위 책 더미 일러스트.
- 시간 표현: "오래 안 펼친" 이라는 일상 시간감.
- 메타포: 책장 위 손이 잘 닿는 자리 ↔ 안쪽 자리.
- 강조점: hit / miss / eviction rate 의 일상 비유.
- 디테일: data staleness 를 메타포 안에 자연스럽게 끼워 넣는다.
- 약점: 자료구조와의 매핑이 약해 코드 단계로의 이행이 끊긴다.

### R9. Velog (haero_kim) — LRU Cache 이해하기 (한국어)
- URL: https://velog.io/@haero_kim/LRU-Cache-%EC%9D%B4%ED%95%B4%ED%95%98%EA%B8%B0
- 정체성: 한국어 입문 — head=최근 / tail=오래됨, Android `LruCache` (LinkedHashMap) 구현 연결.
- 시각 객체: 좌→우 노드 박스, 접근 시 head 로 이동시키는 화살표.
- 시간 표현: 접근 단계별 노드 이동 그림.
- 메타포: "필요한 데이터를 옆에 둔다".
- 강조점: O(1) 보장의 자료구조적 근거, 모바일/이미지 캐싱 같은 실전 응용.
- 디테일: Glide 비트맵 캐시 사례.
- 약점: hash map 부분이 비교적 옅게 묘사된다.

## 3. 공통 요소

거의 모든 레퍼런스에 공유되는 시각 언어:

1. **가로 정렬된 노드 큐** — 좌우 한쪽 끝이 MRU, 반대쪽이 LRU. 좌=LRU/우=MRU 와 좌=MRU/우=LRU 두 관행이 공존.
2. **hash map ↔ list 의 두 영역 + 화살표** — hash 의 값이 list 노드 포인터임을 점선/화살표로 표시.
3. **호출 단위 스냅샷** — get(k) / put(k,v) 한 번에 한 장의 그림. 자율적 시간 흐름이 아니라 외부 입력에 묶인 변형.
4. **이동(promotion) + 축출(eviction) 두 동작** — 접근된 노드를 한쪽 끝으로 끌어올리고, 용량 초과 시 반대쪽 끝 노드를 떨어낸다.
5. **head/tail dummy(sentinel) 노드** — 경계 처리 도식.
6. **시간복잡도 라벨 O(1)** — 거의 모든 자료가 명시.
7. **policy 어휘** — "최근성", "priority", "recency", "오래된 것".

## 4. 공백

레퍼런스가 잘 다루지 않는 측면:

1. **"최근성" 자체의 의미장** — 시간 축 위의 마지막 접근 시각이라는 추상이, 어떻게 "리스트 위치" 라는 공간 인덱스로 환원되는지의 변환 자체를 명시적으로 시각화한 자료가 드물다.
2. **두 자료구조의 동기화** — hash 와 list 가 같은 노드를 가리킨다는 invariant 를, "한 노드의 두 좌표 (key 좌표 / 순서 좌표)" 처럼 입체적으로 보이는 자료가 거의 없다.
3. **get 의 부수효과 가시화** — get 이 단순 조회가 아니라 "노드를 끌어올리는" 쓰기성 행위라는 점을 강조하는 자료는 NeetCode 외에는 옅다.
4. **eviction 임계의 긴장감** — 용량 직전 / 용량 도달 / 용량 초과의 세 단계 긴장이 보통 한 장의 같은 그림으로 처리되어, "꽉 차서 누군가 떨어진다" 의 결정적 순간이 약하다.
5. **반사실 (counterfactual)** — "이 호출이 LRU 가 아니라 FIFO 였다면 누가 빠졌을까" 같은 정책 비교 기반 직관 부재. ByteByteGo 만 정적 카탈로그로 다룸.
6. **메타포와 자료구조의 이중 표기** — 도서관/책상 비유와 hash+list 도식이 같은 화면에서 동시에 매핑되는 자료가 드물다 (보통 둘 중 하나).
7. **실패 모드** — 잘못된 구현 (예: get 에서 위치 갱신 누락, hash 만 갱신하고 list 미갱신) 의 시각적 결과를 보여주는 자료가 거의 없다.

## 5. 대상 개념 요약

LRU 캐시는 용량 제한이 있는 키-값 저장소에서 "최근에 사용된 순서" 를 일급 정보로 유지하는 자료구조다. 이 추상은 hash map (키 → 노드 포인터) 과 doubly linked list (사용 순서) 의 결합으로 구체화되어, get / put 두 외부 호출에 대해 모두 O(1) 상수 시간을 보장한다. 핵심 메커니즘은 접근된 노드를 리스트의 한쪽 끝 (MRU 끝) 으로 옮기는 promotion 과, 용량 초과 시 반대쪽 끝 (LRU 끝) 의 노드를 축출하는 eviction 이다. 따라서 시각화의 본질은 "추상적 최근성 → 리스트 위치" 라는 좌표 변환과, 두 자료구조가 같은 노드를 두 가지 좌표계로 가리키며 동기화된다는 invariant 를 외부 호출 시퀀스에 따라 보여주는 데 있다.
