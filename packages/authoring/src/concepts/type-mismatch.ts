/**
 * typeMismatch 개념 선언.
 *
 * canonical facet 은 `facet:typeMismatch` — 여섯 줄을 줄마다 자리에 끼워 본다. 네 줄은 들어가고(int · string · bool · float),
 * L5 `let next: int = count + ready` 의 `+` 에서 int 와 bool 이 끼워지지 않아 그 한 자리가 걸린다. 검사기는 L6 까지 읽고,
 * 판정에서 프로그램 전체가 거부된다. "Lines run" 은 끝까지 0 이다. 8 걸음.
 *
 * ── 묶음 안에서의 자리
 *
 * `typeChecking`(완제품)은 규칙표를 바꾸면 걸린 자리가 옮겨 가는 대비를, `typeFlowsUp` 은 오름 하나를 쥔다.
 * 이쪽은 **걸림의 결과** — 한 자리 때문에 한 줄도 돌지 않는다, 걸린 줄보다 위 줄도 — 를 쥔다. 그래서 definition 은
 * compile time · rejected · no line runs · above 를 쥐고, 규칙표 이름(strict · widening)이나 잎 · 뿌리를 쓰지 않는다.
 *
 * 전제: 규칙은 장난감 언어의 것(bool 은 수가 아니고 int 는 float 로만 넓혀진다). 자바스크립트 · 파이썬에서는 `3 + true` 가 4 라
 * 이 프로그램이 돈다. 첫 오류에서 멈추는 컴파일러도 있다.
 */

import type { FacetConceptSource } from '../concept-types.js';

export const typeMismatchConcept: FacetConceptSource = {
  id: 'typeMismatch',
  label: 'One Type Mismatch Rejects the Whole Program',
  canonicalFacet: 'facet:typeMismatch',

  surface: {
    definition:
      'A single operator given an incompatible pair, such as int plus bool, is a compile-time error that rejects the entire program before execution, so no line runs, including lines above the error that passed.',
    exemplarKeywords: [
      'type mismatch',
      'compile error',
      'incompatible types',
      'cannot add int and bool',
      'program does not compile',
      'compile-time vs runtime error',
      'why does nothing run',
      'static typing catches errors early',
      'type error before execution',
      'operator not defined for these operands',
    ],
  },

  briefing: {
    observable: [
      'Six lines are checked one per step before anything runs: `let count: int = 3`, `let name: string = "box"`, `let ready: bool = count > 0`, `let size: float = count * 1.5`, `let next: int = count + ready`, `show name`.',
      'The first four fit their slots — `3` into int, `"box"` into string, `count > 0` into bool, and `count * 1.5` widens int into float and fits the float slot. Each of the four types goes into a slot once.',
      'On line 5 the `+` receives int and bool and has no rule for them. The mark lands on that operator, not the whole line, and the int slot for `next` is labelled "not tried". The checker records `next` as declared int and carries on.',
      'Line 6, `show name`, fits because `show` takes any type. The counters end at "Checked: 6" and "Snags: 1", with five lines passing.',
      'The verdict reads that the whole program is rejected before it runs, and "Lines run" stays at 0 from start to finish — the four lines above the snag, which passed, do not run either. Eight steps in all, including step 0.',
      'The rules are a toy language close to Java and C#: bool is not a number, and int widens only when it meets float. In JavaScript and Python `3 + true` is 4 and this program would run; C would silently cut a float into an int slot. The screen does not footnote this.',
    ],

    screen: {
      affordances: [
        'The screen plays the check by itself, one line per step, and stops on the verdict.',
        'A Replay button and a playback strip sit below it. Holding the strip on the verdict step shows "Rejected" beside "Lines run: 0".',
        'The program is fixed, so every slot, counter and message can be quoted as it appears.',
      ],
    },

    useWhen: [
      'A reader expects the compiler to run the good lines and skip the bad one, or to run up to the error and stop, and the article needs the counter of executed lines staying at zero.',
      'The article contrasts statically typed languages, where `count + ready` is refused before running, with languages that would quietly compute it.',
    ],

    avoidWhen: [
      'The subject is an exception or crash at run time. The failure here happens before any line executes.',
      'The article is about comparing several languages\' conversion rules. Only one rule set is used.',
      'The point is how a type is worked out for an unannotated name. Every name here has its type written.',
    ],

    contrastWith: [
      {
        concept: 'typeChecking',
        note: 'A mismatch is the outcome of one failed pair; which pairs fail at all depends on the conversion table the language chose.',
      },
      {
        concept: 'typeFlowsUp',
        note: 'Inference succeeds whenever every operator has a rule for its operands. A mismatch is the point where one operator has none and the program stops being acceptable.',
      },
      {
        concept: 'exceptionPropagate',
        note: 'An exception interrupts a program that has already started running. A type mismatch is found before the start, so no line gets the chance to run.',
      },
    ],
  },
};
