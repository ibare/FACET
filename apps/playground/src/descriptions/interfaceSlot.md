## 인터페이스 — 약속만 있고 몸은 꽂아 넣는다

인터페이스는 **이름과 인자만** 정한다. `interface Light` 안의 `function on()` · `function off()` 에는 몸이 없다 — 무엇을 할지는 적혀 있지 않고, 그 이름으로 부를 수 있다는 약속만 있다. 도는 몸은 그 약속을 채운 클래스가 준다.

{facet:interfaceSlot}

### 무엇을 보나

- 가운데 `interface Light` 의 서명 둘 옆에 **빈칸**이 하나씩 있다. 아래 `Lamp` · `Neon` 카드에는 같은 이름의 메서드가 있고, 그 몸(`show …` 한 줄)이 몸통 조각으로 들어 있다.
- `flip(new Lamp())` — `Lamp` 객체가 `flip` 의 `light` 로 넘어가는 순간 `Lamp` 의 몸 둘이 카드에서 떠올라 약속의 칸 둘에 **한꺼번에** 꽂힌다.
- `light.on()` · `light.off()` — `flip` 의 줄은 칸을 거쳐 꽂힌 몸을 돌린다. 출력은 `lamp glows` · `lamp dims`.
- `flip(new Neon())` — 칸의 몸이 **통째로 갈아 끼워진다.** `Lamp` 의 몸은 제 카드로 내려가고 `Neon` 의 몸이 올라온다. 같은 두 줄이 이번에는 `neon buzzes` · `neon fades` 를 보인다.
- `flip` 의 글자는 처음부터 끝까지 한 글자도 바뀌지 않는다. 부른 줄은 둘(`light.on()` · `light.off()`, 두 번씩), 돈 몸은 넷이다.

### 약속을 채운다는 것

- `class Lamp implements Light` 는 "`Light` 의 서명마다 같은 이름 · 같은 인자 수의 메서드를 갖겠다" 는 선언이다. 하나라도 빠지면 프로그램은 돌기 전에 거부된다. 이 조각의 두 클래스는 둘 다 채운다.
- 그래서 `flip` 은 넘어온 것이 `Lamp` 인지 `Neon` 인지 몰라도 된다. 약속에 있는 이름만 부르고, 어느 몸이 돌지는 꽂힌 구현이 정한다.
- 상속의 부모와 다르다. 부모 클래스에는 몸이 있을 수 있고 자식이 그것을 덮어쓴다. 인터페이스에는 처음부터 몸이 없다 — 빈칸뿐이라, 꽂힌 몸 없이는 돌 것이 없다.

### 걸음

시작(빈칸 둘) · `flip(new Lamp())` 꽂음 · `light.on()` → `lamp glows` · `light.off()` → `lamp dims` · `flip(new Neon())` 갈아 끼움 · `light.on()` → `neon buzzes` · `light.off()` → `neon fades` — 일곱 걸음. 약속의 서명 2, 약속의 몸 줄 0, 구현 2.

코드는 특정 언어가 아닌 읽히는 표기로 적었다. 자바 · C# · 타입스크립트의 `interface` 와 `implements` 가 같은 모양이다.
