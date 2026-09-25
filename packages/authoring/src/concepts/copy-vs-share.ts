/**
 * copyVsShare 개념 선언.
 *
 * canonical facet 은 `facet:copyVsShare` — 몸이 같은 +1 인 함수를 k 번 부르되 건네는 것을 손잡이로 바꾼다.
 * 수 `level`(7)을 건네면 베낀 7 이 불린 쪽 `x` 로 건너가 8 이 되고 틀과 함께 사라져 부른 쪽은 7 그대로다.
 * 목록 `cells`([2, 7, 4])를 건네면 주소만 건너가 불린 쪽이 같은 목록의 2번 칸을 고치고, k 번 부르면 그 칸이
 * 7+k 가 된다. 목록에서 꺼낸 칸 `cells[1]` 을 건네면 다시 베낀 값이라 7 그대로다. 손잡이 pass(수 · 목록 · 목록의 칸,
 * 처음 목록) · times(1~4, 처음 3). 틀은 부른 쪽 · 불린 쪽 둘을 넘지 않는다.
 *
 * ── 묶음 안에서의 자리 (완제품 하나 + 조각 넷)
 *
 * 조각 넷은 각각 한 장면이다 — 대입에서 수가 베껴짐(`valueInPlace`) · 자리에 주소만 듦(`referenceHoldsAddress`) ·
 * 대입으로 이름 둘이 목록 하나(`aliasing`) · `ref` 표식 유무로 가르는 매개변수(`passByValueVsReference`).
 * 이쪽은 그것들을 **함수 부르기 한 곳에 모아, 건네는 것의 종류만 돌려** 가른다. 그래서 definition 은
 * call by sharing · 인자의 종류(수 · 꺼낸 칸 · 목록) · 고친 것이 부를 때마다 쌓인다는 쪽 낱말을 쥐고,
 * 조각들이 독점한 primitive · reassignment · fixed size · two names · alias · by reference · ref 를 쓰지 않는다.
 *
 * 전제 (화면은 각주를 달지 않는다 — 설명 글 `copyVsShare.md` 가 밝힌 것):
 *  - 코드 패널은 IR 하나를 여섯 언어로 옮긴다. 목록 매개변수는 C++ 탭에서 `std::vector<int>&` 다 — C++ 은 `&` 없이
 *    넘기면 벡터를 통째로 베끼므로, 여섯 언어가 같은 뜻이 되도록 그렇게 옮겼다.
 *  - 파이썬 · 자바스크립트 · 자바 · C# 의 목록 매개변수는 주소를 베껴 넘긴다. 그래서 매개변수에 새 목록을 넣으면
 *    부른 쪽은 안 바뀐다. 이 판은 C++ 참조에서 뜻이 갈려 화면에 없다.
 *  - 화면은 칸을 1 부터 센다. 화면의 2번 칸이 코드의 `cells[1]` 이다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const copyVsShareConcept: FacetConceptSource = {
  id: 'copyVsShare',
  label: 'Copy vs Share (What a Function Call Hands Over)',
  canonicalFacet: 'facet:copyVsShare',

  surface: {
    definition:
      'Under call by sharing, a number or a single element taken out of a list is handed over as a copy, but a whole list is handed over as its address, so in-place edits made inside accumulate outside with every call.',
    exemplarKeywords: [
      'call by sharing',
      'pass by object reference',
      'passing a list to a function',
      'function mutates its list argument',
      'passing an array to a function in JavaScript',
      'is Python pass by value or pass by reference',
      'Java passes references by value',
      'passing arr[i] versus passing arr',
      'mutable vs immutable arguments',
      'my list changed after calling the function',
    ],
  },

  briefing: {
    observable: [
      'A caller frame and a callee frame sit side by side, with a list `cells` = [2, 7, 4] drawn as bars in an area marked "outside the slots"; the bars are numbered 1 to 3. The caller frame is titled `passNumber`, `passList` or `passCell` depending on what is being passed.',
      'Passing the number `level` (7): each call "a copy crosses into x: 7" — a copy of 7 lifts out of `level` and flies into a new place `x` in the callee `addOne`. The body turns x into 8, and on return "the frame is taken down; x (8) is gone". The caller\'s level stays 7 however many calls are made.',
      'Passing the list `cells`: the caller\'s place holds an address arrow, and each call reads "only the address crosses, nothing is copied". The callee `addOneAt(cells, 1)` gets an arrow to the same list, the body grows bar 2 by one — "The body writes cell 2 of the caller\'s list: 7 → 8" — and on return "only the name cells drops". After k calls bar 2 stands at 7 + k.',
      'Passing one element `cells[1]`: the number in bar 2 is lifted out and copied into `x`, exactly as with `level`, and bar 2 stays at 7.',
      'Each round ends with the caller reading, "at the start 7, now …". Three readouts track the round: Calls made, Copies (1 per call for the number and the element, 0 for the list) and Caller\'s value.',
      'The screen counts cells from 1, while the code counts indexes from 0, so bar 2 on screen is `cells[1]` in code. Frames never stack: there is one caller and one callee, and the callee opens and closes once per call.',
    ],

    screen: {
      affordances: [
        'Playback controls plus two handles: "Pass" with number, list and one cell (list to begin with), and "Calls" from 1 to 4 (3 to begin with). Each round plays its calls and then waits for a handle.',
        'The move that makes the idea land is switching Pass between list and one cell: the same bar is the starting point both times, yet only passing the whole list makes it grow.',
        'The code panel, labelled "Code", starts empty with a "+ Add language" button and shows the five functions in the chosen language, one meaning carried across Python, JavaScript, TypeScript, Java, C++ and C#. The C++ tab takes the list parameter as `std::vector<int>&` because C++ would otherwise copy the whole vector; the screen does not footnote this.',
      ],
    },

    useWhen: [
      'A reader has learned "numbers are copied, lists are shared" and is caught out by passing one element of a list. Watching `cells[1]` get copied while the whole list does not settles that what matters is what crosses, not where it came from.',
      'The article answers whether Python, JavaScript or Java pass by value or by reference, and needs a function that changes a list for the caller while the same body leaves a plain number alone.',
    ],

    avoidWhen: [
      'The article is about C# `ref`, C++ reference parameters or any explicit marker that lets a number be changed for the caller. No such marker is used; only the kind of argument varies.',
      'The subject is copying a list on purpose — shallow and deep copies, `list.copy()`, spread syntax. Nothing here duplicates a list.',
      'The point is two variables naming one list through ordinary assignment. The second name here exists only as a parameter during a call.',
      'The article is about assigning a brand-new list to a parameter inside the function. In Python, JavaScript, Java and C# that rebinds only the parameter and leaves the caller alone, while a C++ reference parameter would replace the caller\'s list, so the six languages disagree and the case is left out; here the body only edits a cell.',
    ],

    contrastWith: [
      {
        concept: 'passByValueVsReference',
        note: 'Pass by reference is a choice written on the parameter that lends the caller\'s variable itself. Call by sharing involves no such choice: every argument is handed over the same way, and whether the caller sees a change depends only on whether a copied number or an address arrived.',
      },
      {
        concept: 'valueInPlace',
        note: 'A number duplicated by assignment and a number duplicated into a parameter are the same act. The call adds the lifetime question: the parameter\'s duplicate vanishes when the call ends, so repeated calls never add up.',
      },
      {
        concept: 'referenceHoldsAddress',
        note: 'A list variable holding only an address is the precondition; handing that address across a call, so the function reaches the caller\'s list rather than a duplicate, is the consequence this concept is about.',
      },
      {
        concept: 'aliasing',
        note: 'Aliasing through assignment leaves two lasting names in one scope. A list parameter is a second name that exists only for the length of a call, yet its edits outlive it.',
      },
    ],
  },
};
