/**
 * encapsulationBoundary 개념 선언.
 *
 * canonical facet 은 `facet:encapsulationBoundary` — `class Account` 의 `private balance` 와 `public` 메서드 셋
 * (`create` · `deposit` · `getBalance`). 멤버에 닿는 자리 여덟을 글자 차례로 판정한다: 안의 `this.balance` 넷은
 * 닿고, 밖의 `acct.deposit(50)` · `acct.getBalance()` 는 문을 지나 닿고, 밖의 `acct.balance = 1000` ·
 * `show acct.balance` 는 벽에서 거부된다. 판정 "Reached: 6 · Refused: 2. Not a single line runs." 걸음 아홉 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (객체 지향 다섯)
 *
 * **밖에서 private 에 닿는 자리를 실행 전에 거부한다 — 값을 바꾸는 모습이 아니라 판정**을 맡는다. "private ·
 * public · access · outside the class · rejected before the program runs" 를 이쪽이 독점한다. 다른 넷은 모두
 * 프로그램이 도는 화면이라 이쪽만 실행이 없다. 이름이 블록 밖에서 사라지는 `scopeExit` 과는 "밖에서 못 쓴다" 가
 * 겹치므로 contrastWith 로 가른다.
 *
 * 전제: "실행 전 거부" 는 자바 · C# · 타입스크립트처럼 컴파일 단계에서 접근을 검사하는 언어의 모습이다. 파이썬은
 * 이름 관례(`_balance`)로만 알리고 막지 않으며(`__balance` 는 이름을 바꿔 둘 뿐), 타입스크립트의 `private` 은
 * 컴파일 뒤 사라진다. 판정을 자리 하나씩 걸음으로 펼친 것은 보이기 위한 차례이고, 실제 컴파일러는 오류를 한꺼번에 알린다.
 * 코드는 어느 한 언어도 아닌 표기다. 화면은 각주를 달지 않으므로 여기서 밝힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const encapsulationBoundaryConcept: FacetConceptSource = {
  id: 'encapsulationBoundary',
  label: 'Encapsulation (Private Fields Refused From Outside)',
  canonicalFacet: 'facet:encapsulationBoundary',

  surface: {
    definition:
      'Encapsulation marks a field private so only code inside the declaring class may read or write it; an access from outside is rejected before the program runs, leaving public methods as the only route in.',
    exemplarKeywords: [
      'encapsulation',
      'information hiding',
      'access modifiers',
      'private field',
      'public method',
      'getter and setter',
      'is not accessible due to its protection level',
      'has private access',
      'data hiding',
      'underscore naming convention in Python',
    ],
  },

  briefing: {
    observable: [
      'The code declares `class Account` with `private balance` and three `public function` members: `create()` sets `this.balance = 0`, `deposit(amount)` does `this.balance = this.balance + amount`, `getBalance()` returns `this.balance`. Outside it: `let acct = new Account()`, `acct.deposit(50)`, `acct.balance = 1000`, `show acct.getBalance()`, `show acct.balance`.',
      'The class body is enclosed by a wall with a door at each `public function` line; the `private balance` line has no door. Regions are labelled "inside" and "outside". The start caption reads "Nothing has run yet. Each reach into a member is checked first."',
      'Every place that names a member with a dot sends out a hand. The four inside reaches to `balance` (a write in `create`, a write and a read in `deposit`, a read in `getBalance`) all arrive: "From inside Account: write balance (private) — reached."',
      'From outside, `acct.deposit(50)` and `acct.getBalance()` pass through their doors: "From outside: call deposit (public) — through the door." `acct.balance = 1000` and `show acct.balance` hit the wall and come back: "From outside: write balance (private) — stopped at the wall."',
      'The last step is the verdict: "Reached: 6 · Refused: 2. Not a single line runs." No value of balance is ever produced — the program is judged, not run. The only way for outside code to change balance is through `deposit`.',
      'Nine steps, counting the start: one per checked line, then the verdict.',
      'Rejecting before running is how Java, C# and TypeScript treat private members at compile time. Python only signals privacy by naming (`_balance`) and does not block the access; TypeScript\'s `private` disappears after compilation. A compiler reports all such errors together; the screen spreads them out one line at a time. The code is a small language-neutral notation. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen checks every member access by itself and stops on the verdict.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to `acct.balance = 1000` holds the outside hand stopped at the wall.',
        'The class and the outside lines are fixed.',
      ],
    },

    useWhen: [
      'A reader thinks `private` is a runtime lock that trips when the bad line is reached. The verdict arriving before anything runs, with no balance ever computed, shows it is a check on the text.',
      'The article argues that a class should control how its state changes, and needs the same field reachable four times from inside and refused twice from outside, with `deposit` as the only way in.',
    ],

    avoidWhen: [
      'The article is about Python, where a leading underscore is only a convention and outside code can still read and write the field.',
      'The subject is getters and setters with validation logic. `deposit` adds without checking, and there is no setter.',
      'The article is about protected or package/internal visibility, or friends. Only private and public appear.',
    ],

    contrastWith: [
      {
        concept: 'scopeExit',
        note: 'Both make a name unusable in some place. A block-scoped variable has ceased to exist once its block is left; a private field exists for the whole life of the object and is simply off-limits to code outside its class.',
      },
      {
        concept: 'instantiateFromClass',
        note: 'Every object has its own copy of each field whether or not the field is private. Access rules decide which code may touch those copies, not how many there are.',
      },
      {
        concept: 'interfaceSlot',
        note: 'Both narrow what outside code sees of a class. Private forbids reaching particular members; an interface names the members a caller may use and says nothing about the rest.',
      },
    ],
  },
};
