## 메서드 찾기 — 받는 객체에서 위로

`s.label()` 한 줄은 글자만 보고는 어느 몸이 돌지 정해지지 않는다. 정하는 것은 **받는 객체**다. 객체는 제가 찍혀 나온
클래스를 가리키고, 찾기는 그 클래스에서 출발해 부모로 한 층씩 올라가다 **그 이름이 처음 나온 층**에서 멈춘다. 뿌리까지
보고도 없으면 `NoMethod` 로 실패한다.

화면의 프로그램은 이렇다 (가상 표기).

```
interface Figure
    function area()
    function label()
class Shape implements Figure
    function area()
        show "unknown area"
    function label()
        show "shape"
class Polygon extends Shape
    function corners()
        show "has corners"
    function label()
        show "polygon"
class Square extends Polygon
    function area()
        show "side * side"
let s = new Square()
s.label()
```

**받는 객체** 손잡이를 돌리면 새 객체가 그 클래스 상자에서 찍혀 나오고 클래스 표식이 새 상자로 옮겨 간다. 찾기 표식은 그
상자에서 다시 출발해 위로 오르고, 부르는 줄 끝의 가지가 앞 판의 몸에서 새 몸으로 옮겨 뻗는다. **부르는 이름** 손잡이를
돌리면 마지막 줄의 이름만 바뀌고 찾기가 처음부터 다시 돈다.

{facet:polymorphism}

### 무엇을 세나

- **들여다본 클래스** — 출발한 클래스를 포함해 센다. 찾으면 거기서 멈춘다.
- **올라간 층** — 들여다본 클래스 − 1. `Square` 에서 `label` 을 부르면 `Square` 에 없고 `Polygon` 에 있으니 들여다본
  클래스 2 · 올라간 층 1.
- **찾기 실패** — 뿌리까지 보고도 없을 때 1. 이 가족에서는 `Shape` 객체로 `corners` 를 부를 때 한 번뿐이다.

찾기는 부를 때마다 받는 객체의 클래스에서 **새로** 시작한다. 앞 판이 어디서 찾았는지 기억하지 않는다. 같은 층에 같은
이름이 둘일 수는 없고(데이터 오류로 거부한다), 그래서 "먼저 나온 층" 을 가를 동률은 생기지 않는다.

### 겹쳐 쓰기와 약속

`area` 는 `Shape` 에도 `Square` 에도 있다. `Square` 객체로 부르면 `Square` 에서 먼저 찾으니 위의 `Shape.area` 는 들여다보지도
않는다 — 아래 층이 이긴다. `Polygon` 객체에는 `area` 가 없어 한 층 올라 `Shape.area` 가 돈다.

`Figure` 는 몸 없는 서명 둘(`area` · `label`)만 가진 약속이다. 약속한 이름을 부르면 찾아낸 몸이 그 이름의 칸에 꽂힌다. 받는
객체를 바꾸면 칸의 몸이 갈아 끼워진다. 약속한 이름은 어느 받는 객체로도 찾아지고(실패 0/3), 약속 밖의 `corners` 는 받는
객체가 `Shape` 일 때 실패한다(1/3). 한 판에는 부른 이름의 칸 하나만 채운다 — 부르지 않은 이름을 미리 찾아 두지 않는다.

### 언어마다 다른 자리

- 화면은 찾기를 **부를 때** 일어나는 것으로 그렸다. 자바 · C# · C++ · 타입스크립트는 선언된 형으로 **돌기 전에** 같은 찾기를
  해서 `Shape` 형 변수로 `corners` 를 부르는 줄을 컴파일 오류로 거부한다. 파이썬 · 자바스크립트는 돌다가 실패한다.
- C++ 은 `virtual` 이 없으면, C# 은 `virtual`/`override` 가 없으면 부모 형 변수로 부를 때 화면과 다른 몸(부모의 몸)이 돈다.
  C# 에서 `override` 없이 같은 이름을 쓰면 `new` 로 부모의 것을 **가린다.** 화면은 여섯 언어가 같은 뜻인 경우(가상 호출)만
  그렸다. 그래서 이 facet 에는 코드 패널이 없다 — 한 IR 로 여섯 언어의 같은 뜻을 옮길 수 없다.
- 파이썬에는 `interface` 라는 낱말이 없다. 추상 기반 클래스(`abc`)나 프로토콜이 그 자리를 맡는다.
- 코드는 어느 언어도 아닌 가상 표기로 적었다 — `function` · `class … extends …` · `implements` · `new` · `show`.
