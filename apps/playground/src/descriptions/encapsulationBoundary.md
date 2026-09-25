## 캡슐화의 경계 — 벽에서 막히고, 문을 지나 들어간다

클래스 몸은 벽으로 둘러싸여 있다. `private` 으로 선언한 칸은 **그 클래스의 몸 안**에서만 닿는다. 밖의 코드는 `public` 이라는 문을 지나서만 안으로 들어간다. 밖에서 `private` 칸에 곧장 손을 뻗으면 벽에서 멈춘다.

{facet:encapsulationBoundary}

### 무엇을 보나

- 위쪽 테두리 안이 `class Account` 의 몸이다. 왼쪽의 두꺼운 선이 벽이고, `public function …` 줄마다 벽에 문이 뚫려 있다. `private balance` 앞은 막혀 있다.
- 멤버에 닿는 자리(`this.balance` · `acct.deposit` 처럼 `.` 으로 멤버를 가리키는 곳)마다 그 글자 밑에서 손이 뻗는다.
- 안의 손 — `this.balance = 0`, `this.balance = this.balance + amount`(쓰기 하나 · 읽기 하나), `return this.balance` — 은 오른쪽 기둥을 타고 올라 `private balance` 칸에 곧장 닿는다. 넷 다 닿는다.
- 밖의 손은 왼쪽 골목을 타고 오른다. `acct.deposit(50)` 과 `show acct.getBalance()` 는 문을 지나 `public` 메서드에 닿는다.
- `acct.balance = 1000` 과 `show acct.balance` 의 손은 `private balance` 앞의 벽에 부딪혀 되돌아온다.
- 마지막 걸음에서 판정이 선다 — 닿음 6 · 거부 2. 거부가 하나라도 있으니 **프로그램은 한 줄도 돌지 않는다.**

### 요점은 "밖에서 바꾸는 길은 문 하나" 다

- 같은 `balance` 가 안에서는 네 번 다 닿고, 밖에서는 두 번 다 막힌다. 가르는 것은 멤버가 아니라 **손이 뻗은 자리**다.
- `balance` 에 쓰는 자리는 셋이다. 안의 둘은 닿고 밖의 하나는 막힌다. 그러니 밖에서 `balance` 가 바뀌는 길은 `acct.deposit(50)` → `public` 문 → 안의 `this.balance = this.balance + amount` 하나뿐이다. 값을 어떻게 바꿀지는 클래스가 정한다.
- 이것은 실행 중에 터지는 오류가 아니다. 흐름이 `acct.balance = 1000` 까지 가서 멈추는 것이 아니라, **돌기 전에** 검사가 거부해 첫 줄도 돌지 않는다. 그래서 화면은 값 `0` 이나 `50` 을 만들어 보이지 않는다.
- 이 "실행 전 거부" 는 자바 · C# · 타입스크립트처럼 컴파일 단계에서 접근을 검사하는 언어의 모습이다. 파이썬처럼 이름 관례(`_balance`)로만 알리고 실제로는 막지 않는 언어도 있다.
- 이 코드는 어느 언어도 아닌 읽히는 표기다. `private` · `public` · `this` · `new` 는 자바 · C# · 타입스크립트가 공유하는 낱말이다.

### 걸음

시작 · `this.balance = 0` · `this.balance = this.balance + amount` · `return this.balance` · `acct.deposit(50)` · `acct.balance = 1000`(거부) · `show acct.getBalance()` · `show acct.balance`(거부) · 판정 — 아홉 걸음. 닿는 자리 여덟(닿음 6 · 거부 2)을 일곱 줄에서 판정한다.
