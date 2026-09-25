/**
 * referenceHoldsAddress 개념 선언.
 *
 * canonical facet 은 `facet:referenceHoldsAddress` — `let scores = [90, 75, 60]` · `scores = [100]` ·
 * `scores = [80, 70, 50, 40, 20]`. 목록마다 자리 밖 새 곳(@1000 · @1100 · @1200)에 놓이고, scores 의 자리
 * (@100) 안에는 그 주소 하나만 갈아 꽂힌다. 목록 길이 3 · 1 · 5 와 무관하게 자리 크기는 그대로, 앞 목록은
 * 처음 값 그대로 남는다. 출력 없음. 걸음 넷 (시작 포함).
 *
 * ── 묶음 안에서의 자리 (변수와 타입 — 값 · 주소 · 별칭 셋)
 *
 * "address · reference type · fixed size · reassignment" 를 이쪽이 독점한다. 이름 둘 · 고침 · 비쳐 읽힘은
 * `aliasing` 에, 수 자체가 자리에 드는 것은 `valueInPlace` 에 두고 name(s) · share · mutate · element ·
 * duplicate 를 쓰지 않는다.
 *
 * 전제: 주소 수(@100 · @1000 …)는 예로 정한 값이다. 실제 주소는 실행 환경이 정하고 대개 드러나지 않는다.
 * 아무도 가리키지 않게 된 목록을 누가 치우는지는 화면이 다루지 않는다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const referenceHoldsAddressConcept: FacetConceptSource = {
  id: 'referenceHoldsAddress',
  label: 'Reference Types (The Variable Holds an Address)',
  canonicalFacet: 'facet:referenceHoldsAddress',

  surface: {
    definition:
      'A variable of a reference type stores only the memory address of data kept elsewhere, so its slot stays one fixed size regardless of item count, and reassignment swaps in another address while the earlier data stays intact.',
    exemplarKeywords: [
      'reference type',
      'reference variable',
      'object reference',
      'memory address of an array',
      'variable points to an object on the heap',
      'reassigning an array variable',
      'what does an array variable actually store',
      'reference vs value types in Java or C#',
      'arrays and objects are references in JavaScript',
      'Python variables are references to objects',
    ],
  },

  briefing: {
    observable: [
      'The program is three lines: `let scores = [90, 75, 60]`, `scores = [100]`, `scores = [80, 70, 50, 40, 20]`. Below it are the slot of scores, labelled "slot @100", and an area marked "outside the slot".',
      'Line 1 places a list of 3 items at @1000 outside the slot; an address chip @1000 detaches from that list\'s label and plugs into the slot. The caption says the slot holds only the address @1000.',
      'Line 2 places a new list of 1 item at @1100, and the chip in the slot is replaced: "Slot of scores: @1000 → @1100. The list at @1000 stays as it was." Line 3 does the same with a list of 5 items at @1200.',
      'The slot never grows or shrinks while the list lengths go 3, 1, 5; it always holds one address chip.',
      'At the end all three lists are still in place with their original items, and the slot holds @1200. There is no output. Four steps in all, counting the start.',
      'The addresses @100, @1000, @1100 and @1200 are example values chosen for the drawing; real addresses are decided at run time and usually never shown. The code is written in a small language-neutral notation rather than in any one real language.',
    ],

    screen: {
      affordances: [
        'The screen plays the three lines by itself and stops with @1200 in the slot.',
        'A Replay button and a playback strip sit below it. Once finished, dragging the strip back to any line holds the moment the old chip is pushed out and the new one plugs in.',
        'The program and its lists are fixed.',
      ],
    },

    useWhen: [
      'The reader pictures a list variable as a box that contains the whole list. A slot that stays the same size while the list goes from 3 items to 1 to 5 shows that only an address lives there.',
      'The article explains that reassigning an array or object variable does not overwrite the old data, and wants the earlier lists left visibly in place.',
    ],

    avoidWhen: [
      'The point is that changing a list through one variable is visible through another. Only one variable and whole-list reassignment appear here; no item is ever changed.',
      'The subject is garbage collection or freeing unreachable data. The abandoned lists simply stay; nothing removes them.',
      'The article needs pointer arithmetic or explicit pointer syntax such as `*p` or `&x`. The address is only held and replaced, never followed or computed.',
    ],

    contrastWith: [
      {
        concept: 'valueInPlace',
        note: 'For a number the value itself sits in the variable; here only the location of the data does. That single difference is what makes a list variable a fixed-size handle.',
      },
      {
        concept: 'aliasing',
        note: 'Storing an address is the precondition; two variables storing the same address is the consequence. This concept concerns one variable and what reassignment does to it, not what two variables see.',
      },
      {
        concept: 'danglingReference',
        note: 'Both turn on a variable holding an address. Here the data at that address is left untouched; there the storage behind the address is released and reused while the address is still held.',
      },
      {
        concept: 'pointerDereference',
        note: 'Holding an address and following it are two separate acts. This concept only stores and replaces the address; dereferencing reads it and goes to the location it names.',
      },
      {
        concept: 'copyVsShare',
        note: 'A variable holding only an address is the precondition; handing that address across a function call, so the callee edits the caller\'s list rather than a duplicate, is where it matters.',
      },
    ],
  },
};
