/**
 * danglingReference 개념 선언.
 *
 * canonical facet 은 `facet:danglingReference` — `function make()` 는 `let secret = 7` 뒤 `return address(secret)`,
 * `function other()` 는 `let junk = 99`. 맨 바깥은 `let p = make()` · `other()` · `show valueAt(p)`. make 가
 * 돌아오며 틀이 걷혀도 자리 @101 의 7 은 남고 p 는 @101 을 든다. other 의 junk 가 같은 @101 을 잡아 99 를 쓰고
 * 걷힌 뒤, p 로 따라간 읽기는 99 를 낸다. p 는 한 번도 바뀌지 않는다. 걸음 아홉 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (변수와 타입 — 몸 · 틀 셋)
 *
 * "pointer to a local · outlives the call · stack frame reused · stale read" 를 이쪽이 독점한다. 이름이 사라져
 * 오류가 나는 것은 `scopeExit` 에, 같은 이름이 가리는 것은 `shadowing` 에 두고 block · name · error · hide 를
 * definition 에서 쓰지 않는다. 같은 서브도메인 `referenceHoldsAddress` 가 address 를 가지므로 이쪽 definition 은
 * pointer 로 쓴다. 틀이 끝난 뒤에도 변수를 살려 두는 `closureCaptures` 와는 alive · enclosing 을 피해 가른다.
 *
 * 전제: 걷힌 자리를 다음 틀이 그대로 다시 쓰는 것은 예로 정한 모형이고 주소 @100 · @101 도 예로 정한 값이다.
 * C · C++ 에서 이 읽기는 정해지지 않은 동작이고, 러스트는 빌림 검사기가 실행 전에 거절하며, 가비지 컬렉터가 있는
 * 언어는 이런 주소를 만들지 않는다. `free` 는 어디서도 부르지 않는다 — 자리는 함수가 돌아올 때 저절로 걷힌다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const danglingReferenceConcept: FacetConceptSource = {
  id: 'danglingReference',
  label: 'Dangling Reference (Pointing at a Released Local)',
  canonicalFacet: 'facet:danglingReference',

  surface: {
    definition:
      'A dangling reference is a pointer that outlives the stack storage it points to: once its routine finishes, a later call reuses that storage, so following the pointer yields whatever the later call left there.',
    exemplarKeywords: [
      'dangling pointer',
      'dangling reference',
      'returning a pointer to a local variable',
      'returning a reference to a local in C++',
      'address of stack memory associated with local variable returned',
      'use after scope',
      'stack frame reuse',
      'undefined behavior',
      'Rust borrow checker: does not live long enough',
      'lifetime of a local variable',
    ],
  },

  briefing: {
    observable: [
      'The code defines `function make()` with `let secret = 7` and `return address(secret)`, and `function other()` with `let junk = 99`; the outer lines are `let p = make()`, `other()`, `show valueAt(p)`. On the right, slots stand in address order, and function frames come down over them when called.',
      '`let p = make()` first takes slot @100 for p, still empty, then make() is called and its frame is set up. Inside, secret takes slot @101 and gets 7, and make() hands back @101, the address of secret.',
      'On return the frame of make() is lifted and the name secret is gone, "yet slot @101 still holds 7"; the slot is marked "no name". p now holds @101, and an arrow from p to @101 appears. The arrow never moves again.',
      'other() is called; inside it junk takes slot @101 and gets 99 — "the very slot p points to" — pushing the old 7 down. other() returns, its frame is lifted, and @101 keeps 99 with no name.',
      '`show valueAt(p)` follows the address in p and prints 99; the caption says this is not the 7 that was there when p got it. Each value is coloured by the frame that wrote it, so the printed 99 carries the colour of other().',
      'Nine steps in all, counting the start. `address(x)` and `valueAt(p)` are built-ins of the notation, which is not any one real language. No `free` is called anywhere; slots are released only because a function returned.',
      'Reusing the released slot for the very next frame is a model chosen to make the effect visible, and @100 and @101 are example values. In C and C++ this read is undefined behaviour — it may give 99, 7, a crash, or code the compiler rearranged. Rust rejects the program before it runs, and garbage-collected languages never produce such an address. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the program by itself and stops after printing 99.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to the step where junk writes 99 holds the moment another variable takes the slot p still points at.',
        'The program and its values are fixed.',
      ],
    },

    useWhen: [
      'The reader wonders why returning `&local` in C or a reference to a local in C++ is forbidden or warned about. p never changing while the value behind it turns from 7 into 99 shows what goes wrong.',
      'The article introduces Rust lifetimes or the "does not live long enough" error and wants to show the bug the borrow checker is preventing.',
    ],

    avoidWhen: [
      'The subject is use-after-free of heap memory released with `free` or `delete`. Nothing here is allocated or freed by hand; only a returning function releases a slot.',
      'The article is about Java, Python or JavaScript references. Those languages keep the target alive while referenced, so this situation does not arise.',
      'The article needs the actual behaviour of a particular compiler. The reuse of the slot is a chosen model; real outcomes are undefined.',
    ],

    contrastWith: [
      {
        concept: 'scopeExit',
        note: 'When a variable\'s lifetime ends, a name that refers to it is caught as unresolvable; a stored location that refers to it is not caught at all, and silently reads whatever occupies that storage next.',
      },
      {
        concept: 'closureCaptures',
        note: 'Both keep a handle to a local variable after its function has returned. A closure extends the variable\'s lifetime to match; a raw pointer does not, so the variable ends and the pointer is left over.',
      },
      {
        concept: 'referenceHoldsAddress',
        note: 'Holding an address is harmless as long as whatever lives there is kept. The hazard begins when the storage is released while the address is still held.',
      },
      {
        concept: 'callStackUnwind',
        note: 'Frames are removed newest first as calls return. This concept is about what remains at the address of a removed frame\'s variable once another call occupies it.',
      },
      {
        concept: 'stackVsHeap',
        note: 'A returning function may safely hand back the location of heap memory it requested, because that memory outlasts the call. Handing back the location of its own local is what fails, because the frame holding it does not.',
      },
    ],
  },
};
